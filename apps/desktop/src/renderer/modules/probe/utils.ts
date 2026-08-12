import type { ProbeFinding } from '@cortex/script-analysis';
import { probeRuleMeta } from '@cortex/script-analysis';
import type { ProbeOverallState } from '../../lib/probe-history';

export function findingKey(finding: ProbeFinding): string {
  return finding.id;
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

export function locationLabel(finding: ProbeFinding): string {
  if (finding.startLine === finding.endLine) return `${finding.file}:${finding.startLine}`;
  return `${finding.file}:${finding.startLine}–${finding.endLine}`;
}

export function ruleMeta(ruleId: string) {
  return probeRuleMeta(ruleId);
}

export function overallStateLabel(state: ProbeOverallState): string {
  if (state === 'clear') return 'Clear';
  if (state === 'needs-review') return 'Needs review';
  if (state === 'high-risk') return 'High-risk findings';
  return 'Scan incomplete';
}

export function overallStateDetail(
  state: ProbeOverallState,
  counts: { high: number; medium: number; low: number; info: number },
): string {
  if (state === 'clear') return 'No actionable static findings were detected.';
  if (state === 'incomplete') return 'Some files could not be inspected. Treat results as partial.';
  if (state === 'high-risk') {
    return `${counts.high} high-severity finding${counts.high === 1 ? '' : 's'} should be reviewed first.`;
  }
  return `${counts.medium} medium and ${counts.low} low findings may need attention.`;
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

export function buildExcerpt(
  content: string,
  startLine: number,
  endLine: number,
  context = 2,
): string {
  const lines = content.replaceAll('\r\n', '\n').split('\n');
  const from = Math.max(0, startLine - 1 - context);
  const to = Math.min(lines.length, endLine + context);
  return lines
    .slice(from, to)
    .map((line, index) => {
      const lineNo = from + index + 1;
      const marker = lineNo >= startLine && lineNo <= endLine ? '>' : ' ';
      return `${String(lineNo).padStart(4, ' ')}${marker}| ${line}`;
    })
    .join('\n');
}
