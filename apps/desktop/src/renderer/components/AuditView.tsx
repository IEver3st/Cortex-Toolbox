import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, FolderOpen, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unwrap } from '../lib/result';
import { recordActivity } from '../lib/activity-history';
import {
  countSentinelRuns,
  listSentinelRuns,
  recordSentinelRun,
  type SentinelRunRecord,
} from '../lib/sentinel-history';
import { useWorkspaceStore } from '../store/workspace';
import { ActionButton } from './ActionButton';
import { ResultsRefreshBar, StateCrossfade } from './ScanState';
import { EmptyState } from './UiPrimitives';
import { ValidationStages, type StageStatus, type ValidationStage } from './ValidationStages';
import type {
  AuditFinding,
  CategoryFilter,
  Severity,
  SeverityFilter,
  SortMode,
} from './sentinel/constants';
import { SEVERITY_META, SEVERITY_ORDER, STAGE_DEFS } from './sentinel/constants';
import { SentinelChecksOverview } from './sentinel/SentinelChecksOverview';
import { SentinelFindingInspector } from './sentinel/SentinelFindingInspector';
import { SentinelFindingsList } from './sentinel/SentinelFindingsList';
import { SentinelEmptyFilter, SentinelFindingsToolbar } from './sentinel/SentinelFindingsToolbar';
import {
  SentinelHeader,
  SentinelOverflowMenu,
  SentinelSeverityLegend,
} from './sentinel/SentinelHeader';
import { SentinelLaunchPanel } from './sentinel/SentinelLaunchPanel';
import { SentinelReadinessSummary } from './sentinel/SentinelReadinessSummary';
import { SentinelScanContext } from './sentinel/SentinelScanContext';
import { SentinelValidationHistory } from './sentinel/SentinelValidationHistory';
import {
  dedupeFindings,
  downloadReport,
  findingKey,
  formatDateTime,
  locationLabel,
  readinessFromCounts,
  ruleMeta,
} from './sentinel/utils';

const INSPECTOR_MIN = 380;
const INSPECTOR_MAX = 500;
const INSPECTOR_DEFAULT = 420;

function buildStages(activeIndex: number, failed: boolean): ValidationStage[] {
  return STAGE_DEFS.map((stage, index) => {
    let status: StageStatus = 'waiting';
    if (index < activeIndex) status = 'completed';
    else if (index === activeIndex) status = failed ? 'failed' : 'running';
    return { ...stage, status };
  });
}

export function AuditView(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const files = useWorkspaceStore((state) => state.files);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const lastValidation = useWorkspaceStore((state) => state.lastValidation);
  const setLastValidation = useWorkspaceStore((state) => state.setLastValidation);
  const queryClient = useQueryClient();

  const [hiddenRules, setHiddenRules] = useState<Set<string>>(new Set());
  const [suppressReasons, setSuppressReasons] = useState<Record<string, string>>({});
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('severity');
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [suppressDraft, setSuppressDraft] = useState('');
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [scanDurationMs, setScanDurationMs] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [history, setHistory] = useState<SentinelRunRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [excerpt, setExcerpt] = useState<string | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT);
  const stageTimer = useRef<number | null>(null);
  const lastRecordedScan = useRef<number | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const historyRef = useRef<HTMLElement | null>(null);

  const query = useQuery({
    queryKey: ['audit', workspace?.root],
    queryFn: async ({ signal }) => {
      const result = await window.cortex.resources.audit();
      if (signal.aborted) throw new Error('Validation cancelled.');
      return unwrap(result) as AuditFinding[];
    },
    enabled: false,
    retry: false,
  });

  const busy = query.isFetching;
  const hasResults = Boolean(query.data);
  const scanFailed = query.isError && !hasResults;
  const phase: 'ready' | 'scanning' | 'results' | 'failed' = scanFailed
    ? 'failed'
    : busy && !hasResults
      ? 'scanning'
      : hasResults
        ? 'results'
        : 'ready';

  const findings = useMemo(() => dedupeFindings(query.data ?? []), [query.data]);

  const counts = useMemo(() => {
    const base = { error: 0, warning: 0, info: 0, suppressed: 0 };
    for (const item of findings) {
      base[item.severity] += 1;
      if (item.suppressed || hiddenRules.has(item.ruleId)) base.suppressed += 1;
    }
    return base;
  }, [findings, hiddenRules]);

  const readiness = readinessFromCounts(counts.error, counts.warning, false);
  const releaseBlocked = counts.error > 0;

  const visibleFindings = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return findings.filter((finding) => {
      const isHidden = finding.suppressed || hiddenRules.has(finding.ruleId);
      if (!showSuppressed && isHidden) return false;
      if (severityFilter !== 'all' && finding.severity !== severityFilter) return false;
      const category = ruleMeta(finding.ruleId).category;
      if (categoryFilter !== 'all' && category !== categoryFilter) return false;
      if (!needle) return true;
      const meta = ruleMeta(finding.ruleId);
      const haystack = [
        meta.title,
        finding.explanation,
        finding.ruleId,
        finding.file,
        meta.category,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [findings, hiddenRules, showSuppressed, severityFilter, categoryFilter, search]);

  const sortedFindings = useMemo(() => {
    const items = [...visibleFindings];
    if (sortMode === 'file') {
      items.sort((a, b) => {
        const pathCmp = a.file.localeCompare(b.file);
        if (pathCmp !== 0) return pathCmp;
        return (a.line ?? 0) - (b.line ?? 0);
      });
      return items;
    }
    items.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
    return items;
  }, [visibleFindings, sortMode]);

  const grouped = useMemo(() => {
    if (sortMode !== 'severity') return null;
    const groups: Record<Severity, AuditFinding[]> = { error: [], warning: [], info: [] };
    for (const finding of sortedFindings) groups[finding.severity].push(finding);
    return groups;
  }, [sortedFindings, sortMode]);

  const selectedFinding = useMemo(
    () => findings.find((finding) => findingKey(finding) === selectedKey) ?? null,
    [findings, selectedKey],
  );

  const refreshHistory = useCallback(() => {
    if (!workspace) return;
    setHistory(listSentinelRuns(workspace.root, showAllHistory ? 48 : 3));
    setHistoryTotal(countSentinelRuns(workspace.root));
  }, [workspace, showAllHistory]);

  useEffect(() => {
    if (!selectedFinding || selectedFinding.file === '.') {
      setExcerpt(null);
      return;
    }
    let cancelled = false;
    void window.cortex.files.read({ relativePath: selectedFinding.file }).then((result) => {
      if (cancelled || !result.ok) {
        if (!cancelled) setExcerpt(null);
        return;
      }
      if (!selectedFinding.line) {
        setExcerpt(null);
        return;
      }
      const lines = result.data.content.split('\n');
      const lineIndex = selectedFinding.line - 1;
      const start = Math.max(0, lineIndex - 2);
      const end = Math.min(lines.length, lineIndex + 3);
      setExcerpt(
        lines
          .slice(start, end)
          .map((line, index) => `${String(start + index + 1).padStart(4, ' ')} | ${line}`)
          .join('\n'),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selectedFinding]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory, completedAt]);

  useEffect(() => {
    if (phase !== 'results' || sortedFindings.length === 0) return;
    if (selectedKey && sortedFindings.some((finding) => findingKey(finding) === selectedKey)) {
      return;
    }
    setSelectedKey(findingKey(sortedFindings[0]!));
  }, [phase, sortedFindings, selectedKey]);

  useEffect(() => {
    if (!busy) {
      if (stageTimer.current != null) {
        window.clearInterval(stageTimer.current);
        stageTimer.current = null;
      }
      return;
    }
    setStageIndex(0);
    stageTimer.current = window.setInterval(() => {
      setStageIndex((value) => Math.min(value + 1, STAGE_DEFS.length - 1));
    }, 650);
    return () => {
      if (stageTimer.current != null) window.clearInterval(stageTimer.current);
    };
  }, [busy]);

  useEffect(() => {
    if (!query.data || !workspace || !scanStartedAt) return;
    if (lastRecordedScan.current === scanStartedAt) return;
    lastRecordedScan.current = scanStartedAt;

    const deduped = dedupeFindings(query.data);
    const errorCount = deduped.filter((item) => item.severity === 'error').length;
    const warningCount = deduped.filter((item) => item.severity === 'warning').length;
    const noteCount = deduped.filter((item) => item.severity === 'info').length;

    const endedAt = Date.now();
    const durationMs = endedAt - scanStartedAt;
    const at = new Date(endedAt).toISOString();
    setScanDurationMs(durationMs);
    setCompletedAt(at);
    setLastValidation({ at, errorCount, warningCount });
    const name = workspace.project?.name ?? workspace.root.split(/[\\/]/).at(-1) ?? workspace.root;
    recordActivity({
      tool: 'sentinel',
      workspaceRoot: workspace.root,
      workspaceName: name,
      status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'success',
      summary:
        errorCount > 0
          ? `${errorCount} error${errorCount === 1 ? '' : 's'} · ${warningCount} warning${warningCount === 1 ? '' : 's'}`
          : warningCount > 0
            ? `${warningCount} warning${warningCount === 1 ? '' : 's'} · no errors`
            : 'No findings for enabled checks',
      navigate: { kind: 'sentinel', tabLabel: 'Resource validation' },
      at,
    });
    recordSentinelRun({
      workspaceRoot: workspace.root,
      at,
      durationMs,
      readiness: readinessFromCounts(errorCount, warningCount, false),
      blocked: errorCount > 0,
      errorCount,
      warningCount,
      noteCount,
    });
  }, [query.data, workspace, scanStartedAt, setLastValidation]);

  const runValidation = useCallback(() => {
    setScanStartedAt(Date.now());
    setScanDurationMs(null);
    setCompletedAt(null);
    setSelectedKey(null);
    void query.refetch();
  }, [query]);

  const cancelValidation = useCallback(() => {
    void queryClient.cancelQueries({ queryKey: ['audit', workspace?.root] });
  }, [queryClient, workspace?.root]);

  const scopeName =
    workspace?.project?.name ?? workspace?.root.split(/[\\/]/).at(-1) ?? 'Workspace';

  const runLabel = busy ? 'Validating…' : hasResults ? 'Run again' : 'Run validation';

  const runAction = (
    <ActionButton
      variant="primary"
      busy={busy}
      busyLabel="Validating…"
      icon={<Play aria-hidden="true" />}
      onClick={runValidation}
    >
      {runLabel}
    </ActionButton>
  );

  const exportJson = useCallback(() => {
    if (!workspace || !query.data) return;
    const payload = {
      workspace: workspace.root,
      manifest: workspace.manifestName,
      completedAt,
      durationMs: scanDurationMs,
      readiness,
      blocked: releaseBlocked,
      counts,
      findings,
    };
    downloadReport(
      `sentinel-${scopeName.replace(/\s+/g, '-').toLowerCase()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
  }, [
    workspace,
    query.data,
    completedAt,
    scanDurationMs,
    readiness,
    releaseBlocked,
    counts,
    findings,
    scopeName,
  ]);

  const exportMarkdown = useCallback(() => {
    if (!workspace || !query.data) return;
    const lines = [
      `# Sentinel validation — ${scopeName}`,
      '',
      `- Completed: ${completedAt ? formatDateTime(completedAt) : '—'}`,
      `- Readiness: ${readiness === 'ready' ? 'Ready to release' : 'Needs attention'}`,
      `- Errors: ${counts.error} · Warnings: ${counts.warning} · Notes: ${counts.info}`,
      '',
      '## Findings',
      '',
    ];
    for (const severity of SEVERITY_ORDER) {
      const items = findings.filter((f) => f.severity === severity);
      if (!items.length) continue;
      lines.push(`### ${SEVERITY_META[severity].label}`, '');
      for (const finding of items) {
        const meta = ruleMeta(finding.ruleId);
        lines.push(
          `- **${meta.title}** (\`${finding.ruleId}\`)`,
          `  - ${locationLabel(finding)}`,
          `  - ${finding.explanation}`,
          `  - Fix: ${finding.remediation}`,
          '',
        );
      }
    }
    downloadReport(
      `sentinel-${scopeName.replace(/\s+/g, '-').toLowerCase()}.md`,
      lines.join('\n'),
      'text/markdown',
    );
  }, [workspace, query.data, scopeName, completedAt, readiness, counts, findings]);

  const exportMenu = (
    <details className="sentinel-export-menu">
      <summary aria-label="Export report">
        Export report
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="sentinel-export-menu-body" role="menu">
        <button type="button" role="menuitem" onClick={exportJson}>
          Export JSON
        </button>
        <button type="button" role="menuitem" onClick={exportMarkdown}>
          Export Markdown
        </button>
      </div>
    </details>
  );

  const onResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      resizeRef.current = { startX: event.clientX, startWidth: inspectorWidth };
    },
    [inspectorWidth],
  );

  const onResizeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const delta = resizeRef.current.startX - event.clientX;
    const next = Math.min(
      INSPECTOR_MAX,
      Math.max(INSPECTOR_MIN, resizeRef.current.startWidth + delta),
    );
    setInspectorWidth(next);
  }, []);

  const onResizeEnd = useCallback(() => {
    resizeRef.current = null;
  }, []);

  const overflowMenu = (
    <SentinelOverflowMenu>
      {phase === 'results' && (
        <button type="button" role="menuitem" onClick={() => setShowSuppressed((value) => !value)}>
          {showSuppressed
            ? 'Hide suppressed findings'
            : `Suppressed findings (${counts.suppressed})`}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        Scan history
      </button>
      <div className="sentinel-overflow-menu-section" role="presentation">
        <SentinelSeverityLegend />
      </div>
    </SentinelOverflowMenu>
  );

  const openFindingFile = useCallback(
    (finding: AuditFinding) => {
      if (!workspace || finding.file === '.') return;
      void window.cortex.files.read({ relativePath: finding.file }).then((result) => {
        if (!result.ok) return;
        openTab({
          id: `file:${finding.file}`,
          label: finding.file.split(/[\\/]/).at(-1) ?? finding.file,
          relativePath: finding.file,
          kind: 'file',
          dirty: false,
          content: result.data.content,
          readOnly: result.data.readOnly,
        });
      });
    },
    [openTab, workspace],
  );

  const revealFinding = useCallback(
    (finding: AuditFinding) => {
      if (!workspace) return;
      const target =
        finding.file === '.'
          ? workspace.root
          : `${workspace.root.replace(/[\\/]+$/, '')}/${finding.file.replace(/^[/\\]+/, '')}`;
      void window.cortex.projects.reveal({ root: target });
    },
    [workspace],
  );

  const copyPath = useCallback(async (finding: AuditFinding) => {
    try {
      await navigator.clipboard.writeText(locationLabel(finding));
    } catch {
      /* ignore */
    }
  }, []);

  const goIndex = useCallback(() => {
    openTab({
      id: 'index',
      label: 'Index',
      relativePath: workspace?.manifestName ?? 'fxmanifest.lua',
      kind: 'index',
      dirty: false,
    });
  }, [openTab, workspace?.manifestName]);

  const stages = buildStages(busy ? stageIndex : STAGE_DEFS.length, query.isError && busy);

  const lastRunLabel = completedAt
    ? formatDateTime(completedAt)
    : lastValidation
      ? formatDateTime(lastValidation.at)
      : null;

  return (
    <div className="tool-view workbench-page sentinel-page">
      {!workspace && (
        <EmptyState
          icon={FolderOpen}
          title="Open a resource to validate"
          description="Validation is scoped to the active folder and never executes imported code."
        />
      )}

      {workspace && (
        <>
          <SentinelHeader
            phase={phase}
            scopeName={scopeName}
            manifestName={workspace.manifestName}
            runAction={runAction}
            overflowMenu={overflowMenu}
          />

          {phase === 'ready' && (
            <StateCrossfade stateKey="sentinel-ready">
              <div className="sentinel-ready">
                <div className="sentinel-launch-grid">
                  <SentinelLaunchPanel
                    scopeName={scopeName}
                    lastValidationLabel={lastRunLabel}
                    runAction={runAction}
                  />
                  <SentinelScanContext
                    scopeName={scopeName}
                    workspaceRoot={workspace.root}
                    manifestName={workspace.manifestName}
                    filesIndexed={files.length}
                  />
                </div>
                <SentinelChecksOverview />
                <SentinelValidationHistory
                  runs={history}
                  total={historyTotal}
                  showAll={showAllHistory}
                  onShowAll={() => setShowAllHistory(true)}
                />
              </div>
            </StateCrossfade>
          )}

          {phase === 'scanning' && (
            <ValidationStages stages={stages} cancellable onCancel={cancelValidation} />
          )}

          {phase === 'failed' && (
            <section className="sentinel-scan-error" role="alert">
              <AlertCircle aria-hidden="true" />
              <div>
                <h2>Validation could not finish</h2>
                <p>
                  {query.error?.message ?? 'The scanner stopped before producing a report.'} This is
                  an operational failure, not a clean workspace result.
                </p>
              </div>
              {runAction}
            </section>
          )}

          {phase === 'results' && (
            <StateCrossfade stateKey="sentinel-results">
              <div className={`sentinel-results${busy ? ' is-refreshing' : ''}`}>
                <ResultsRefreshBar active={busy} />

                <SentinelReadinessSummary
                  readiness={readiness}
                  releaseBlocked={releaseBlocked}
                  errorCount={counts.error}
                  warningCount={counts.warning}
                  noteCount={counts.info}
                  durationMs={scanDurationMs}
                  completedAt={completedAt}
                  runAction={runAction}
                  exportMenu={exportMenu}
                />

                {findings.length === 0 ? (
                  <section className="sentinel-clean" aria-label="Validation result">
                    <p>No findings in enabled checks.</p>
                  </section>
                ) : (
                  <>
                    <SentinelFindingsToolbar
                      severityFilter={severityFilter}
                      onSeverityFilter={setSeverityFilter}
                      counts={counts}
                      totalVisible={visibleFindings.length}
                      totalFindings={findings.length}
                      search={search}
                      onSearch={setSearch}
                      categoryFilter={categoryFilter}
                      onCategoryFilter={setCategoryFilter}
                      sortMode={sortMode}
                      onSortMode={setSortMode}
                    />

                    <div className="sentinel-workbench">
                      <div className="sentinel-findings-pane" aria-label="Findings">
                        {visibleFindings.length === 0 ? (
                          <SentinelEmptyFilter onReset={() => setSeverityFilter('all')} />
                        ) : (
                          <SentinelFindingsList
                            findings={sortedFindings}
                            grouped={grouped}
                            sortMode={sortMode}
                            selectedKey={selectedKey}
                            hiddenRules={hiddenRules}
                            onSelect={setSelectedKey}
                            showGroupHeaders={findings.length > 3}
                          />
                        )}
                      </div>

                      <div className="sentinel-inspector-shell" style={{ width: inspectorWidth }}>
                        <div
                          className="sentinel-inspector-resize"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize inspector"
                          onPointerDown={onResizeStart}
                          onPointerMove={onResizeMove}
                          onPointerUp={onResizeEnd}
                          onPointerCancel={onResizeEnd}
                        />
                        <SentinelFindingInspector
                          finding={selectedFinding}
                          excerpt={excerpt}
                          suppressDraft={suppressDraft}
                          suppressReason={
                            selectedFinding
                              ? (suppressReasons[selectedFinding.ruleId] ?? null)
                              : null
                          }
                          isHidden={
                            selectedFinding
                              ? hiddenRules.has(selectedFinding.ruleId) ||
                                selectedFinding.suppressed
                              : false
                          }
                          counts={counts}
                          onSuppressDraft={setSuppressDraft}
                          onSuppress={() => {
                            if (!selectedFinding || !suppressDraft.trim()) return;
                            setHiddenRules((rules) => new Set([...rules, selectedFinding.ruleId]));
                            setSuppressReasons((current) => ({
                              ...current,
                              [selectedFinding.ruleId]: suppressDraft.trim(),
                            }));
                            setSuppressDraft('');
                          }}
                          onOpenFile={openFindingFile}
                          onReveal={revealFinding}
                          onCopyPath={(finding) => void copyPath(finding)}
                          onGoIndex={goIndex}
                        />
                      </div>
                    </div>
                  </>
                )}

                {history.length > 0 && (
                  <SentinelValidationHistory
                    ref={historyRef}
                    runs={history}
                    total={historyTotal}
                    showAll={showAllHistory}
                    onShowAll={() => setShowAllHistory(true)}
                  />
                )}
              </div>
            </StateCrossfade>
          )}

          {phase !== 'ready' && phase !== 'results' && history.length > 0 && (
            <SentinelValidationHistory
              runs={history}
              total={historyTotal}
              showAll={showAllHistory}
              onShowAll={() => setShowAllHistory(true)}
            />
          )}
        </>
      )}
    </div>
  );
}
