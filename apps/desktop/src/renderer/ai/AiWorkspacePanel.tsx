import type { AiChangeProposal, AiContextAttachment, AiConversationMessage } from '@cortex/ai';
import {
  Check,
  ChevronDown,
  CircleStop,
  FileCode2,
  History,
  PanelRightClose,
  Plus,
  Send,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { parseHandlingDocument } from '@cortex/vehicle-meta';
import { normalizePreferences, type AccountStatus } from '../../shared/contracts';
import { usePreferences, PREFERENCES_QUERY_KEY } from '../hooks/usePreferences';
import { useQueryClient } from '@tanstack/react-query';
import { formatResultError } from '../lib/result';
import { ActionButton } from '../components/ActionButton';
import { Select } from '../components/Select';
import { useWorkspaceStore } from '../store/workspace';
import { getCortexAiModuleProvider } from './module-registry';
import { useAiStore, type AiThread } from './ai-store';
import {
  Attachment,
  Bubble,
  BubbleContent,
  Marker,
  Message,
  MessageContent,
  MessageHeader,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '../components/ui/AiChatPrimitives';

function createAttachment(
  kind: AiContextAttachment['kind'],
  label: string,
  reference: string | null,
): AiContextAttachment {
  return { id: `${kind}:${reference ?? label}`, kind, label, reference };
}

function countLineChanges(before: string, after: string): { added: number; removed: number } {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  let common = 0;
  const beforeCounts = new Map<string, number>();
  for (const line of beforeLines) beforeCounts.set(line, (beforeCounts.get(line) ?? 0) + 1);
  for (const line of afterLines) {
    const available = beforeCounts.get(line) ?? 0;
    if (available > 0) {
      common += 1;
      beforeCounts.set(line, available - 1);
    }
  }
  return { added: afterLines.length - common, removed: beforeLines.length - common };
}

function ResponseText({ content }: { content: string }): React.JSX.Element {
  const pieces = content.split(/```/);
  return (
    <div className="ai-response-text">
      {pieces.map((piece, index) => {
        if (index % 2 === 1) {
          const newline = piece.indexOf('\n');
          const language = newline > -1 ? piece.slice(0, newline).trim() : '';
          const code = newline > -1 ? piece.slice(newline + 1) : piece;
          return (
            <div className="ai-code-block" key={`${index}-${piece.slice(0, 20)}`}>
              {language ? <span>{language}</span> : null}
              <pre>
                <code>{code.trimEnd()}</code>
              </pre>
            </div>
          );
        }
        return piece ? <p key={`${index}-${piece.slice(0, 20)}`}>{piece}</p> : null;
      })}
    </div>
  );
}

function ConversationMessage({ message }: { message: AiConversationMessage }): React.JSX.Element {
  const user = message.role === 'user';
  return (
    <MessageScrollerItem data-message-id={message.id}>
      <Message align={user ? 'end' : 'start'}>
        <MessageContent>
          <MessageHeader>{user ? 'YOU' : 'CORTEX'}</MessageHeader>
          <Bubble className={user ? 'is-user' : 'is-assistant'}>
            <BubbleContent>
              {message.content ? (
                <ResponseText content={message.content} />
              ) : (
                <span className="ai-stream-caret" aria-label="Cortex is responding" />
              )}
            </BubbleContent>
          </Bubble>
          {message.attachments.length > 0 ? (
            <div className="ai-message-attachments" aria-label="Message context">
              {message.attachments.map((attachment) => (
                <Attachment key={attachment.id}>{attachment.label}</Attachment>
              ))}
            </div>
          ) : null}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

function ProposalDetails({ proposal }: { proposal: AiChangeProposal }): React.JSX.Element {
  if (proposal.handlingPatch) {
    const file = proposal.files.find(
      (candidate) => candidate.relativePath === proposal.handlingPatch?.relativePath,
    );
    let beforeValues: Record<string, number> = {};
    if (file) {
      try {
        const document = parseHandlingDocument(file.beforeSource);
        const values = document.entries.find(
          (entry) => entry.handlingName === proposal.handlingPatch?.handlingName,
        )?.values;
        beforeValues = values ? Object.fromEntries(Object.entries(values)) : {};
      } catch {
        beforeValues = {};
      }
    }
    return (
      <div className="ai-handling-change-list">
        {Object.entries(proposal.handlingPatch.values).map(([field, value]) => (
          <div key={field}>
            <code>{field}</code>
            <span>
              {beforeValues[field] ?? '—'} → <strong>{value}</strong>
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="ai-source-review">
      {proposal.files.map((file) => (
        <details key={file.relativePath}>
          <summary>{file.relativePath}</summary>
          <div>
            <pre aria-label={`${file.relativePath} current source`}>{file.beforeSource}</pre>
            <pre aria-label={`${file.relativePath} proposed source`}>{file.afterSource}</pre>
          </div>
        </details>
      ))}
    </div>
  );
}

function ProposalBlock({
  proposal,
  workspaceRoot,
  activeModule,
  readOnly,
}: {
  proposal: AiChangeProposal;
  workspaceRoot: string;
  activeModule: string | null;
  readOnly: boolean;
}): React.JSX.Element {
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const updateProposal = useAiStore((state) => state.updateProposal);
  const provider = getCortexAiModuleProvider(activeModule);
  const canApplyToEditor = Boolean(proposal.handlingPatch && provider?.applyProposal);
  const terminal = ['applied', 'rejected', 'stale'].includes(proposal.status);

  const applyToEditor = async () => {
    if (!provider?.applyProposal) return;
    setBusy(true);
    try {
      const applied = await provider.applyProposal(proposal);
      if (!applied) throw new Error('Open the matching handling entry in Chassis first.');
      updateProposal(workspaceRoot, proposal.id, { status: 'approved' });
      toast.success('Cortex changes are now visible in Chassis. Save when ready.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not apply the handling changes.');
    } finally {
      setBusy(false);
    }
  };

  const applyToDisk = async () => {
    setBusy(true);
    try {
      const planned = await window.cortex.ai.planProposal({ proposal });
      if (!planned.ok) throw new Error(formatResultError(planned.error));
      const applied = await window.cortex.ai.applyProposal({
        planIds: planned.data.map((plan) => plan.planId),
      });
      if (!applied.ok) throw new Error(formatResultError(applied.error));
      updateProposal(workspaceRoot, proposal.id, { status: 'applied' });
      toast.success(
        `${planned.data.length} file${planned.data.length === 1 ? '' : 's'} updated safely.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not apply the proposal.';
      updateProposal(workspaceRoot, proposal.id, {
        status: message.includes('changed since') ? 'stale' : 'failed',
      });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MessageScrollerItem>
      <section className={`ai-proposal is-${proposal.status}`} aria-label="Proposed changes">
        <header>
          <div>
            <span>Proposed changes</span>
            <strong>{proposal.title}</strong>
          </div>
          {terminal || proposal.status === 'approved' ? (
            <span className="ai-proposal-status">
              <Check aria-hidden="true" /> {proposal.status}
            </span>
          ) : null}
        </header>
        {proposal.summary ? <p>{proposal.summary}</p> : null}
        <div className="ai-proposal-files">
          {proposal.files.map((file) => {
            const counts = countLineChanges(file.beforeSource, file.afterSource);
            return (
              <div key={file.relativePath}>
                <FileCode2 aria-hidden="true" />
                <span>{file.relativePath}</span>
                <small>
                  <b>+{counts.added}</b> <i>−{counts.removed}</i>
                </small>
              </div>
            );
          })}
        </div>
        {reviewing ? <ProposalDetails proposal={proposal} /> : null}
        {!terminal ? (
          <footer>
            <button type="button" onClick={() => setReviewing((value) => !value)}>
              {reviewing
                ? 'Hide details'
                : `Review ${proposal.files.length > 1 ? `${proposal.files.length} files` : 'changes'}`}
            </button>
            {!readOnly ? (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void (canApplyToEditor ? applyToEditor() : applyToDisk())}
              >
                {busy ? 'Applying…' : canApplyToEditor ? 'Apply to Chassis' : 'Apply'}
              </button>
            ) : null}
          </footer>
        ) : null}
      </section>
    </MessageScrollerItem>
  );
}

function ToolActivity({ thread }: { thread: AiThread }): React.JSX.Element | null {
  if (thread.activities.length === 0) return null;
  return (
    <MessageScrollerItem>
      <details
        className="ai-tool-activity"
        open={thread.activities.some((item) => item.status === 'running')}
      >
        <summary>
          <Wrench aria-hidden="true" /> Workspace activity <ChevronDown aria-hidden="true" />
        </summary>
        <div>
          {thread.activities.map((activity) => (
            <Marker key={activity.id} role={activity.status === 'running' ? 'status' : undefined}>
              <span className={`ai-tool-dot is-${activity.status}`} aria-hidden="true" />
              <span>{activity.label}</span>
              {activity.summary ? <small>{activity.summary}</small> : null}
            </Marker>
          ))}
        </div>
      </details>
    </MessageScrollerItem>
  );
}

export default function AiWorkspacePanel(): React.JSX.Element | null {
  const queryClient = useQueryClient();
  const preferencesQuery = usePreferences();
  const preferences = preferencesQuery.data;
  const workspace = useWorkspaceStore((state) => state.workspace);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTab);
  const panelOpen = useAiStore((state) => state.panelOpen);
  const setPanelOpen = useAiStore((state) => state.setPanelOpen);
  const threadsByWorkspace = useAiStore((state) => state.threadsByWorkspace);
  const activeThreadByWorkspace = useAiStore((state) => state.activeThreadByWorkspace);
  const activeRunId = useAiStore((state) => state.activeRunId);
  const error = useAiStore((state) => state.error);
  const ensureThread = useAiStore((state) => state.ensureThread);
  const newThread = useAiStore((state) => state.newThread);
  const setActiveThread = useAiStore((state) => state.setActiveThread);
  const deleteThread = useAiStore((state) => state.deleteThread);
  const beginTurn = useAiStore((state) => state.beginTurn);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const [composer, setComposer] = useState('');
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [removedContext, setRemovedContext] = useState<Set<string>>(() => new Set());
  const [width, setWidth] = useState(preferences?.aiPanelWidth ?? 420);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const workspaceRoot = workspace?.root ?? null;
  const workspaceName =
    workspace?.project?.name ?? workspaceRoot?.split(/[\\/]/).at(-1) ?? 'Workspace';
  const activeModule =
    activeTab && !['welcome', 'file', 'settings'].includes(activeTab.kind) ? activeTab.kind : null;
  const provider = getCortexAiModuleProvider(activeModule);

  useEffect(() => {
    if (preferences?.aiPanelWidth) setWidth(preferences.aiPanelWidth);
  }, [preferences?.aiPanelWidth]);

  useEffect(() => {
    if (!panelOpen) return;
    let active = true;
    const dispose = window.cortex.account.onChanged((status) => active && setAccount(status));
    const refresh = () =>
      void window.cortex.account.status().then((result) => {
        if (active && result.ok) setAccount(result.data);
      });
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      dispose();
      window.removeEventListener('focus', refresh);
    };
  }, [panelOpen]);

  useEffect(() => {
    if (!workspaceRoot || !panelOpen) return;
    ensureThread(workspaceRoot);
  }, [ensureThread, panelOpen, workspaceRoot]);

  useEffect(() => {
    const dispose = window.cortex.ai.onStream((event) => {
      const state = useAiStore.getState();
      if (event.type === 'started') state.setRunId(event.runId);
      else if (event.type === 'delta') state.appendDelta(event.runId, event.text);
      else if (event.type === 'tool') state.upsertActivity(event.runId, event.activity);
      else if (event.type === 'proposal') state.addProposal(event.runId, event.proposal);
      else if (event.type === 'complete') state.finishRun(event.runId);
      else state.failRun(event.runId, event.message);
    });
    return dispose;
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      setPanelOpen(true);
      if (detail.prompt) setComposer(detail.prompt);
      requestAnimationFrame(() => textarea.current?.focus());
    };
    window.addEventListener('cortex-ai:ask', listener);
    return () => window.removeEventListener('cortex-ai:ask', listener);
  }, [setPanelOpen]);

  const context = (() => {
    if (!workspaceRoot) return [];
    const items = [createAttachment('workspace', workspaceName, workspaceRoot)];
    if (activeModule)
      items.push(createAttachment('module', activeTab?.label ?? activeModule, activeModule));
    if (activeTab?.relativePath)
      items.push(createAttachment('file', activeTab.label, activeTab.relativePath));
    items.push(...(provider?.getAttachments?.() ?? []));
    return items.filter(
      (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index,
    );
  })();
  const attachments = context.filter((item) => !removedContext.has(item.id));

  const threads = workspaceRoot ? (threadsByWorkspace[workspaceRoot] ?? []) : [];
  const activeThreadId = workspaceRoot ? activeThreadByWorkspace[workspaceRoot] : undefined;
  const thread = threads.find((item) => item.id === activeThreadId) ?? threads[0] ?? null;

  const send = async () => {
    const prompt = composer.trim();
    if (!workspaceRoot || !preferences?.aiEnabled || !prompt || activeRunId) return;
    const turn = beginTurn({ workspaceRoot, content: prompt, attachments });
    setComposer('');
    setRemovedContext(new Set());
    try {
      const result = await window.cortex.ai.startChat({
        threadId: turn.thread.id,
        reasoningMode: preferences.reasoningMode,
        messages: turn.thread.messages.filter(
          (message) => message.role === 'user' || message.content.trim().length > 0,
        ),
        attachments,
        activeModule,
        activeFile: activeTab?.relativePath ?? null,
      });
      if (!result.ok) throw new Error(formatResultError(result.error));
      useAiStore.getState().setRunId(result.data.runId);
    } catch (cause) {
      useAiStore
        .getState()
        .failRun(null, cause instanceof Error ? cause.message : 'Cortex AI could not start.');
    }
  };

  const stop = async () => {
    if (!activeRunId) return;
    await window.cortex.ai.cancelChat({ runId: activeRunId });
    useAiStore.getState().finishRun(activeRunId);
  };

  const beginResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    let latestWidth = startWidth;
    const move = (moveEvent: PointerEvent) => {
      latestWidth = Math.max(320, Math.min(720, startWidth + startX - moveEvent.clientX));
      setWidth(latestWidth);
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      if (!preferences) return;
      void (async () => {
        const next = normalizePreferences({
          ...preferences,
          aiPanelWidth: Math.round(latestWidth),
        });
        const result = await window.cortex.settings.set(next);
        if (result.ok) queryClient.setQueryData(PREFERENCES_QUERY_KEY, result.data);
      })();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  if (!panelOpen || !preferences?.aiEnabled || !workspaceRoot) return null;

  const openAccount = () => {
    globalThis.sessionStorage.setItem('cortex.settings.requestedSection', 'account');
    openTab({
      id: 'settings',
      label: 'Settings',
      relativePath: null,
      kind: 'settings',
      dirty: false,
    });
  };
  const accountAi = account?.ai;
  const accessBlocked =
    account?.status !== 'signed-in' ||
    accountAi?.entitled !== true ||
    !accountAi.enabled ||
    accountAi.usage.state === 'used';

  if (accessBlocked) {
    const signedIn = account?.status === 'signed-in';
    const entitled = accountAi?.entitled === true;
    const used = entitled && accountAi.usage.state === 'used';
    return (
      <aside
        className="ai-workspace-panel"
        style={{ '--ai-panel-width': `${width}px`, width } as CSSProperties}
        aria-label="Cortex AI workspace panel"
      >
        <div
          className="ai-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Cortex AI panel"
          onPointerDown={beginResize}
        />
        <header className="ai-panel-header">
          <div>
            <strong>Cortex AI</strong>
            <span>Hosted workspace reasoning</span>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close Cortex AI"
            onClick={() => setPanelOpen(false)}
          >
            <PanelRightClose aria-hidden="true" />
          </button>
        </header>
        <div className="ai-commercial-gate" role="status">
          <span className="ai-empty-mark" aria-hidden="true">
            C
          </span>
          <h2>
            {!account
              ? 'Checking Cortex AI access…'
              : !signedIn
                ? 'Sign in to use Cortex AI'
                : !entitled
                  ? 'Available with Creator or Pro'
                  : used
                    ? 'Monthly capacity used'
                    : 'Cortex AI is temporarily unavailable'}
          </h2>
          <p>
            {!account
              ? 'Confirming your account and subscription.'
              : !signedIn
                ? 'Cortex Toolbox remains free. An account and paid plan are only required for hosted AI.'
                : !entitled
                  ? 'Choose Creator or Pro to add hosted AI while keeping every local Toolbox workflow free.'
                  : used
                    ? `You’ve used this month’s Cortex AI capacity.${accountAi.usage.resetsAt ? ` It resets ${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(new Date(accountAi.usage.resetsAt))}.` : ''}`
                    : 'Try again in a moment. Nothing in your workspace was changed.'}
          </p>
          {account ? (
            <div>
              {!signedIn ? (
                <ActionButton
                  variant="primary"
                  onClick={async () => {
                    const result = await window.cortex.account.signIn();
                    if (!result.ok) toast.error(formatResultError(result.error));
                  }}
                >
                  Sign in
                </ActionButton>
              ) : !entitled ? (
                <ActionButton variant="primary" onClick={openAccount}>
                  View plans
                </ActionButton>
              ) : used && account.plan === 'creator' ? (
                <ActionButton variant="primary" onClick={openAccount}>
                  Upgrade to Pro
                </ActionButton>
              ) : (
                <ActionButton onClick={openAccount}>Open account</ActionButton>
              )}
            </div>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="ai-workspace-panel"
      style={{ '--ai-panel-width': `${width}px`, width } as CSSProperties}
      aria-label="Cortex AI workspace panel"
    >
      <div
        className="ai-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Cortex AI panel"
        onPointerDown={beginResize}
      />
      <header className="ai-panel-header">
        <div>
          <strong>Cortex AI</strong>
          <span>{preferences.reasoningMode === 'advanced' ? 'Advanced' : 'Fast'} reasoning</span>
        </div>
        <div>
          <button
            type="button"
            className="icon-button"
            aria-label="New AI conversation"
            onClick={() => newThread(workspaceRoot)}
          >
            <Plus aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Close Cortex AI"
            onClick={() => setPanelOpen(false)}
          >
            <PanelRightClose aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="ai-thread-bar">
        <History aria-hidden="true" />
        <Select
          id="ai-thread-select"
          value={thread?.id ?? ''}
          ariaLabel="AI conversation"
          options={threads.map((item) => ({ value: item.id, label: item.title }))}
          onChange={(value) => setActiveThread(workspaceRoot, value)}
        />
        <button
          type="button"
          className="icon-button"
          disabled={!thread || Boolean(activeRunId)}
          aria-label="Delete conversation"
          onClick={() => thread && deleteThread(workspaceRoot, thread.id)}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
      <MessageScrollerProvider>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent>
              {!thread || thread.messages.length === 0 ? (
                <div className="ai-empty-state">
                  <span className="ai-empty-mark">C</span>
                  <h2>Work with the resource in front of you.</h2>
                  <p>
                    Cortex reads only the context needed for your request and cannot write outside
                    this workspace.
                  </p>
                  <div>
                    {[
                      'Diagnose this workspace',
                      'Explain the active file',
                      'Find risky metadata relationships',
                    ].map((prompt) => (
                      <button
                        type="button"
                        key={prompt}
                        onClick={() => {
                          setComposer(prompt);
                          textarea.current?.focus();
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {thread.messages.map((message) => (
                    <ConversationMessage message={message} key={message.id} />
                  ))}
                  <ToolActivity thread={thread} />
                  {thread.proposals.map((proposal) => (
                    <ProposalBlock
                      key={proposal.id}
                      proposal={proposal}
                      workspaceRoot={workspaceRoot}
                      activeModule={activeModule}
                      readOnly={preferences.aiWorkspaceAccess === 'read-only'}
                    />
                  ))}
                </>
              )}
              {error ? (
                <MessageScrollerItem>
                  <div className="ai-error" role="alert">
                    <strong>Cortex AI couldn’t complete this request.</strong>
                    <p>{error}</p>
                    <span>Nothing in your workspace was changed.</span>
                  </div>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <footer className="ai-composer-shell">
        <div className="ai-context-row" aria-label="Attached context">
          {attachments.map((attachment) => (
            <Attachment key={attachment.id}>
              {attachment.label}
              <button
                type="button"
                aria-label={`Remove ${attachment.label} context`}
                onClick={() => setRemovedContext((current) => new Set(current).add(attachment.id))}
              >
                <X aria-hidden="true" />
              </button>
            </Attachment>
          ))}
        </div>
        <div className="ai-composer">
          <textarea
            ref={textarea}
            rows={1}
            value={composer}
            placeholder="Ask Cortex about this workspace…"
            aria-label="Ask Cortex about this workspace"
            onChange={(event) => setComposer(event.target.value)}
            onInput={(event) => {
              event.currentTarget.style.height = 'auto';
              event.currentTarget.style.height = `${Math.min(180, event.currentTarget.scrollHeight)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            className={activeRunId ? 'ai-send is-stop' : 'ai-send'}
            aria-label={activeRunId ? 'Stop Cortex' : 'Send to Cortex'}
            disabled={!activeRunId && !composer.trim()}
            onClick={() => void (activeRunId ? stop() : send())}
          >
            {activeRunId ? <CircleStop aria-hidden="true" /> : <Send aria-hidden="true" />}
          </button>
        </div>
        <small>Cortex Cloud · Enter to send · Shift+Enter for a new line</small>
      </footer>
    </aside>
  );
}
