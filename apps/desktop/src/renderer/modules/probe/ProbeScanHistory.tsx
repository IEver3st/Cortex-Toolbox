import type { ProbeRunRecord } from '../../lib/probe-history';
import { formatDateTime, formatDuration } from './utils';

export function ProbeScanHistory({
  runs,
  total,
  showAll,
  onShowAll,
  currentRunId,
}: {
  runs: ProbeRunRecord[];
  total: number;
  showAll: boolean;
  onShowAll: () => void;
  currentRunId?: string | null;
}): React.JSX.Element | null {
  if (runs.length === 0) return null;

  return (
    <section className="probe-history" aria-label="Recent scans">
      <div className="probe-history-head">
        <h3>Recent scans</h3>
        {total > runs.length && !showAll ? (
          <button type="button" className="text-button" onClick={onShowAll}>
            Show all ({total})
          </button>
        ) : null}
      </div>
      <ul>
        {runs.map((run) => (
          <li key={run.id} className={run.id === currentRunId ? 'is-current' : undefined}>
            <div className="probe-history-main">
              <strong>{formatDateTime(run.at)}</strong>
              <span>
                {run.highCount} high · {run.mediumCount} medium · {run.lowCount} low
              </span>
            </div>
            <div className="probe-history-meta">
              <span>{run.scripts} scripts</span>
              <span>{formatDuration(run.durationMs)}</span>
              <span>rules {run.ruleSetVersion}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
