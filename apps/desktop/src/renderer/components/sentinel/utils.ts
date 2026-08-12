import type { SentinelReadiness } from '../../lib/sentinel-history';
import type { AuditFinding, RuleMeta } from './constants';
import { RULE_META } from './constants';

export function ruleMeta(ruleId: string): RuleMeta {
  return (
    RULE_META[ruleId] ?? {
      title: ruleId,
      category: 'Files',
      impact: 'Review this finding and apply the remediation.',
    }
  );
}

export function findingKey(finding: AuditFinding): string {
  return `${finding.ruleId}|${finding.file}|${finding.line ?? ''}`;
}

export function dedupeFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Map<string, AuditFinding>();
  for (const finding of findings) {
    const key = findingKey(finding);
    if (!seen.has(key)) seen.set(key, finding);
  }
  return [...seen.values()];
}

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function shortPath(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
  if (parts.length <= 4) return path;
  return `~/${parts.slice(-4).join('/')}`;
}

export function locationLabel(finding: AuditFinding): string {
  if (finding.file === '.') return 'Resource root';
  return finding.line ? `${finding.file}:${finding.line}` : finding.file;
}

export function readinessFromCounts(
  errorCount: number,
  warningCount: number,
  incomplete: boolean,
): SentinelReadiness {
  if (incomplete) return 'incomplete';
  if (errorCount > 0 || warningCount > 0) return 'attention';
  return 'ready';
}

export function readinessLabel(readiness: SentinelReadiness): string {
  if (readiness === 'ready') return 'Ready to release';
  if (readiness === 'attention') return 'Needs attention';
  return 'Validation incomplete';
}

export function downloadReport(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
