import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ProbeFinding } from '@cortex/script-analysis';
import { NAV_AREAS, type CategoryFilter } from './constants';

export function ProbeNavPane({
  collapsed,
  onToggleCollapsed,
  areaFilter,
  onAreaFilter,
  findings,
  fileCounts,
  reviewedCount,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  areaFilter: CategoryFilter;
  onAreaFilter: (value: CategoryFilter) => void;
  findings: ProbeFinding[];
  fileCounts: { file: string; count: number }[];
  reviewedCount: number;
}): React.JSX.Element {
  const areaCounts = new Map<CategoryFilter, number>();
  areaCounts.set('all', findings.length);
  for (const area of NAV_AREAS) {
    if (area.id === 'all' || area.id === 'reviewed') continue;
    areaCounts.set(area.id, findings.filter((finding) => finding.category === area.id).length);
  }
  areaCounts.set('reviewed', reviewedCount);

  return (
    <aside
      className={`probe-nav${collapsed ? ' is-collapsed' : ''}`}
      aria-label="Review areas and files"
    >
      <div className="probe-nav-head">
        {!collapsed ? <span className="probe-section-label">Review areas</span> : null}
        <button
          type="button"
          className="icon-button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand navigation pane' : 'Collapse navigation pane'}
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        </button>
      </div>

      {!collapsed ? (
        <>
          <ul className="probe-nav-areas" role="listbox" aria-label="Review areas">
            {NAV_AREAS.map((area) => (
              <li key={area.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={areaFilter === area.id}
                  className={`probe-nav-item${areaFilter === area.id ? ' is-active' : ''}`}
                  onClick={() => onAreaFilter(area.id)}
                >
                  <span>{area.label}</span>
                  <span className="probe-nav-count">{areaCounts.get(area.id) ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="probe-nav-divider" />

          <span className="probe-section-label">Files</span>
          <ul className="probe-nav-files" aria-label="Files with findings">
            {fileCounts.length === 0 ? (
              <li className="probe-nav-empty">No file hotspots yet</li>
            ) : (
              fileCounts.map((entry) => (
                <li key={entry.file}>
                  <button
                    type="button"
                    className="probe-nav-item probe-nav-file"
                    onClick={() => onAreaFilter('all')}
                    title={entry.file}
                  >
                    <span className="mono">{entry.file}</span>
                    <span className="probe-nav-count">{entry.count}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      ) : null}
    </aside>
  );
}
