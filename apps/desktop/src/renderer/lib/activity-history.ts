import type { ModuleId } from '../../shared/modules';

export type ActivityTool = 'probe' | 'sentinel' | 'bundle' | 'wire' | 'chassis';
export type ActivityStatus = 'success' | 'warning' | 'error' | 'info';

export interface ActivityNavigateTarget {
  kind: ModuleId | 'welcome';
  tabLabel: string;
}

export interface ActivityEntry {
  id: string;
  tool: ActivityTool;
  workspaceRoot: string;
  workspaceName: string;
  at: string;
  status: ActivityStatus;
  summary: string;
  navigate: ActivityNavigateTarget;
}

const STORAGE_KEY = 'cortex.activityHistory';
const MAX_ENTRIES = 24;
const TOOL_IDS = new Set<ActivityTool>(['probe', 'sentinel', 'bundle', 'wire', 'chassis']);
const STATUS_IDS = new Set<ActivityStatus>(['success', 'warning', 'error', 'info']);

function isActivityEntry(entry: unknown): entry is ActivityEntry {
  if (typeof entry !== 'object' || entry === null) return false;
  const candidate = entry as ActivityEntry;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.workspaceRoot === 'string' &&
    typeof candidate.workspaceName === 'string' &&
    typeof candidate.at === 'string' &&
    typeof candidate.summary === 'string' &&
    TOOL_IDS.has(candidate.tool) &&
    STATUS_IDS.has(candidate.status) &&
    typeof candidate.navigate === 'object' &&
    typeof candidate.navigate.kind === 'string' &&
    typeof candidate.navigate.tabLabel === 'string'
  );
}

function readEntries(): ActivityEntry[] {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isActivityEntry);
  } catch {
    return [];
  }
}

function writeEntries(entries: ActivityEntry[]): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* ignore quota / private mode */
  }
}

function normalizeRoot(root: string): string {
  return root.replace(/[\\/]+$/, '').toLowerCase();
}

export function listActivities(): ActivityEntry[] {
  return readEntries();
}

export function recordActivity(
  entry: Omit<ActivityEntry, 'id' | 'at'> & { at?: string; id?: string },
): ActivityEntry {
  const next: ActivityEntry = {
    ...entry,
    id: entry.id ?? crypto.randomUUID(),
    at: entry.at ?? new Date().toISOString(),
  };
  const existing = readEntries().filter(
    (item) =>
      !(
        item.tool === next.tool &&
        normalizeRoot(item.workspaceRoot) === normalizeRoot(next.workspaceRoot) &&
        item.summary === next.summary
      ),
  );
  writeEntries([next, ...existing]);
  return next;
}

export function latestActivityForWorkspace(root: string): ActivityEntry | null {
  const key = normalizeRoot(root);
  return readEntries().find((entry) => normalizeRoot(entry.workspaceRoot) === key) ?? null;
}

export function latestActivityByTool(tool: ActivityTool, root?: string): ActivityEntry | null {
  const entries = readEntries();
  if (root) {
    const key = normalizeRoot(root);
    return (
      entries.find((entry) => entry.tool === tool && normalizeRoot(entry.workspaceRoot) === key) ??
      null
    );
  }
  return entries.find((entry) => entry.tool === tool) ?? null;
}
