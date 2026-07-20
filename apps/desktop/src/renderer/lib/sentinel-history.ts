export type SentinelReadiness = 'ready' | 'attention' | 'incomplete';

export interface SentinelRunRecord {
  id: string;
  workspaceRoot: string;
  at: string;
  durationMs: number;
  readiness: SentinelReadiness;
  blocked: boolean;
  errorCount: number;
  warningCount: number;
  noteCount: number;
}

const STORAGE_KEY = 'cortex.sentinelHistory';
const MAX_RUNS = 48;

function normalizeRoot(root: string): string {
  return root.replace(/[\\/]+$/, '').toLowerCase();
}

function readRuns(): SentinelRunRecord[] {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is SentinelRunRecord => {
      return (
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as SentinelRunRecord).id === 'string' &&
        typeof (entry as SentinelRunRecord).workspaceRoot === 'string'
      );
    });
  } catch {
    return [];
  }
}

function writeRuns(runs: SentinelRunRecord[]): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function recordSentinelRun(
  entry: Omit<SentinelRunRecord, 'id'> & { id?: string },
): SentinelRunRecord {
  const next: SentinelRunRecord = {
    ...entry,
    id: entry.id ?? crypto.randomUUID(),
  };
  writeRuns([next, ...readRuns()]);
  return next;
}

export function listSentinelRuns(workspaceRoot: string, limit = 3): SentinelRunRecord[] {
  const key = normalizeRoot(workspaceRoot);
  return readRuns()
    .filter((run) => normalizeRoot(run.workspaceRoot) === key)
    .slice(0, limit);
}

export function countSentinelRuns(workspaceRoot: string): number {
  const key = normalizeRoot(workspaceRoot);
  return readRuns().filter((run) => normalizeRoot(run.workspaceRoot) === key).length;
}

export function severityScore(
  run: Pick<SentinelRunRecord, 'errorCount' | 'warningCount' | 'noteCount'>,
): number {
  return run.errorCount * 100 + run.warningCount * 10 + run.noteCount;
}

export type SentinelTrend = 'improved' | 'regressed' | 'unchanged' | 'first';

export function compareSentinelRuns(
  current: SentinelRunRecord,
  prior: SentinelRunRecord | null,
): SentinelTrend {
  if (!prior) return 'first';
  const delta = severityScore(current) - severityScore(prior);
  if (delta < 0) return 'improved';
  if (delta > 0) return 'regressed';
  return 'unchanged';
}
