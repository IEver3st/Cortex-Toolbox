import type { ProbeSeverity } from '@cortex/script-analysis';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { SEVERITY_META } from './constants';

export function ProbeHeader({
  workspaceName,
  lastScanLabel,
  scanStateLabel,
  phase,
  runAction,
  overflowMenu,
}: {
  workspaceName: string | null;
  lastScanLabel: string | null;
  scanStateLabel: string | null;
  phase: 'ready' | 'scanning' | 'results' | 'failed';
  runAction?: ReactNode;
  overflowMenu?: ReactNode;
}): React.JSX.Element {
  const showRunInHeader = phase === 'results' || phase === 'failed' || phase === 'scanning';

  return (
    <header className="probe-header">
      <div className="probe-header-main">
        <div className="probe-header-copy">
          <h1>Probe</h1>
          <p>Find performance risks, unsafe patterns, and potentially unused content.</p>
          {workspaceName ? (
            <dl className="probe-header-meta">
              <div>
                <dt>Workspace</dt>
                <dd>{workspaceName}</dd>
              </div>
              {lastScanLabel ? (
                <div>
                  <dt>Last scan</dt>
                  <dd>{lastScanLabel}</dd>
                </div>
              ) : null}
              {scanStateLabel ? (
                <div>
                  <dt>State</dt>
                  <dd>{scanStateLabel}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
        <div className="probe-header-actions">
          {overflowMenu}
          {showRunInHeader ? runAction : null}
        </div>
      </div>
    </header>
  );
}

export function ProbeOverflowMenu({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <details className="probe-overflow-menu">
      <summary aria-label="More actions">
        <MoreHorizontal aria-hidden="true" />
      </summary>
      <div className="probe-overflow-menu-body" role="menu">
        {children}
      </div>
    </details>
  );
}

export function ProbeSeverityLegend(): React.JSX.Element {
  return (
    <details className="probe-severity-legend">
      <summary>
        Severity guide
        <ChevronDown aria-hidden="true" />
      </summary>
      <ul>
        {(Object.keys(SEVERITY_META) as ProbeSeverity[]).map((key) => {
          const meta = SEVERITY_META[key];
          const Icon = meta.Icon;
          return (
            <li key={key} className={`severity-${key}`}>
              <Icon aria-hidden="true" />
              <div>
                <strong>{meta.label}</strong>
                <span>Static signal — not a runtime measurement.</span>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
