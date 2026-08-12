import type { ProbeFinding, ProbeSeverity } from '@cortex/script-analysis';
import { probeFindingFingerprint } from '@cortex/script-analysis';

export type ProbeOverallState = 'clear' | 'needs-review' | 'high-risk' | 'incomplete';

export interface ProbeRunRecord {
  id: string;
  workspaceRoot: string;
  at: string;
  durationMs: number;
  state: ProbeOverallState;
  scripts: number;
  lines: number;
  rulesExecuted: number;
  ruleSetVersion: string;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  dynamicReferences: number;
  skippedFiles: number;
  fingerprints: string[];
}

export type ProbeFindingDelta = 'new' | 'unchanged' | 'resolved';

const STORAGE_KEY = 'cortex.probeHistory';
const MAX_RUNS = 48;

function normalizeRoot(root: string): string {
  return root.replace(/[\\/]+$/, '').toLowerCase();
}

function readRuns(): ProbeRunRecord[] {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ProbeRunRecord => {
      return (
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ProbeRunRecord).id === 'string' &&
        typeof (entry as ProbeRunRecord).workspaceRoot === 'string'
      );
    });
  } catch {
    return [];
  }
}

function writeRuns(runs: ProbeRunRecord[]): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function recordProbeRun(
  entry: Omit<ProbeRunRecord, 'id'> & { id?: string },
): ProbeRunRecord {
  const next: ProbeRunRecord = {
    ...entry,
    id: entry.id ?? crypto.randomUUID(),
  };
  writeRuns([next, ...readRuns()]);
  return next;
}

export function listProbeRuns(workspaceRoot: string, limit = 3): ProbeRunRecord[] {
  const key = normalizeRoot(workspaceRoot);
  return readRuns()
    .filter((run) => normalizeRoot(run.workspaceRoot) === key)
    .slice(0, limit);
}

export function countProbeRuns(workspaceRoot: string): number {
  const key = normalizeRoot(workspaceRoot);
  return readRuns().filter((run) => normalizeRoot(run.workspaceRoot) === key).length;
}

export function countBySeverity(findings: ProbeFinding[]): Record<ProbeSeverity, number> {
  return findings.reduce(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    { high: 0, medium: 0, low: 0, info: 0 },
  );
}

export function compareProbeFindings(
  current: ProbeFinding[],
  previousFingerprints: string[] | null,
): Map<string, ProbeFindingDelta> {
  const deltas = new Map<string, ProbeFindingDelta>();
  const previous = new Set(previousFingerprints ?? []);
  const currentFingerprints = new Set<string>();

  for (const finding of current) {
    const fingerprint = probeFindingFingerprint(finding);
    currentFingerprints.add(fingerprint);
    deltas.set(finding.id, previous.has(fingerprint) ? 'unchanged' : 'new');
  }

  for (const fingerprint of previous) {
    if (!currentFingerprints.has(fingerprint)) {
      deltas.set(`resolved:${fingerprint}`, 'resolved');
    }
  }

  return deltas;
}

export function summarizeComparison(
  current: ProbeFinding[],
  previous: ProbeRunRecord | null,
): { newCount: number; resolvedCount: number; unchangedCount: number } {
  if (!previous) return { newCount: current.length, resolvedCount: 0, unchangedCount: 0 };
  const deltas = compareProbeFindings(current, previous.fingerprints);
  let newCount = 0;
  let resolvedCount = 0;
  let unchangedCount = 0;
  for (const [key, delta] of deltas) {
    if (delta === 'new') newCount += 1;
    if (delta === 'resolved') resolvedCount += 1;
    if (delta === 'unchanged' && !key.startsWith('resolved:')) unchangedCount += 1;
  }
  return { newCount, resolvedCount, unchangedCount };
}

export const PROBE_WIRE_FOCUS_KEY = 'cortex.wire.pendingFocus';

export interface ProbeWireFocus {
  file: string;
  symbolName: string;
  symbolKind: 'event' | 'export' | 'command' | 'function';
}

export function queueWireFocus(focus: ProbeWireFocus): void {
  try {
    sessionStorage.setItem(PROBE_WIRE_FOCUS_KEY, JSON.stringify(focus));
  } catch {
    /* ignore */
  }
}
