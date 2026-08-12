import { ChevronDown, MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { SEVERITY_META, type Severity } from './constants';

export function SentinelHeader({
  phase,
  scopeName,
  manifestName,
  runAction,
  overflowMenu,
}: {
  phase: 'ready' | 'scanning' | 'results' | 'failed';
  scopeName: string;
  manifestName: string | null;
  runAction?: ReactNode;
  overflowMenu?: ReactNode;
}): React.JSX.Element {
  const showRunInHeader = phase === 'scanning' || phase === 'failed';

  return (
    <header className="sentinel-header">
      <div className="sentinel-header-main">
        <div className="sentinel-header-copy">
          <h1>Sentinel</h1>
          <p>Validate manifests, paths, package hygiene, and sensitive files.</p>
          <p className="sentinel-header-context">
            <span>{scopeName}</span>
            <span aria-hidden="true">·</span>
            <span className="mono">{manifestName ?? 'No manifest'}</span>
            <span aria-hidden="true">·</span>
            <span>Static validation</span>
          </p>
        </div>
        <div className="sentinel-header-actions">
          {overflowMenu}
          {showRunInHeader ? runAction : null}
        </div>
      </div>
    </header>
  );
}

export function SentinelOverflowMenu({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <details className="sentinel-overflow-menu">
      <summary aria-label="More options">
        <MoreHorizontal aria-hidden="true" />
      </summary>
      <div className="sentinel-overflow-menu-body" role="menu">
        {children}
      </div>
    </details>
  );
}

export function SentinelSeverityLegend(): React.JSX.Element {
  return (
    <details className="sentinel-severity-legend">
      <summary>
        Finding severity
        <ChevronDown aria-hidden="true" />
      </summary>
      <ul>
        {(Object.keys(SEVERITY_META) as Severity[]).map((key) => {
          const meta = SEVERITY_META[key];
          const Icon = meta.Icon;
          return (
            <li key={key} className={`severity-${key}`}>
              <Icon aria-hidden="true" />
              <div>
                <strong>{meta.label}</strong>
                <span>{meta.impact}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
