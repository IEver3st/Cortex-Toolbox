import type { SentinelReadiness } from '../../lib/sentinel-history';
import type { ReactNode } from 'react';
import { formatDateTime, formatDuration, readinessLabel } from './utils';

function readinessDetail(
  readiness: SentinelReadiness,
  errorCount: number,
  warningCount: number,
  noteCount: number,
): string {
  if (readiness === 'ready') {
    if (noteCount === 1) {
      return 'Sentinel found no blocking issues. One declaration was preserved for manual review.';
    }
    if (noteCount > 1) {
      return `Sentinel found no blocking issues. ${noteCount} declarations were preserved for manual review.`;
    }
    return 'Sentinel found no blocking issues in enabled checks.';
  }
  if (readiness === 'attention') {
    return `${errorCount} error${errorCount === 1 ? '' : 's'} and ${warningCount} warning${warningCount === 1 ? '' : 's'} need review before release.`;
  }
  return 'The last run did not complete successfully.';
}

export function SentinelReadinessSummary({
  readiness,
  releaseBlocked,
  errorCount,
  warningCount,
  noteCount,
  durationMs,
  completedAt,
  runAction,
  exportMenu,
}: {
  readiness: SentinelReadiness;
  releaseBlocked: boolean;
  errorCount: number;
  warningCount: number;
  noteCount: number;
  durationMs: number | null;
  completedAt: string | null;
  runAction: ReactNode;
  exportMenu: ReactNode;
}): React.JSX.Element {
  return (
    <section
      className={`sentinel-summary readiness-${readiness}`}
      aria-label="Release readiness summary"
    >
      <div className="sentinel-summary-main">
        <div className="sentinel-summary-headline">
          <h2 className="sentinel-summary-kicker">{readinessLabel(readiness)}</h2>
          <p className="sentinel-summary-detail">
            {readinessDetail(readiness, errorCount, warningCount, noteCount)}
          </p>
        </div>
        <dl className="sentinel-summary-stats">
          <div className={releaseBlocked ? 'is-hot' : undefined}>
            <dt>Release blocked</dt>
            <dd>{releaseBlocked ? 'Yes' : 'No'}</dd>
          </div>
          <div className={errorCount > 0 ? 'is-hot' : undefined}>
            <dt>Errors</dt>
            <dd>{errorCount}</dd>
          </div>
          <div className={warningCount > 0 ? 'is-warm' : undefined}>
            <dt>Warnings</dt>
            <dd>{warningCount}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{noteCount}</dd>
          </div>
          {durationMs != null && (
            <div>
              <dt>Duration</dt>
              <dd>{formatDuration(durationMs)}</dd>
            </div>
          )}
          {completedAt && (
            <div>
              <dt>Completed</dt>
              <dd>{formatDateTime(completedAt)}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="sentinel-summary-actions">
        {exportMenu}
        {runAction}
      </div>
    </section>
  );
}
