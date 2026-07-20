import type { AuditFinding, Severity, SortMode } from './constants';
import { SEVERITY_META, SEVERITY_ORDER } from './constants';
import { findingKey, locationLabel, ruleMeta } from './utils';

export function SentinelFindingsList({
  findings,
  grouped,
  sortMode,
  selectedKey,
  hiddenRules,
  onSelect,
  showGroupHeaders = true,
}: {
  findings: AuditFinding[];
  grouped: Record<Severity, AuditFinding[]> | null;
  sortMode: SortMode;
  selectedKey: string | null;
  hiddenRules: Set<string>;
  onSelect: (key: string) => void;
  showGroupHeaders?: boolean;
}): React.JSX.Element {
  if (sortMode === 'severity' && grouped && showGroupHeaders) {
    return (
      <>
        {SEVERITY_ORDER.map((severity) => {
          const items = grouped[severity];
          if (!items.length) return null;
          const meta = SEVERITY_META[severity];
          const Icon = meta.Icon;
          return (
            <section
              key={severity}
              className={`sentinel-findings-group severity-${severity}`}
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
                    severityLabel={severityRowLabel(finding.severity)}
                    selectedKey={selectedKey}
                    hiddenRules={hiddenRules}
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
    <ul className="sentinel-findings-flat">
      {findings.map((finding) => (
        <FindingRow
          key={findingKey(finding)}
          finding={finding}
          severityLabel={severityRowLabel(finding.severity)}
          selectedKey={selectedKey}
          hiddenRules={hiddenRules}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function severityRowLabel(severity: AuditFinding['severity']): string {
  if (severity === 'error') return 'Error';
  if (severity === 'warning') return 'Warning';
  return 'Note';
}

function FindingRow({
  finding,
  severityLabel,
  selectedKey,
  hiddenRules,
  onSelect,
}: {
  finding: AuditFinding;
  severityLabel: string;
  selectedKey: string | null;
  hiddenRules: Set<string>;
  onSelect: (key: string) => void;
}): React.JSX.Element {
  const key = findingKey(finding);
  const metaRule = ruleMeta(finding.ruleId);
  const isSuppressed = finding.suppressed || hiddenRules.has(finding.ruleId);
  const actionLabel = finding.ruleId.startsWith('manifest/') ? 'Review' : 'Open file';

  return (
    <li>
      <button
        type="button"
        className={`sentinel-finding-row${selectedKey === key ? ' is-selected' : ''}${isSuppressed ? ' is-suppressed' : ''}`}
        aria-pressed={selectedKey === key}
        onClick={() => onSelect(key)}
      >
        <div className="sentinel-finding-leading">
          <span className={`sentinel-severity-label severity-${finding.severity}`}>
            {severityLabel}
          </span>
        </div>
        <div className="sentinel-finding-copy">
          <strong>{metaRule.title}</strong>
          <span>{finding.explanation}</span>
          <span className="sentinel-finding-loc mono">
            <span>{locationLabel(finding)}</span>
            <span className="sentinel-finding-category">{metaRule.category}</span>
            {isSuppressed ? <span className="sentinel-finding-state">Suppressed</span> : null}
          </span>
        </div>
        <span className="sentinel-finding-action">{actionLabel}</span>
      </button>
    </li>
  );
}
