import type { SentinelRunRecord } from '../../lib/sentinel-history';
import { compareSentinelRuns, type SentinelTrend } from '../../lib/sentinel-history';
import { forwardRef } from 'react';
import { formatDateTime, formatDuration, readinessLabel } from './utils';

function trendLabel(trend: SentinelTrend): string {
  if (trend === 'improved') return 'Improved';
  if (trend === 'regressed') return 'Regressed';
  if (trend === 'unchanged') return 'Unchanged';
  return 'First run';
}

export const SentinelValidationHistory = forwardRef<
  HTMLElement,
  {
    runs: SentinelRunRecord[];
    total: number;
    showAll: boolean;
    onShowAll: () => void;
  }
>(function SentinelValidationHistory({ runs, total, showAll, onShowAll }, ref) {
  return (
    <section
      ref={ref}
      id="sentinel-history"
      className="sentinel-history"
      aria-label="Recent validations"
    >
      <header>
        <h2 className="sentinel-section-label">Recent validations</h2>
        {total > 3 && !showAll && (
          <button type="button" className="text-button" onClick={onShowAll}>
            View all ({total})
          </button>
        )}
      </header>

      {runs.length === 0 ? (
        <p className="sentinel-history-empty" role="status">
          No validations have been run for this workspace.
        </p>
      ) : (
        <table className="sentinel-history-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Readiness</th>
              <th scope="col">Errors</th>
              <th scope="col">Warnings</th>
              <th scope="col">Notes</th>
              <th scope="col">Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, index) => {
              const prior = runs[index + 1] ?? null;
              const trend = compareSentinelRuns(run, prior);
              return (
                <tr key={run.id}>
                  <td className="mono">{formatDateTime(run.at)}</td>
                  <td>
                    <span className={`sentinel-history-readiness readiness-${run.readiness}`}>
                      {readinessLabel(run.readiness)}
                    </span>
                    {trend !== 'first' && (
                      <span className={`sentinel-history-trend trend-${trend}`}>
                        {trendLabel(trend)}
                      </span>
                    )}
                  </td>
                  <td className="mono is-hot">{run.errorCount}</td>
                  <td className="mono is-warm">{run.warningCount}</td>
                  <td className="mono">{run.noteCount}</td>
                  <td className="mono">{formatDuration(run.durationMs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
});
