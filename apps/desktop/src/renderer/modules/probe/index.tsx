import {
  PROBE_RULE_META,
  PROBE_RULE_SET_VERSION,
  buildProbeFindings,
  buildProbeHotspots,
  countDynamicReferences,
  probeOverallState,
  type ProbeFinding,
  type ResourceAnalysis,
} from '@cortex/script-analysis';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Download, Eye, EyeOff, FolderOpen, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ActionButton } from '../../components/ActionButton';
import { ResultsRefreshBar, StateCrossfade } from '../../components/ScanState';
import { EmptyState } from '../../components/UiPrimitives';
import {
  ValidationStages,
  type StageStatus,
  type ValidationStage,
} from '../../components/ValidationStages';
import { recordActivity } from '../../lib/activity-history';
import {
  compareProbeFindings,
  countBySeverity,
  countProbeRuns,
  listProbeRuns,
  queueWireFocus,
  recordProbeRun,
  type ProbeRunRecord,
} from '../../lib/probe-history';
import { unwrap } from '../../lib/result';
import { useWorkspaceStore } from '../../store/workspace';
import {
  STAGE_DEFS,
  type CategoryFilter,
  type ConfidenceFilter,
  type DeltaFilter,
  type GroupMode,
  type SeverityFilter,
  type SortMode,
} from './constants';
import { ProbeFindingInspector } from './ProbeFindingInspector';
import { ProbeFindingsList } from './ProbeFindingsList';
import { ProbeEmptyFilter, ProbeFindingsToolbar } from './ProbeFindingsToolbar';
import { ProbeHeader, ProbeOverflowMenu, ProbeSeverityLegend } from './ProbeHeader';
import { ProbeNavPane } from './ProbeNavPane';
import { ProbeReadyState } from './ProbeReadyState';
import { ProbeScanHistory } from './ProbeScanHistory';
import { ProbeSummary } from './ProbeSummary';
import { buildExcerpt, downloadReport, findingKey, formatDateTime, locationLabel } from './utils';

const INSPECTOR_MIN = 320;
const INSPECTOR_MAX = 430;
const INSPECTOR_DEFAULT = 380;
const NAV_COLLAPSED_KEY = 'cortex.probe.navCollapsed';

function readNavCollapsed(): boolean {
  try {
    return globalThis.localStorage.getItem(NAV_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeNavCollapsed(collapsed: boolean): void {
  try {
    globalThis.localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function buildStages(activeIndex: number, failed: boolean): ValidationStage[] {
  return STAGE_DEFS.map((stage, index) => {
    let status: StageStatus = 'waiting';
    if (index < activeIndex) status = 'completed';
    else if (index === activeIndex) status = failed ? 'failed' : 'running';
    return { ...stage, status };
  });
}

function scriptFileCount(files: { extension: string }[]): number {
  const scriptExtensions = new Set(['.lua', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']);
  return files.filter((file) => scriptExtensions.has(file.extension)).length;
}

function estimateLines(files: { extension: string; bytes: number }[]): number {
  const scriptExtensions = new Set(['.lua', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']);
  return files
    .filter((file) => scriptExtensions.has(file.extension))
    .reduce((sum, file) => sum + Math.max(1, Math.round(file.bytes / 28)), 0);
}

export default function Probe(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const files = useWorkspaceStore((state) => state.files);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const setLastAnalysis = useWorkspaceStore((state) => state.setLastAnalysis);
  const queryClient = useQueryClient();

  const [navCollapsed, setNavCollapsed] = useState(readNavCollapsed);
  const [areaFilter, setAreaFilter] = useState<CategoryFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [deltaFilter, setDeltaFilter] = useState<DeltaFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('severity');
  const [groupMode, setGroupMode] = useState<GroupMode>('severity');
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reviewedKeys, setReviewedKeys] = useState<Set<string>>(new Set());
  const [suppressedKeys, setSuppressedKeys] = useState<Set<string>>(new Set());
  const [suppressReasons, setSuppressReasons] = useState<Record<string, string>>({});
  const [suppressDraft, setSuppressDraft] = useState('');
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [scanDurationMs, setScanDurationMs] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [history, setHistory] = useState<ProbeRunRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [excerpt, setExcerpt] = useState<string | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT);
  const [sources, setSources] = useState<Record<string, string>>({});
  const stageTimer = useRef<number | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const lastRecordedScan = useRef<number | null>(null);

  const analysis = useQuery({
    queryKey: ['probe', workspace?.root],
    queryFn: async ({ signal }) => {
      const result = await window.cortex.resources.analyze();
      if (signal.aborted) throw new Error('Scan cancelled.');
      return unwrap(result) as ResourceAnalysis;
    },
    enabled: false,
    retry: false,
  });

  const busy = analysis.isFetching;
  const hasResults = Boolean(analysis.data);
  const scanFailed = analysis.isError && !hasResults;
  const phase: 'ready' | 'scanning' | 'results' | 'failed' = scanFailed
    ? 'failed'
    : busy && !hasResults
      ? 'scanning'
      : hasResults
        ? 'results'
        : 'ready';

  const findings = useMemo(() => {
    if (!analysis.data) return [] as ProbeFinding[];
    return buildProbeFindings(analysis.data, { sources });
  }, [analysis.data, sources]);

  const counts = useMemo(() => countBySeverity(findings), [findings]);
  const dynamicReferences = useMemo(
    () => (analysis.data ? countDynamicReferences(analysis.data) : 0),
    [analysis.data],
  );
  const previousRun = history[1] ?? null;
  const deltas = useMemo(
    () => compareProbeFindings(findings, previousRun?.fingerprints ?? null),
    [findings, previousRun],
  );
  const hotspots = useMemo(
    () => (analysis.data ? buildProbeHotspots(analysis.data, findings) : []),
    [analysis.data, findings],
  );
  const overallState = probeOverallState(counts, false);
  const reviewedCount = reviewedKeys.size + suppressedKeys.size;

  const fileCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const finding of findings) {
      if (
        suppressedKeys.has(finding.id) ||
        (areaFilter === 'reviewed' && !reviewedKeys.has(finding.id))
      )
        continue;
      map.set(finding.file, (map.get(finding.file) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([file, count]) => ({ file, count }))
      .sort((left, right) => right.count - left.count || left.file.localeCompare(right.file));
  }, [findings, suppressedKeys, areaFilter, reviewedKeys]);

  const visibleFindings = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return findings.filter((finding) => {
      const key = findingKey(finding);
      const isSuppressed = suppressedKeys.has(key);
      if (!showSuppressed && isSuppressed) return false;

      if (areaFilter === 'reviewed') {
        if (!reviewedKeys.has(key) && !isSuppressed) return false;
      } else if (areaFilter !== 'all' && finding.category !== areaFilter) {
        return false;
      }

      if (categoryFilter !== 'all') {
        if (categoryFilter === 'reviewed') {
          if (!reviewedKeys.has(key) && !isSuppressed) return false;
        } else if (finding.category !== categoryFilter) return false;
      }

      if (severityFilter !== 'all' && finding.severity !== severityFilter) return false;
      if (confidenceFilter !== 'all' && finding.confidence !== confidenceFilter) return false;

      const delta = deltas.get(finding.id) ?? 'unchanged';
      if (deltaFilter === 'new' && delta !== 'new') return false;
      if (deltaFilter === 'unchanged' && delta !== 'unchanged') return false;
      if (deltaFilter === 'resolved') return false;

      if (!needle) return true;
      const haystack = [
        finding.title,
        finding.explanation,
        finding.ruleId,
        finding.file,
        finding.category,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [
    findings,
    suppressedKeys,
    showSuppressed,
    areaFilter,
    categoryFilter,
    severityFilter,
    confidenceFilter,
    deltaFilter,
    deltas,
    reviewedKeys,
    search,
  ]);

  const sortedFindings = useMemo(() => {
    const items = [...visibleFindings];
    if (sortMode === 'file') {
      items.sort((a, b) => {
        const pathCmp = a.file.localeCompare(b.file);
        if (pathCmp !== 0) return pathCmp;
        return a.startLine - b.startLine;
      });
      return items;
    }
    const rank = { high: 0, medium: 1, low: 2, info: 3 };
    items.sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] ||
        a.file.localeCompare(b.file) ||
        a.startLine - b.startLine,
    );
    return items;
  }, [visibleFindings, sortMode]);

  const grouped = useMemo(() => {
    if (groupMode !== 'severity' || sortMode !== 'severity') return null;
    const groups: Record<string, ProbeFinding[]> = {
      high: [],
      medium: [],
      low: [],
      info: [],
    };
    for (const finding of sortedFindings) groups[finding.severity]?.push(finding);
    return groups;
  }, [sortedFindings, groupMode, sortMode]);

  const selectedFinding = useMemo(
    () => findings.find((finding) => findingKey(finding) === selectedKey) ?? null,
    [findings, selectedKey],
  );

  const scopeName =
    workspace?.project?.name ?? workspace?.root.split(/[\\/]/).at(-1) ?? 'Workspace';
  const scriptCount = analysis.data?.summary.scripts ?? scriptFileCount(files);
  const lineCount = analysis.data?.summary.lines ?? estimateLines(files);

  const refreshHistory = useCallback(() => {
    if (!workspace) return;
    setHistory(listProbeRuns(workspace.root, showAllHistory ? 48 : 3));
    setHistoryTotal(countProbeRuns(workspace.root));
  }, [workspace, showAllHistory]);

  const runScan = useCallback(() => {
    if (!workspace) return;
    setScanStartedAt(Date.now());
    setCompletedAt(null);
    setScanDurationMs(null);
    setStageIndex(0);
    void analysis.refetch();
  }, [analysis, workspace]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory, completedAt]);

  useEffect(() => {
    if (!selectedFinding) {
      setExcerpt(null);
      return;
    }
    let cancelled = false;
    void window.cortex.files.read({ relativePath: selectedFinding.file }).then((result) => {
      if (cancelled || !result.ok) {
        if (!cancelled) setExcerpt(null);
        return;
      }
      setExcerpt(
        buildExcerpt(result.data.content, selectedFinding.startLine, selectedFinding.endLine),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selectedFinding]);

  useEffect(() => {
    if (!busy) {
      if (stageTimer.current != null) {
        window.clearInterval(stageTimer.current);
        stageTimer.current = null;
      }
      return;
    }
    stageTimer.current = window.setInterval(() => {
      setStageIndex((current) => Math.min(current + 1, STAGE_DEFS.length - 1));
    }, 520);
    return () => {
      if (stageTimer.current != null) window.clearInterval(stageTimer.current);
    };
  }, [busy]);

  useEffect(() => {
    if (!analysis.data || !workspace || busy) return;
    if (lastRecordedScan.current === analysis.dataUpdatedAt) return;

    const recordScan = async () => {
      const paths = analysis.data!.files.map((file) => file.relativePath);
      const loadedSources: Record<string, string> = {};
      await Promise.all(
        paths.map(async (relativePath) => {
          if (loadedSources[relativePath]) return;
          const result = await window.cortex.files.read({ relativePath });
          if (result.ok) loadedSources[relativePath] = result.data.content;
        }),
      );
      setSources(loadedSources);

      const scanFindings = buildProbeFindings(analysis.data!, { sources: loadedSources });
      const scanCounts = countBySeverity(scanFindings);
      const ended = Date.now();
      const duration = scanStartedAt ? ended - scanStartedAt : 0;
      setScanDurationMs(duration);
      setCompletedAt(new Date(ended).toISOString());
      lastRecordedScan.current = analysis.dataUpdatedAt;

      const run = recordProbeRun({
        workspaceRoot: workspace.root,
        at: new Date(ended).toISOString(),
        durationMs: duration,
        state: probeOverallState(scanCounts, false),
        scripts: analysis.data!.summary.scripts,
        lines: analysis.data!.summary.lines,
        rulesExecuted: Object.keys(PROBE_RULE_META).length,
        ruleSetVersion: PROBE_RULE_SET_VERSION,
        highCount: scanCounts.high,
        mediumCount: scanCounts.medium,
        lowCount: scanCounts.low,
        infoCount: scanCounts.info,
        dynamicReferences: countDynamicReferences(analysis.data!),
        skippedFiles: 0,
        fingerprints: scanFindings.map((finding) => finding.id),
      });
      setCurrentRunId(run.id);

      setLastAnalysis({
        at: run.at,
        scripts: analysis.data!.summary.scripts,
        lines: analysis.data!.summary.lines,
        events: analysis.data!.summary.events,
        exports: analysis.data!.summary.exports,
        commands: analysis.data!.summary.commands,
      });

      recordActivity({
        tool: 'probe',
        workspaceRoot: workspace.root,
        workspaceName: scopeName,
        status: scanCounts.high > 0 || scanCounts.medium > 0 ? 'warning' : 'success',
        summary: `${scanCounts.high} high · ${scanCounts.medium} medium · ${scanCounts.low} low`,
        navigate: { kind: 'probe', tabLabel: 'Probe' },
      });

      refreshHistory();
    };

    void recordScan();
  }, [
    analysis.data,
    analysis.dataUpdatedAt,
    busy,
    workspace,
    scanStartedAt,
    scopeName,
    setLastAnalysis,
    refreshHistory,
  ]);

  const openFindingEditor = useCallback(
    (finding: ProbeFinding) => {
      if (!workspace) return;
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

  const openWire = useCallback(
    (finding: ProbeFinding) => {
      if (!finding.wireLink) return;
      queueWireFocus({
        file: finding.file,
        symbolName: finding.wireLink.symbolName,
        symbolKind: finding.wireLink.symbolKind,
      });
      openTab({
        id: 'wire',
        label: 'Wire',
        relativePath: null,
        kind: 'wire',
        dirty: false,
      });
    },
    [openTab],
  );

  const revealFinding = useCallback(
    (finding: ProbeFinding) => {
      if (!workspace) return;
      const target = `${workspace.root.replace(/[\\/]+$/, '')}/${finding.file.replace(/^[/\\]+/, '')}`;
      void window.cortex.projects.reveal({ root: target });
    },
    [workspace],
  );

  const copyFinding = useCallback(async (finding: ProbeFinding) => {
    const text = [
      finding.title,
      locationLabel(finding),
      finding.explanation,
      finding.remediation,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.message('Finding copied');
    } catch {
      /* ignore */
    }
  }, []);

  const exportFindings = useCallback(() => {
    if (!analysis.data) return;
    const lines = [
      '# Cortex Probe Report',
      '',
      `Generated: ${completedAt ?? analysis.data.generatedAt}`,
      `Workspace: ${scopeName}`,
      `Rule set: ${PROBE_RULE_SET_VERSION}`,
      '',
      ...findings.map(
        (finding) =>
          `## ${finding.severity.toUpperCase()} · ${finding.title}\n${locationLabel(finding)}\n${finding.explanation}\n`,
      ),
    ];
    downloadReport(
      `probe-${scopeName.replace(/\s+/g, '-').toLowerCase()}.md`,
      lines.join('\n'),
      'text/markdown',
    );
  }, [analysis.data, completedAt, findings, scopeName]);

  const runAction = (
    <ActionButton
      variant="primary"
      busy={busy}
      busyLabel="Scanning…"
      disabled={!workspace}
      icon={<Play aria-hidden="true" />}
      onClick={runScan}
    >
      {hasResults ? 'Scan again' : 'Scan resource'}
    </ActionButton>
  );

  const suppressedControl = (
    <button
      type="button"
      className="text-button"
      onClick={() => setShowSuppressed((value) => !value)}
    >
      {showSuppressed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      {showSuppressed ? 'Hide suppressed' : `Suppressed (${suppressedKeys.size})`}
    </button>
  );

  const overflowMenu = (
    <ProbeOverflowMenu>
      <button type="button" className="text-button" onClick={exportFindings} disabled={!hasResults}>
        <Download aria-hidden="true" />
        Export findings
      </button>
      {suppressedControl}
      <ProbeSeverityLegend />
    </ProbeOverflowMenu>
  );

  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeRef.current = { startX: event.clientX, startWidth: inspectorWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const delta = resizeRef.current.startX - event.clientX;
    const next = Math.min(
      INSPECTOR_MAX,
      Math.max(INSPECTOR_MIN, resizeRef.current.startWidth + delta),
    );
    setInspectorWidth(next);
  };

  const onResizeEnd = () => {
    resizeRef.current = null;
  };

  const lastScanLabel = completedAt
    ? formatDateTime(completedAt)
    : history[0]
      ? formatDateTime(history[0].at)
      : null;

  const stages = buildStages(busy ? stageIndex : STAGE_DEFS.length, analysis.isError && busy);

  return (
    <div className="tool-view workbench-page probe-page">
      {!workspace && (
        <EmptyState
          icon={FolderOpen}
          title="Open a resource first"
          description="Choose a local FiveM resource, then run a static Probe scan."
        />
      )}

      {workspace && (
        <>
          <ProbeHeader
            workspaceName={scopeName}
            lastScanLabel={lastScanLabel}
            scanStateLabel={
              phase === 'scanning'
                ? 'Scanning'
                : phase === 'results'
                  ? overallState.replace('-', ' ')
                  : phase === 'failed'
                    ? 'Failed'
                    : 'Ready'
            }
            phase={phase}
            runAction={phase === 'ready' ? undefined : runAction}
            overflowMenu={overflowMenu}
          />

          {phase === 'ready' && (
            <StateCrossfade stateKey="probe-ready">
              <ProbeReadyState
                scopeName={scopeName}
                scriptCount={scriptCount}
                lineCount={lineCount}
                excludedSummary="node_modules, .git"
                lastScanLabel={lastScanLabel}
                runAction={runAction}
                history={
                  <ProbeScanHistory
                    runs={history}
                    total={historyTotal}
                    showAll={showAllHistory}
                    onShowAll={() => setShowAllHistory(true)}
                  />
                }
              />
            </StateCrossfade>
          )}

          {phase === 'scanning' && (
            <ValidationStages
              stages={stages}
              cancellable
              onCancel={() =>
                void queryClient.cancelQueries({ queryKey: ['probe', workspace.root] })
              }
            />
          )}

          {phase === 'failed' && (
            <section className="probe-scan-error" role="alert">
              <AlertCircle aria-hidden="true" />
              <div>
                <h2>Probe could not finish</h2>
                <p>
                  {analysis.error?.message ?? 'The scan stopped before producing results.'} This is
                  an operational failure, not a code finding.
                </p>
              </div>
              {runAction}
            </section>
          )}

          {phase === 'results' && analysis.data && (
            <StateCrossfade stateKey="probe-results">
              <div className={`probe-results${busy ? ' is-refreshing' : ''}`}>
                <ResultsRefreshBar active={busy} />

                <ProbeSummary
                  state={overallState}
                  counts={counts}
                  scripts={analysis.data.summary.scripts}
                  lines={analysis.data.summary.lines}
                  durationMs={scanDurationMs}
                  completedAt={completedAt}
                  dynamicReferences={dynamicReferences}
                  skippedFiles={0}
                  rulesExecuted={Object.keys(PROBE_RULE_META).length}
                  runAction={runAction}
                />

                {findings.length === 0 ? (
                  <section className="probe-clean" aria-label="Scan result">
                    <p>No actionable static findings were detected.</p>
                    <dl>
                      <div>
                        <dt>Scripts inspected</dt>
                        <dd>{analysis.data.summary.scripts}</dd>
                      </div>
                      <div>
                        <dt>Lines inspected</dt>
                        <dd>{analysis.data.summary.lines.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Dynamic constructs</dt>
                        <dd>{dynamicReferences}</dd>
                      </div>
                    </dl>
                  </section>
                ) : (
                  <div className="probe-workbench">
                    <ProbeNavPane
                      collapsed={navCollapsed}
                      onToggleCollapsed={() => {
                        setNavCollapsed((value) => {
                          const next = !value;
                          writeNavCollapsed(next);
                          return next;
                        });
                      }}
                      areaFilter={areaFilter}
                      onAreaFilter={setAreaFilter}
                      findings={findings.filter((f) => !suppressedKeys.has(f.id))}
                      fileCounts={fileCounts}
                      reviewedCount={reviewedCount}
                    />

                    <div className="probe-center">
                      <ProbeFindingsToolbar
                        severityFilter={severityFilter}
                        onSeverityFilter={setSeverityFilter}
                        counts={counts}
                        totalVisible={visibleFindings.length}
                        search={search}
                        onSearch={setSearch}
                        categoryFilter={categoryFilter}
                        onCategoryFilter={setCategoryFilter}
                        confidenceFilter={confidenceFilter}
                        onConfidenceFilter={setConfidenceFilter}
                        deltaFilter={deltaFilter}
                        onDeltaFilter={setDeltaFilter}
                        sortMode={sortMode}
                        onSortMode={setSortMode}
                        groupMode={groupMode}
                        onGroupMode={setGroupMode}
                      />

                      <div className="probe-findings-list" aria-label="Findings">
                        {visibleFindings.length === 0 ? (
                          <ProbeEmptyFilter
                            onReset={() => {
                              setSeverityFilter('all');
                              setCategoryFilter('all');
                              setAreaFilter('all');
                              setDeltaFilter('all');
                            }}
                          />
                        ) : (
                          <ProbeFindingsList
                            findings={sortedFindings}
                            grouped={grouped}
                            sortMode={sortMode}
                            groupMode={groupMode}
                            selectedKey={selectedKey}
                            reviewedKeys={reviewedKeys}
                            suppressedKeys={suppressedKeys}
                            deltas={deltas}
                            onSelect={setSelectedKey}
                          />
                        )}
                      </div>
                    </div>

                    <div className="probe-inspector-shell" style={{ width: inspectorWidth }}>
                      <div
                        className="probe-inspector-resize"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize inspector"
                        onPointerDown={onResizeStart}
                        onPointerMove={onResizeMove}
                        onPointerUp={onResizeEnd}
                        onPointerCancel={onResizeEnd}
                      />
                      <ProbeFindingInspector
                        finding={selectedFinding}
                        excerpt={excerpt}
                        reviewed={selectedFinding ? reviewedKeys.has(selectedFinding.id) : false}
                        suppressed={
                          selectedFinding ? suppressedKeys.has(selectedFinding.id) : false
                        }
                        suppressDraft={suppressDraft}
                        suppressReason={
                          selectedFinding ? (suppressReasons[selectedFinding.id] ?? null) : null
                        }
                        counts={counts}
                        hotspots={hotspots}
                        previousRun={previousRun}
                        currentFindings={findings}
                        onSuppressDraft={setSuppressDraft}
                        onSuppress={() => {
                          if (!selectedFinding || !suppressDraft.trim()) return;
                          const key = selectedFinding.id;
                          setSuppressedKeys((current) => new Set([...current, key]));
                          setSuppressReasons((current) => ({
                            ...current,
                            [key]: suppressDraft.trim(),
                          }));
                          setSuppressDraft('');
                        }}
                        onMarkReviewed={() => {
                          if (!selectedFinding) return;
                          setReviewedKeys((current) => new Set([...current, selectedFinding.id]));
                        }}
                        onOpenEditor={openFindingEditor}
                        onOpenWire={openWire}
                        onReveal={revealFinding}
                        onCopyFinding={(finding) => void copyFinding(finding)}
                        onOpenFullFile={openFindingEditor}
                      />
                    </div>
                  </div>
                )}

                <ProbeScanHistory
                  runs={history}
                  total={historyTotal}
                  showAll={showAllHistory}
                  onShowAll={() => setShowAllHistory(true)}
                  currentRunId={currentRunId}
                />
              </div>
            </StateCrossfade>
          )}
        </>
      )}
    </div>
  );
}
