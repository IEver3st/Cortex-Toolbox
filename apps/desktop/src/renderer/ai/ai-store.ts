import type {
  AiChangeProposal,
  AiContextAttachment,
  AiConversationMessage,
  AiToolActivity,
} from '@cortex/ai';
import { create } from 'zustand';

export interface AiThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AiConversationMessage[];
  activities: AiToolActivity[];
  proposals: AiChangeProposal[];
}

interface StoredAiHistory {
  version: 1;
  threadsByWorkspace: Record<string, AiThread[]>;
  activeThreadByWorkspace: Record<string, string>;
}

interface AiState extends StoredAiHistory {
  panelOpen: boolean;
  activeRunId: string | null;
  pendingRun: { workspaceRoot: string; threadId: string; assistantMessageId: string } | null;
  error: string | null;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  ensureThread: (workspaceRoot: string) => AiThread;
  newThread: (workspaceRoot: string) => AiThread;
  setActiveThread: (workspaceRoot: string, threadId: string) => void;
  renameThread: (workspaceRoot: string, threadId: string, title: string) => void;
  deleteThread: (workspaceRoot: string, threadId: string) => void;
  beginTurn: (input: {
    workspaceRoot: string;
    content: string;
    attachments: AiContextAttachment[];
  }) => { thread: AiThread; assistantMessageId: string };
  setRunId: (runId: string) => void;
  appendDelta: (runId: string, text: string) => void;
  upsertActivity: (runId: string, activity: AiToolActivity) => void;
  addProposal: (runId: string, proposal: AiChangeProposal) => void;
  finishRun: (runId: string) => void;
  failRun: (runId: string | null, message: string) => void;
  updateProposal: (
    workspaceRoot: string,
    proposalId: string,
    patch: Partial<AiChangeProposal>,
  ) => void;
  clearWorkspace: (workspaceRoot: string) => void;
  clearAllHistory: () => void;
}

const HISTORY_KEY = 'cortex.ai.history.v1';

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createThread(): AiThread {
  const now = new Date().toISOString();
  return {
    id: id('thread'),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    messages: [],
    activities: [],
    proposals: [],
  };
}

function readHistory(): StoredAiHistory {
  const empty: StoredAiHistory = {
    version: 1,
    threadsByWorkspace: {},
    activeThreadByWorkspace: {},
  };
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<StoredAiHistory>;
    if (parsed.version !== 1 || !parsed.threadsByWorkspace || !parsed.activeThreadByWorkspace) {
      return empty;
    }
    return {
      version: 1,
      threadsByWorkspace: parsed.threadsByWorkspace,
      activeThreadByWorkspace: parsed.activeThreadByWorkspace,
    };
  } catch {
    return empty;
  }
}

function persist(state: Pick<AiState, 'threadsByWorkspace' | 'activeThreadByWorkspace'>): void {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({
        version: 1,
        threadsByWorkspace: state.threadsByWorkspace,
        activeThreadByWorkspace: state.activeThreadByWorkspace,
      } satisfies StoredAiHistory),
    );
  } catch {
    // Conversation persistence is best-effort; chat still works when storage is unavailable.
  }
}

function updateThread(
  state: AiState,
  workspaceRoot: string,
  threadId: string,
  update: (thread: AiThread) => AiThread,
): Pick<AiState, 'threadsByWorkspace'> {
  const next = (state.threadsByWorkspace[workspaceRoot] ?? []).map((thread) =>
    thread.id === threadId ? update(thread) : thread,
  );
  return { threadsByWorkspace: { ...state.threadsByWorkspace, [workspaceRoot]: next } };
}

const stored = readHistory();

export const useAiStore = create<AiState>((set, get) => ({
  ...stored,
  panelOpen: false,
  activeRunId: null,
  pendingRun: null,
  error: null,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
  ensureThread: (workspaceRoot) => {
    const state = get();
    const threads = state.threadsByWorkspace[workspaceRoot] ?? [];
    const activeId = state.activeThreadByWorkspace[workspaceRoot];
    const existing = threads.find((thread) => thread.id === activeId) ?? threads[0];
    if (existing) return existing;
    const thread = createThread();
    const next = {
      threadsByWorkspace: { ...state.threadsByWorkspace, [workspaceRoot]: [thread] },
      activeThreadByWorkspace: { ...state.activeThreadByWorkspace, [workspaceRoot]: thread.id },
    };
    set(next);
    persist(next);
    return thread;
  },
  newThread: (workspaceRoot) => {
    const state = get();
    const thread = createThread();
    const next = {
      threadsByWorkspace: {
        ...state.threadsByWorkspace,
        [workspaceRoot]: [thread, ...(state.threadsByWorkspace[workspaceRoot] ?? [])].slice(0, 30),
      },
      activeThreadByWorkspace: { ...state.activeThreadByWorkspace, [workspaceRoot]: thread.id },
      error: null,
    };
    set(next);
    persist(next);
    return thread;
  },
  setActiveThread: (workspaceRoot, threadId) => {
    const state = get();
    if (!(state.threadsByWorkspace[workspaceRoot] ?? []).some((thread) => thread.id === threadId))
      return;
    const next = {
      activeThreadByWorkspace: { ...state.activeThreadByWorkspace, [workspaceRoot]: threadId },
      error: null,
    };
    set(next);
    persist({ threadsByWorkspace: state.threadsByWorkspace, ...next });
  },
  renameThread: (workspaceRoot, threadId, title) => {
    const state = get();
    const next = updateThread(state, workspaceRoot, threadId, (thread) => ({
      ...thread,
      title: title.trim().slice(0, 80) || thread.title,
      updatedAt: new Date().toISOString(),
    }));
    set(next);
    persist({ ...state, ...next });
  },
  deleteThread: (workspaceRoot, threadId) => {
    const state = get();
    const remaining = (state.threadsByWorkspace[workspaceRoot] ?? []).filter(
      (thread) => thread.id !== threadId,
    );
    const fallback = remaining[0] ?? createThread();
    const threads = remaining.length > 0 ? remaining : [fallback];
    const next = {
      threadsByWorkspace: { ...state.threadsByWorkspace, [workspaceRoot]: threads },
      activeThreadByWorkspace: {
        ...state.activeThreadByWorkspace,
        [workspaceRoot]:
          state.activeThreadByWorkspace[workspaceRoot] === threadId
            ? fallback.id
            : (state.activeThreadByWorkspace[workspaceRoot] ?? fallback.id),
      },
    };
    set(next);
    persist(next);
  },
  beginTurn: ({ workspaceRoot, content, attachments }) => {
    const existing = get().ensureThread(workspaceRoot);
    const now = new Date().toISOString();
    const userMessage: AiConversationMessage = {
      id: id('message'),
      role: 'user',
      content,
      createdAt: now,
      attachments,
    };
    const assistantMessage: AiConversationMessage = {
      id: id('message'),
      role: 'assistant',
      content: '',
      createdAt: now,
      attachments: [],
    };
    const currentTitle =
      existing.messages.length === 0 ? content.trim().slice(0, 52) : existing.title;
    const state = get();
    const next = updateThread(state, workspaceRoot, existing.id, (thread) => ({
      ...thread,
      title: currentTitle || 'New conversation',
      updatedAt: now,
      messages: [...thread.messages, userMessage, assistantMessage].slice(-100),
      activities: [],
    }));
    const pendingRun = {
      workspaceRoot,
      threadId: existing.id,
      assistantMessageId: assistantMessage.id,
    };
    set({ ...next, pendingRun, activeRunId: null, error: null });
    persist({ ...state, ...next });
    return {
      thread: { ...existing, title: currentTitle, messages: [...existing.messages, userMessage] },
      assistantMessageId: assistantMessage.id,
    };
  },
  setRunId: (activeRunId) => set({ activeRunId }),
  appendDelta: (runId, text) => {
    const state = get();
    const pending = state.pendingRun;
    if (!pending || (state.activeRunId && state.activeRunId !== runId)) return;
    const next = updateThread(state, pending.workspaceRoot, pending.threadId, (thread) => ({
      ...thread,
      updatedAt: new Date().toISOString(),
      messages: thread.messages.map((message) =>
        message.id === pending.assistantMessageId
          ? { ...message, content: `${message.content}${text}` }
          : message,
      ),
    }));
    set({ ...next, activeRunId: runId });
    persist({ ...state, ...next });
  },
  upsertActivity: (runId, activity) => {
    const state = get();
    const pending = state.pendingRun;
    if (!pending || (state.activeRunId && state.activeRunId !== runId)) return;
    const next = updateThread(state, pending.workspaceRoot, pending.threadId, (thread) => {
      const activities = thread.activities.some((item) => item.id === activity.id)
        ? thread.activities.map((item) => (item.id === activity.id ? activity : item))
        : [...thread.activities, activity];
      return { ...thread, activities };
    });
    set({ ...next, activeRunId: runId });
  },
  addProposal: (runId, proposal) => {
    const state = get();
    const pending = state.pendingRun;
    if (!pending || (state.activeRunId && state.activeRunId !== runId)) return;
    const next = updateThread(state, pending.workspaceRoot, pending.threadId, (thread) => ({
      ...thread,
      proposals: [...thread.proposals.filter((item) => item.id !== proposal.id), proposal],
    }));
    set({ ...next, activeRunId: runId });
    persist({ ...state, ...next });
  },
  finishRun: (runId) => {
    const state = get();
    if (state.activeRunId && state.activeRunId !== runId) return;
    set({ activeRunId: null, pendingRun: null });
  },
  failRun: (runId, error) => {
    const state = get();
    if (runId && state.activeRunId && state.activeRunId !== runId) return;
    set({ activeRunId: null, pendingRun: null, error });
  },
  updateProposal: (workspaceRoot, proposalId, patch) => {
    const state = get();
    const threads = (state.threadsByWorkspace[workspaceRoot] ?? []).map((thread) => ({
      ...thread,
      proposals: thread.proposals.map((proposal) =>
        proposal.id === proposalId ? { ...proposal, ...patch } : proposal,
      ),
    }));
    const next = { threadsByWorkspace: { ...state.threadsByWorkspace, [workspaceRoot]: threads } };
    set(next);
    persist({ ...state, ...next });
  },
  clearWorkspace: (workspaceRoot) => {
    const state = get();
    const threadsByWorkspace = Object.fromEntries(
      Object.entries(state.threadsByWorkspace).filter(([key]) => key !== workspaceRoot),
    );
    const activeThreadByWorkspace = Object.fromEntries(
      Object.entries(state.activeThreadByWorkspace).filter(([key]) => key !== workspaceRoot),
    );
    const next = { threadsByWorkspace, activeThreadByWorkspace };
    set(next);
    persist(next);
  },
  clearAllHistory: () => {
    const next = { threadsByWorkspace: {}, activeThreadByWorkspace: {} };
    set({ ...next, activeRunId: null, pendingRun: null, error: null });
    persist(next);
  },
}));

export function clearAllAiHistory(): void {
  useAiStore.getState().clearAllHistory();
}
