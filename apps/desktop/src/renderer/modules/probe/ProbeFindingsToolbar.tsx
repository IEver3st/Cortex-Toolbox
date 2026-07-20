import { Info, Search } from 'lucide-react';
import {
  CATEGORY_LABEL,
  type CategoryFilter,
  type ConfidenceFilter,
  type DeltaFilter,
  type GroupMode,
  type SeverityFilter,
  type SortMode,
} from './constants';

export function ProbeFindingsToolbar({
  severityFilter,
  onSeverityFilter,
  counts,
  totalVisible,
  search,
  onSearch,
  categoryFilter,
  onCategoryFilter,
  confidenceFilter,
  onConfidenceFilter,
  deltaFilter,
  onDeltaFilter,
  sortMode,
  onSortMode,
  groupMode,
  onGroupMode,
}: {
  severityFilter: SeverityFilter;
  onSeverityFilter: (value: SeverityFilter) => void;
  counts: { high: number; medium: number; low: number; info: number };
  totalVisible: number;
  search: string;
  onSearch: (value: string) => void;
  categoryFilter: CategoryFilter;
  onCategoryFilter: (value: CategoryFilter) => void;
  confidenceFilter: ConfidenceFilter;
  onConfidenceFilter: (value: ConfidenceFilter) => void;
  deltaFilter: DeltaFilter;
  onDeltaFilter: (value: DeltaFilter) => void;
  sortMode: SortMode;
  onSortMode: (value: SortMode) => void;
  groupMode: GroupMode;
  onGroupMode: (value: GroupMode) => void;
}): React.JSX.Element {
  return (
    <div className="probe-findings-toolbar" role="toolbar" aria-label="Findings filters">
      <div className="probe-filter-group" role="group" aria-label="Severity">
        {(
          [
            ['all', 'All', totalVisible],
            ['high', 'High', counts.high],
            ['medium', 'Medium', counts.medium],
            ['low', 'Low', counts.low],
            ['info', 'Info', counts.info],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={`probe-filter${severityFilter === key ? ' is-active' : ''}${
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
      <label className="probe-search">
        <Search aria-hidden="true" />
        <span className="sr-only">Search findings</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search findings"
        />
      </label>
      <label className="probe-select-wrap">
        <span className="sr-only">Category</span>
        <select
          className="probe-select"
          value={categoryFilter}
          onChange={(event) => onCategoryFilter(event.target.value as CategoryFilter)}
        >
          <option value="all">All categories</option>
          {(Object.keys(CATEGORY_LABEL) as Array<keyof typeof CATEGORY_LABEL>).map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABEL[key]}
            </option>
          ))}
          <option value="reviewed">Reviewed / suppressed</option>
        </select>
      </label>
      <label className="probe-select-wrap">
        <span className="sr-only">Confidence</span>
        <select
          className="probe-select"
          value={confidenceFilter}
          onChange={(event) => onConfidenceFilter(event.target.value as ConfidenceFilter)}
        >
          <option value="all">All confidence</option>
          <option value="high">High confidence</option>
          <option value="medium">Medium confidence</option>
          <option value="low">Low confidence</option>
        </select>
      </label>
      <label className="probe-select-wrap">
        <span className="sr-only">Changed since last scan</span>
        <select
          className="probe-select"
          value={deltaFilter}
          onChange={(event) => onDeltaFilter(event.target.value as DeltaFilter)}
        >
          <option value="all">All changes</option>
          <option value="new">New since last scan</option>
          <option value="unchanged">Unchanged</option>
          <option value="resolved">Resolved</option>
        </select>
      </label>
      <label className="probe-select-wrap">
        <span className="sr-only">Sort</span>
        <select
          className="probe-select"
          value={sortMode}
          onChange={(event) => onSortMode(event.target.value as SortMode)}
        >
          <option value="severity">Sort by severity</option>
          <option value="file">Sort by file path</option>
        </select>
      </label>
      <label className="probe-select-wrap">
        <span className="sr-only">Grouping</span>
        <select
          className="probe-select"
          value={groupMode}
          onChange={(event) => onGroupMode(event.target.value as GroupMode)}
        >
          <option value="severity">Group by severity</option>
          <option value="none">Flat list</option>
        </select>
      </label>
    </div>
  );
}

export function ProbeEmptyFilter({ onReset }: { onReset: () => void }): React.JSX.Element {
  return (
    <div className="probe-empty-filter" role="status">
      <Info aria-hidden="true" />
      <div>
        <strong>No findings match the current filters</strong>
        <p>Try another severity, category, confidence, or search term.</p>
      </div>
      <button type="button" onClick={onReset}>
        Reset filters
      </button>
    </div>
  );
}
