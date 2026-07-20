import type { ReactNode } from 'react';
import { RULE_CATEGORIES } from './constants';

export function ProbeReadyState({
  scopeName,
  scriptCount,
  lineCount,
  excludedSummary,
  lastScanLabel,
  runAction,
  history,
}: {
  scopeName: string;
  scriptCount: number;
  lineCount: number;
  excludedSummary: string;
  lastScanLabel: string | null;
  runAction: ReactNode;
  history?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="probe-ready">
      <section className="probe-launch" aria-labelledby="probe-launch-title">
        <h2 id="probe-launch-title">Inspect {scopeName}</h2>
        <p className="probe-launch-lead">
          Probe performs static checks for performance risks, unsafe patterns, and potentially
          unused content without executing project scripts.
        </p>
        <dl className="probe-launch-context">
          <div>
            <dt>Scripts discovered</dt>
            <dd>{scriptCount}</dd>
          </div>
          <div>
            <dt>Lines available</dt>
            <dd>{lineCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Rule categories</dt>
            <dd>{RULE_CATEGORIES.join(' · ')}</dd>
          </div>
          <div>
            <dt>Excluded</dt>
            <dd>{excludedSummary}</dd>
          </div>
          <div>
            <dt>Last scan</dt>
            <dd>{lastScanLabel ?? 'Never'}</dd>
          </div>
        </dl>
        <div className="probe-launch-action">{runAction}</div>
      </section>

      <details className="probe-coverage">
        <summary>Scan coverage</summary>
        <ul>
          <li>Loops, waits, and hot-path native usage</li>
          <li>Event registration, duplicate handlers, and missing validation signals</li>
          <li>Functions and handlers with no discoverable static callers</li>
          <li>Dynamic references that require manual review</li>
        </ul>
        <p className="probe-disclaimer">
          Static checks do not replace runtime profiling or a full security review.
        </p>
      </details>

      {history}
    </div>
  );
}
