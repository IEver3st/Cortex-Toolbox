import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AccountStatus, Preferences } from '../../../shared/contracts';
import { clearAllAiHistory } from '../../ai/ai-store';
import { Select } from '../Select';
import { Toggle } from '../UiPrimitives';

interface AiSettingsPanelProps {
  draft: Preferences;
  update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  SettingsGroup: (props: { title: string; children: React.ReactNode }) => React.JSX.Element;
  Row: (props: {
    label: string;
    description?: string;
    control: React.ReactNode;
    htmlFor?: string;
  }) => React.JSX.Element;
  onOpenAccount: () => void;
}

const PERMISSION_COPY: Record<Preferences['aiWorkspaceAccess'], { title: string; detail: string }> =
  {
    'read-only': {
      title: 'Inspect only',
      detail: 'Cortex can inspect the active workspace, but workspace changes cannot be applied.',
    },
    'ask-before-changes': {
      title: 'Ask before changes',
      detail: 'Cortex shows proposed edits and waits for your approval before applying them.',
    },
    'approve-safe-edits': {
      title: 'Approve safe edits',
      detail: 'Eligible low-risk edits use the protected write flow with fewer approval prompts.',
    },
    'approve-all': {
      title: 'Approve all',
      detail:
        'Cortex can apply eligible workspace changes without asking each time. Workspace boundaries, safety checks, and rollback protections still apply.',
    },
  };

export function AiSettingsPanel({
  draft,
  update,
  SettingsGroup,
  Row,
  onOpenAccount,
}: AiSettingsPanelProps): React.JSX.Element {
  const [clearArmed, setClearArmed] = useState(false);
  const [account, setAccount] = useState<AccountStatus | null>(null);

  useEffect(() => {
    if (!draft.aiEnabled) return;
    let active = true;
    const dispose = window.cortex.account.onChanged((status) => active && setAccount(status));
    void window.cortex.account.status().then((result) => {
      if (active && result.ok) setAccount(result.data);
    });
    return () => {
      active = false;
      dispose();
    };
  }, [draft.aiEnabled]);

  return (
    <>
      <SettingsGroup title="Cortex AI">
        <Row
          label="Enable Cortex AI"
          description="Optional workspace help for inspection, diagnosis, and protected changes. When disabled, no AI request or workspace context is collected."
          htmlFor="enable-cortex-ai"
          control={
            <Toggle
              id="enable-cortex-ai"
              name="enableCortexAi"
              checked={draft.aiEnabled}
              onChange={(value) => update('aiEnabled', value)}
            />
          }
        />
      </SettingsGroup>

      {draft.aiEnabled ? (
        <>
          <SettingsGroup title="Reasoning">
            <Row
              label="Default reasoning"
              description="Fast keeps everyday work moving; Advanced spends more time on difficult debugging and complex changes."
              htmlFor="ai-reasoning-mode"
              control={
                <Select
                  id="ai-reasoning-mode"
                  value={draft.reasoningMode}
                  options={[
                    { value: 'fast', label: 'Fast' },
                    { value: 'advanced', label: 'Advanced' },
                  ]}
                  onChange={(value) => update('reasoningMode', value)}
                />
              }
            />
          </SettingsGroup>

          <SettingsGroup title="Permissions">
            <Row
              label="Workspace changes"
              description="Choose how often Cortex asks before applying an eligible proposal."
              htmlFor="ai-workspace-access"
              control={
                <Select
                  id="ai-workspace-access"
                  value={draft.aiWorkspaceAccess}
                  options={[
                    { value: 'read-only', label: 'Inspect only' },
                    { value: 'ask-before-changes', label: 'Ask before changes' },
                    { value: 'approve-safe-edits', label: 'Approve safe edits' },
                    { value: 'approve-all', label: 'Approve all' },
                  ]}
                  onChange={(value) => update('aiWorkspaceAccess', value)}
                />
              }
            />
            <div className="settings-permission-explainer">
              <strong>{PERMISSION_COPY[draft.aiWorkspaceAccess].title}</strong>
              <p>{PERMISSION_COPY[draft.aiWorkspaceAccess].detail}</p>
            </div>
          </SettingsGroup>

          <SettingsGroup title="Usage and plan">
            <div className="settings-ai-account-summary">
              <div>
                <strong>
                  {account?.plan === 'pro'
                    ? 'Cortex AI Pro'
                    : account?.plan === 'creator'
                      ? 'Cortex AI Creator'
                      : 'Creator or Pro required'}
                </strong>
                <span>
                  {account?.ai?.entitled
                    ? `${account.ai.usage.percent}% used this month${account.ai.usage.resetsAt ? ` · resets ${formatAiReset(account.ai.usage.resetsAt)}` : ''}`
                    : account?.status === 'signed-in'
                      ? 'This account does not currently include hosted AI.'
                      : 'Sign in and choose a plan to use hosted Cortex AI.'}
                </span>
              </div>
              <button type="button" onClick={onOpenAccount}>
                {account?.ai?.entitled ? 'Manage account' : 'View plans'}
              </button>
            </div>
            {account?.ai?.entitled ? (
              <div
                className="settings-ai-usage-track"
                role="progressbar"
                aria-label="Cortex AI monthly usage"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={account.ai.usage.percent}
              >
                <span style={{ width: `${account.ai.usage.percent}%` }} />
              </div>
            ) : null}
          </SettingsGroup>

          <SettingsGroup title="Privacy and workspace access">
            <div className="settings-ai-privacy">
              <p>
                Cortex sends your request, visible context references, and only the file excerpts
                selected through its protected tools. It does not upload the entire workspace by
                default.
              </p>
              <p>
                <code>.env</code>, credential files, private keys, and certificates are excluded.
                Cortex Cloud requests that inference data collection be denied.
              </p>
            </div>
            <Row
              label="AI conversations"
              description="Conversation history is stored locally and separated by workspace."
              control={
                <button
                  type="button"
                  className={clearArmed ? 'is-armed' : ''}
                  onClick={() => {
                    if (!clearArmed) {
                      setClearArmed(true);
                      return;
                    }
                    clearAllAiHistory();
                    setClearArmed(false);
                    toast.success('Local AI conversation history cleared.');
                  }}
                >
                  {clearArmed ? 'Confirm clear' : 'Clear history'}
                </button>
              }
            />
          </SettingsGroup>
        </>
      ) : (
        <p className="settings-ai-disabled-note">
          Cortex AI is off. The AI panel, contextual actions, shortcuts, context collection, and
          network requests are inactive. Every local Toolbox module remains available.
        </p>
      )}
    </>
  );
}

function formatAiReset(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}
