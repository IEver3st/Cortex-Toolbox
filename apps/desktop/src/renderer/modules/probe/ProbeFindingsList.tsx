import type { ProbeFinding } from '@cortex/script-analysis';
import type { ProbeFindingDelta } from '../../lib/probe-history';
import {
  CATEGORY_LABEL,
  CONFIDENCE_LABEL,
  SEVERITY_META,
  SEVERITY_ORDER,
  type GroupMode,
  type SortMode,
} from './constants';
import { findingKey, locationLabel } from './utils';

export function ProbeFindingsList({
  findings,
  grouped,
  sortMode,
  groupMode,
  selectedKey,
  reviewedKeys,
  suppressedKeys,
  deltas,
  onSelect,
}: {
  findings: ProbeFinding[];
  grouped: Record<string, ProbeFinding[]> | null;
  sortMode: SortMode;
  groupMode: GroupMode;
  selectedKey: string | null;
  reviewedKeys: Set<string>;
  suppressedKeys: Set<string>;
  deltas: Map<string, ProbeFindingDelta>;
  onSelect: (key: string) => void;
}): React.JSX.Element {
  if (groupMode === 'severity' && grouped && sortMode === 'severity') {
    return (
      <>
        {SEVERITY_ORDER.map((severity) => {
          const items = grouped[severity];
          if (!items?.length) return null;
          const meta = SEVERITY_META[severity];
          const Icon = meta.Icon;
          return (
            <section
              key={severity}
              className={`probe-findings-group severity-${severity}`}
              aria-label={meta.label}
            >
              <header>
                <Icon aria-hidden="true" />
                <h3>{meta.label}</h3>
                <span>{items.length}</span>
              </header>
              <ul>
                {items.map((finding) => (
                  <FindingRow
                    key={findingKey(finding)}
                    finding={finding}
                    Icon={Icon}
                    selectedKey={selectedKey}
                    reviewedKeys={reviewedKeys}
                    suppressedKeys={suppressedKeys}
                    delta={deltas.get(finding.id) ?? 'unchanged'}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </>
    );
  }

  return (
    <ul className="probe-findings-flat">
      {findings.map((finding) => {
        const Icon = SEVERITY_META[finding.severity].Icon;
        return (
          <FindingRow
            key={findingKey(finding)}
            finding={finding}
            Icon={Icon}
            selectedKey={selectedKey}
            reviewedKeys={reviewedKeys}
            suppressedKeys={suppressedKeys}
            delta={deltas.get(finding.id) ?? 'unchanged'}
            onSelect={onSelect}
          />
        );
      })}
    </ul>
  );
}

function FindingRow({
  finding,
  Icon,
  selectedKey,
  reviewedKeys,
  suppressedKeys,
  delta,
  onSelect,
}: {
  finding: ProbeFinding;
  Icon: typeof SEVERITY_META.high.Icon;
  selectedKey: string | null;
  reviewedKeys: Set<string>;
  suppressedKeys: Set<string>;
  delta: ProbeFindingDelta;
  onSelect: (key: string) => void;
}): React.JSX.Element {
  const key = findingKey(finding);
  const isReviewed = reviewedKeys.has(key);
  const isSuppressed = suppressedKeys.has(key);

  return (
    <li>
      <button
        type="button"
        className={`probe-finding-row${selectedKey === key ? ' is-selected' : ''}${isSuppressed ? ' is-suppressed' : ''}${isReviewed ? ' is-reviewed' : ''}`}
        aria-pressed={selectedKey === key}
        onClick={() => onSelect(key)}
      >
        <Icon aria-hidden="true" className="probe-finding-icon" />
        <div className="probe-finding-copy">
          <div className="probe-finding-title-row">
            <span className={`probe-severity-label severity-${finding.severity}`}>
              {SEVERITY_META[finding.severity].short}
            </span>
            <strong>{finding.title}</strong>
            {delta === 'new' ? <span className="probe-delta is-new">New</span> : null}
            {delta === 'resolved' ? (
              <span className="probe-delta is-resolved">Resolved</span>
            ) : null}
            {isReviewed ? <span className="probe-delta is-reviewed">Reviewed</span> : null}
          </div>
          <span>{finding.explanation}</span>
          <span className="probe-finding-loc mono">
            <span>{locationLabel(finding)}</span>
          </span>
          <span className="probe-finding-meta">
            {CATEGORY_LABEL[finding.category]} · {CONFIDENCE_LABEL[finding.confidence]}
          </span>
        </div>
        <span className="probe-finding-action" aria-hidden="true">
          Open in editor
        </span>
      </button>
    </li>
  );
}
