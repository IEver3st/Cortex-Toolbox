import {
  AlertTriangle,
  CircleDashed,
  Copy,
  FileWarning,
  FolderOpen,
  Info,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ManifestPathEntry, ManifestProblem } from './manifest-utils';

export type InspectorTab = 'problems' | 'paths' | 'document';

export type PathFilter = 'all' | 'missing' | 'patterns' | 'scripts' | 'files';

export interface ManifestDocumentInfo {
  parserMode: string;
  manifestType: string;
  filePath: string;
  encoding: string;
  lineEndings: string;
  lastSavedAt: string | null;
  backupBehavior: string;
  readOnly: boolean;
}

export interface ManifestInspectorProps {
  width: number;
  activeTab: InspectorTab;
  problems: ManifestProblem[];
  paths: ManifestPathEntry[];
  document: ManifestDocumentInfo;
  onTabChange: (tab: InspectorTab) => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onGoToLine: (line: number) => void;
  onReveal: () => void;
  onCopyPath: () => void;
}

function ProblemIcon({ severity }: { severity: ManifestProblem['severity'] }): React.JSX.Element {
  if (severity === 'error') return <XCircle aria-hidden="true" />;
  if (severity === 'warning') return <AlertTriangle aria-hidden="true" />;
  if (severity === 'review') return <FileWarning aria-hidden="true" />;
  return <Info aria-hidden="true" />;
}

function presenceLabel(entry: ManifestPathEntry): string {
  if (entry.presence === 'present') return 'Present';
  if (entry.presence === 'missing') return 'Missing';
  if (entry.presence === 'external') return 'External';
  if (entry.matchCount !== null)
    return `Pattern · ${entry.matchCount} match${entry.matchCount === 1 ? '' : 'es'}`;
  return 'Pattern';
}

export function ManifestInspector({
  width,
  activeTab,
  problems,
  paths,
  document,
  onTabChange,
  onResizeStart,
  onGoToLine,
  onReveal,
  onCopyPath,
}: ManifestInspectorProps): React.JSX.Element {
  const [pathFilter, setPathFilter] = useState<PathFilter>('all');

  const filteredPaths = useMemo(() => {
    return paths.filter((entry) => {
      if (pathFilter === 'all') return true;
      if (pathFilter === 'missing') return entry.presence === 'missing';
      if (pathFilter === 'patterns') return entry.presence === 'pattern';
      if (pathFilter === 'scripts') {
        return entry.group === 'shared' || entry.group === 'client' || entry.group === 'server';
      }
      return entry.group === 'files' || entry.group === 'data';
    });
  }, [pathFilter, paths]);

  const groupedPaths = useMemo(() => {
    const groups: { title: string; entries: ManifestPathEntry[] }[] = [
      { title: 'Shared scripts', entries: [] },
      { title: 'Client scripts', entries: [] },
      { title: 'Server scripts', entries: [] },
      { title: 'Files', entries: [] },
      { title: 'Dependencies', entries: [] },
    ];
    for (const entry of filteredPaths) {
      if (entry.group === 'shared') groups[0]?.entries.push(entry);
      else if (entry.group === 'client') groups[1]?.entries.push(entry);
      else if (entry.group === 'server') groups[2]?.entries.push(entry);
      else if (entry.group === 'files' || entry.group === 'data') groups[3]?.entries.push(entry);
      else groups[4]?.entries.push(entry);
    }
    return groups.filter((group) => group.entries.length > 0);
  }, [filteredPaths]);

  return (
    <aside className="index-inspector" style={{ width }} aria-label="Manifest inspector">
      <div
        className="index-inspector-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector"
        onPointerDown={onResizeStart}
      />
      <div className="index-inspector-inner">
        <div className="index-inspector-tabs" role="tablist" aria-label="Inspector panels">
          {(
            [
              ['problems', 'Problems', problems.length],
              ['paths', 'Paths', paths.length],
              ['document', 'Document', null],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={activeTab === id ? 'active' : ''}
              onClick={() => onTabChange(id)}
            >
              {label}
              {count !== null && count > 0 ? (
                <span className="index-tab-count">{count}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="index-inspector-body">
          {activeTab === 'problems' ? (
            problems.length === 0 ? (
              <p className="index-inspector-empty">
                No problems. Run Validate to refresh findings.
              </p>
            ) : (
              <ul className="index-problem-list">
                {problems.map((problem) => (
                  <li key={problem.id} className={`severity-${problem.severity}`}>
                    <ProblemIcon severity={problem.severity} />
                    <div className="index-problem-copy">
                      <div className="index-problem-head">
                        <strong>{problem.title}</strong>
                        {problem.line ? <span>L{problem.line}</span> : null}
                      </div>
                      <p>{problem.explanation}</p>
                      {problem.ruleId ? <code>{problem.ruleId}</code> : null}
                      {problem.line ? (
                        <button type="button" onClick={() => onGoToLine(problem.line ?? 1)}>
                          Go to line
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {activeTab === 'paths' ? (
            <>
              <div className="index-path-filters" role="toolbar" aria-label="Path filters">
                {(
                  [
                    ['all', 'All'],
                    ['missing', 'Missing'],
                    ['patterns', 'Patterns'],
                    ['scripts', 'Scripts'],
                    ['files', 'Files'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={pathFilter === id ? 'active' : ''}
                    onClick={() => setPathFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {groupedPaths.length === 0 ? (
                <p className="index-inspector-empty">No paths match this filter.</p>
              ) : (
                groupedPaths.map((group) => (
                  <section key={group.title} className="index-path-group">
                    <h3>{group.title}</h3>
                    <ul>
                      {group.entries.map((entry) => (
                        <li key={entry.id} className={`presence-${entry.presence}`}>
                          <button
                            type="button"
                            className="index-path-value"
                            onClick={() => entry.line && onGoToLine(entry.line)}
                            disabled={!entry.line}
                          >
                            <code>{entry.value}</code>
                          </button>
                          <span className="index-path-state">
                            {entry.presence === 'missing' ? (
                              <CircleDashed aria-hidden="true" />
                            ) : null}
                            {presenceLabel(entry)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </>
          ) : null}

          {activeTab === 'document' ? (
            <div className="index-document-panel">
              <dl className="index-document-facts">
                <div>
                  <dt>Parser mode</dt>
                  <dd>{document.parserMode}</dd>
                </div>
                <div>
                  <dt>Manifest type</dt>
                  <dd>{document.manifestType}</dd>
                </div>
                <div>
                  <dt>File path</dt>
                  <dd>
                    <code>{document.filePath}</code>
                  </dd>
                </div>
                <div>
                  <dt>Encoding</dt>
                  <dd>{document.encoding}</dd>
                </div>
                <div>
                  <dt>Line endings</dt>
                  <dd>{document.lineEndings}</dd>
                </div>
                <div>
                  <dt>Last saved</dt>
                  <dd>{document.lastSavedAt ?? 'Not saved yet'}</dd>
                </div>
                <div>
                  <dt>Backup</dt>
                  <dd>{document.backupBehavior}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>{document.readOnly ? 'Read-only' : 'Writable'}</dd>
                </div>
              </dl>

              <div className="index-document-actions">
                <button type="button" onClick={onReveal}>
                  <FolderOpen aria-hidden="true" />
                  Open in Explorer
                </button>
                <button type="button" onClick={onCopyPath}>
                  <Copy aria-hidden="true" />
                  Copy path
                </button>
              </div>

              <section className="index-safe-write" aria-label="Safe write policy">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <strong>Safe write policy</strong>
                  <p>
                    Apply creates or replaces only this manifest under the workspace root. Existing
                    files receive a timestamped backup under <code>.cortex/backups/</code> before
                    replacement.
                  </p>
                  <p className="index-structured-note">
                    The restricted parser preserves comments, formatting, and unrecognized
                    declarations whenever possible.
                  </p>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
