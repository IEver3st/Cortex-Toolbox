import { ChevronDown, Info, Search } from 'lucide-react';
import type { CategoryFilter, Severity, SeverityFilter, SortMode } from './constants';

export function SentinelFindingsToolbar({
  severityFilter,
  onSeverityFilter,
  counts,
  totalVisible,
  totalFindings,
  search,
  onSearch,
  categoryFilter,
  onCategoryFilter,
  sortMode,
  onSortMode,
}: {
  severityFilter: SeverityFilter;
  onSeverityFilter: (value: SeverityFilter) => void;
  counts: { error: number; warning: number; info: number };
  totalVisible: number;
  totalFindings: number;
  search: string;
  onSearch: (value: string) => void;
  categoryFilter: CategoryFilter;
  onCategoryFilter: (value: CategoryFilter) => void;
  sortMode: SortMode;
  onSortMode: (value: SortMode) => void;
}): React.JSX.Element {
  const compact = totalFindings <= 5;
  const showSearch = totalFindings > 3;

  return (
    <div className="sentinel-findings-toolbar" role="toolbar" aria-label="Findings filters">
      <div className="sentinel-filter-group" role="group" aria-label="Severity">
        {(
          [
            ['all', 'All', totalVisible],
            ['error', 'Errors', counts.error],
            ['warning', 'Warnings', counts.warning],
            ['info', 'Notes', counts.info],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={`sentinel-filter${severityFilter === key ? ' is-active' : ''}${
              key !== 'all' && count === 0 ? ' is-empty' : ''
            }`}
            aria-pressed={severityFilter === key}
            disabled={key !== 'all' && count === 0}
            onClick={() => onSeverityFilter(key)}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>

      {showSearch ? (
        <label className="sentinel-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search findings</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search findings"
          />
        </label>
      ) : null}

      {compact ? (
        <details className="sentinel-view-menu">
          <summary>
            View
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="sentinel-view-menu-body">
            <label>
              <span>Category</span>
              <select
                className="sentinel-select"
                value={categoryFilter}
                onChange={(event) => onCategoryFilter(event.target.value as CategoryFilter)}
              >
                <option value="all">All categories</option>
                <option value="Manifest">Manifest</option>
                <option value="Paths">Paths</option>
                <option value="Files">Files</option>
                <option value="Secrets">Secrets</option>
              </select>
            </label>
            <label>
              <span>Grouping</span>
              <select
                className="sentinel-select"
                value={sortMode}
                onChange={(event) => onSortMode(event.target.value as SortMode)}
              >
                <option value="severity">Group by severity</option>
                <option value="file">Sort by file path</option>
              </select>
            </label>
          </div>
        </details>
      ) : (
        <>
          <label className="sentinel-select-wrap">
            <span className="sr-only">Category</span>
            <select
              className="sentinel-select"
              value={categoryFilter}
              onChange={(event) => onCategoryFilter(event.target.value as CategoryFilter)}
            >
              <option value="all">All categories</option>
              <option value="Manifest">Manifest</option>
              <option value="Paths">Paths</option>
              <option value="Files">Files</option>
              <option value="Secrets">Secrets</option>
            </select>
          </label>
          <label className="sentinel-select-wrap">
            <span className="sr-only">Grouping</span>
            <select
              className="sentinel-select"
              value={sortMode}
              onChange={(event) => onSortMode(event.target.value as SortMode)}
            >
              <option value="severity">Group by severity</option>
              <option value="file">Sort by file path</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
}

export function SentinelEmptyFilter({ onReset }: { onReset: () => void }): React.JSX.Element {
  return (
    <div className="sentinel-empty-filter" role="status">
      <Info aria-hidden="true" />
      <div>
        <strong>No findings match the current filters</strong>
        <p>Try another severity, category, or search term.</p>
      </div>
      <button type="button" onClick={onReset}>
        Reset filters
      </button>
    </div>
  );
}

export type { Severity };
