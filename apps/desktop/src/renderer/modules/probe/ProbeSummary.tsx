import type { ProbeOverallState } from '../../lib/probe-history';
import type { ReactNode } from 'react';
import { formatDateTime, formatDuration, overallStateDetail, overallStateLabel } from './utils';

export function ProbeSummary({
  state,
  counts,
  scripts,
  lines,
  durationMs,
  completedAt,
  dynamicReferences,
  skippedFiles,
  rulesExecuted,
  runAction,
}: {
  state: ProbeOverallState;
  counts: { high: number; medium: number; low: number; info: number };
  scripts: number;
  lines: number;
  durationMs: number | null;
  completedAt: string | null;
  dynamicReferences: number;
  skippedFiles: number;
  rulesExecuted: number;
  runAction: ReactNode;
}): React.JSX.Element {
  return (
    <section className={`probe-summary state-${state}`} aria-label="Scan summary">
      <div className="probe-summary-main">
        <div className="probe-summary-headline">
          <span className="probe-summary-kicker">{overallStateLabel(state)}</span>
          <p className="probe-summary-detail">{overallStateDetail(state, counts)}</p>
        </div>
        <dl className="probe-summary-stats">
          <div className={counts.high > 0 ? 'is-hot' : undefined}>
            <dt>High</dt>
            <dd>{counts.high}</dd>
          </div>
          <div className={counts.medium > 0 ? 'is-warm' : undefined}>
            <dt>Medium</dt>
            <dd>{counts.medium}</dd>
          </div>
          <div>
            <dt>Low</dt>
            <dd>{counts.low}</dd>
          </div>
          <div>
            <dt>Info</dt>
            <dd>{counts.info}</dd>
          </div>
          <div>
            <dt>Scripts</dt>
            <dd>{scripts}</dd>
          </div>
          <div>
            <dt>Lines inspected</dt>
            <dd>{lines.toLocaleString()}</dd>
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
          <div className={dynamicReferences > 0 ? 'is-warm' : undefined}>
            <dt>Dynamic refs</dt>
            <dd>{dynamicReferences}</dd>
          </div>
          {skippedFiles > 0 && (
            <div className="is-hot">
              <dt>Skipped files</dt>
              <dd>{skippedFiles}</dd>
            </div>
          )}
          <div>
            <dt>Rules executed</dt>
            <dd>{rulesExecuted}</dd>
          </div>
        </dl>
      </div>
      <div className="probe-summary-actions">{runAction}</div>
    </section>
  );
}
