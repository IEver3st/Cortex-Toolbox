import {
  applyPreparedRepairs,
  diagnoseMetaBundle,
  revalidateRepairedFiles,
  type MetaDiagnosis,
  type MetaFileInput,
  type MetaFinding,
  type RepairCandidate,
} from '@cortex/vehicle-meta';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileWarning,
  GitCompareArrows,
  Info,
  MoreHorizontal,
  Search,
  SkipForward,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EmptyState } from '../../components/UiPrimitives';
import { downloadText, readSelectedFiles } from '../shared/download';

interface PreparedFix {
  findingId: string;
  file: string;
  fileName: string;
  before: string;
  after: string;
  repairedContent: string;
  summary: string;
  linesChanged: number;
}

interface ApplySummary {
  filesChanged: number;
  linesChanged: number;
  validationOk: boolean;
  remainingManual: number;
  backupLabel: string;
  appliedAt: string;
}

type SeverityFilter = 'all' | 'error' | 'warning' | 'info';
type RepairStateFilter = 'all' | 'candidate' | 'prepared' | 'manual' | 'skipped' | 'none';
type GroupMode = 'none' | 'file';
type ViewMode = 'findings' | 'files';

const FINDINGS_MIN = 360;
const FINDINGS_MAX = 720;
const FINDINGS_DEFAULT = 400;
const HIGH_CONFIDENCE = 0.9;

function confidenceLabel(value: number): string {
  if (value >= 0.9) return 'High';
  if (value >= 0.75) return 'Medium';
  return 'Low';
}

function repairStateLabel(
  finding: MetaFinding,
  prepared: boolean,
  skipped: boolean,
  manualMarked: boolean,
): string {
  if (skipped) return 'Skipped';
  if (prepared) return 'Prepared';
  if (manualMarked || finding.repairAvailability === 'manual') return 'Manual review';
  if (finding.repairAvailability === 'candidate') return 'Repair candidate';
  return 'No repair';
}

function SeverityIcon({ severity }: { severity: MetaFinding['severity'] }): React.JSX.Element {
  const className = `align-severity-icon severity-${severity}`;
  if (severity === 'error') return <AlertCircle className={className} aria-hidden="true" />;
  if (severity === 'warning') return <AlertTriangle className={className} aria-hidden="true" />;
  return <Info className={className} aria-hidden="true" />;
}

/** UI label for finding severity — keeps unverifiable relationships out of the "error" bucket. */
function severityLabel(finding: MetaFinding): string {
  if (finding.severity === 'info' && /could not be verified|unverifiable/i.test(finding.title)) {
    return 'Unverifiable relationship';
  }
  if (finding.severity === 'info') return 'Info';
  if (finding.severity === 'warning') return 'Warning';
  if (finding.repairAvailability === 'manual') return 'Manual review';
  return 'Error';
}

function UnifiedDiff({ before, after }: { before: string; after: string }): React.JSX.Element {
  return (
    <pre className="align-unified-diff" aria-label="Proposed unified diff">
      <code>
        <span className="diff-remove">- {before}</span>
        {'\n'}
        <span className="diff-add">+ {after}</span>
      </code>
    </pre>
  );
}

function SideBySideDiff({ before, after }: { before: string; after: string }): React.JSX.Element {
  return (
    <div className="align-diff" aria-label="Proposed source diff">
      <div className="align-diff-pane is-before">
        <header>Before</header>
        <pre>
          <code>{before}</code>
        </pre>
      </div>
      <div className="align-diff-pane is-after">
        <header>After</header>
        <pre>
          <code>{after}</code>
        </pre>
      </div>
    </div>
  );
}

function RepairDiff({ repair }: { repair: RepairCandidate }): React.JSX.Element {
  if (repair.linesChanged <= 1) {
    return <UnifiedDiff before={repair.before} after={repair.after} />;
  }
  return <SideBySideDiff before={repair.before} after={repair.after} />;
}

function SourceExcerpt({
  excerpt,
  highlightLine,
}: {
  excerpt: string;
  highlightLine: number;
}): React.JSX.Element {
  const lines = excerpt.split('\n');
  return (
    <pre className="align-excerpt align-excerpt-lined" aria-label="Source excerpt">
      <code>
        {lines.map((line, index) => {
          const match = /^\s*(\d+)\s*\|\s?(.*)$/.exec(line);
          const lineNo = match ? Number(match[1]) : null;
          const content = match ? match[2] : line;
          const isHighlight = lineNo === highlightLine;
          return (
            <span
              key={`${line}-${index}`}
              className={isHighlight ? 'align-excerpt-line is-highlight' : 'align-excerpt-line'}
            >
              <span className="align-excerpt-gutter">
                {match ? String(lineNo).padStart(4, ' ') : '    '}
              </span>
              <span className="align-excerpt-sep"> | </span>
              <span className="align-excerpt-content">{content}</span>
              {'\n'}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

function ValidationChecks({ repair }: { repair: RepairCandidate }): React.JSX.Element {
  const checks = [
    {
      label: 'Repaired document parses successfully',
      ok: repair.validated,
    },
    {
      label: 'Exactly one line changes',
      ok: repair.linesChanged === 1,
    },
    {
      label: 'No unrelated content changes',
      ok: repair.validated && repair.linesChanged <= 3,
    },
    {
      label: 'Linked references remain valid',
      ok: repair.validated,
    },
  ];

  return (
    <ul className="align-validation-checks">
      {checks.map((check) => (
        <li key={check.label} className={check.ok ? 'is-pass' : 'is-fail'}>
          {check.ok ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
          <span>{check.label}</span>
        </li>
      ))}
    </ul>
  );
}

function TechnicalDisclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <details className="align-technical-disclosure">
      <summary>
        {title}
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="align-technical-disclosure-body">{children}</div>
    </details>
  );
}

function AlignOverflowMenu({
  onExport,
  onReload,
  disabled,
}: {
  onExport: () => void;
  onReload: () => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <details className="align-overflow-menu">
      <summary aria-label="More actions">
        <MoreHorizontal aria-hidden="true" />
      </summary>
      <div className="align-overflow-menu-body" role="menu">
        <button type="button" onClick={onExport} disabled={disabled}>
          <Download aria-hidden="true" />
          Export diagnosis
        </button>
        <button type="button" onClick={onReload} disabled={disabled}>
          <GitCompareArrows aria-hidden="true" />
          Re-run diagnosis
        </button>
      </div>
    </details>
  );
}

function InspectorEmpty({
  result,
  preparedCount,
}: {
  result: MetaDiagnosis;
  preparedCount: number;
}): React.JSX.Element {
  if (result.findings.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No findings"
        description="Align did not detect metadata problems in the selected files."
        compact
      />
    );
  }

  if (result.stats.repairCandidates === 0 && preparedCount === 0) {
    return (
      <EmptyState
        icon={FileWarning}
        title="Automatic repair unavailable"
        description="Problems were detected, but none have a sufficiently confident automatic patch. Select a diagnosis to inspect evidence."
        compact
      />
    );
  }

  return (
    <EmptyState
      icon={Info}
      title="Select a diagnosis"
      description="Choose a finding to inspect its evidence and proposed repair."
      compact
    />
  );
}

export default function Align(): React.JSX.Element {
  const [files, setFiles] = useState<MetaFileInput[]>([]);
  const [result, setResult] = useState<MetaDiagnosis | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [prepared, setPrepared] = useState<Map<string, PreparedFix>>(new Map());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [manualReviewIds, setManualReviewIds] = useState<Set<string>>(new Set());
  const [showPreparedReview, setShowPreparedReview] = useState(false);
  const [applySummary, setApplySummary] = useState<ApplySummary | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [repairStateFilter, setRepairStateFilter] = useState<RepairStateFilter>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [viewMode, setViewMode] = useState<ViewMode>('findings');
  const [fileFilter, setFileFilter] = useState<string | null>(null);
  const [findingsWidth, setFindingsWidth] = useState(FINDINGS_DEFAULT);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => result?.findings.find((item) => item.id === selectedId) ?? null,
    [result, selectedId],
  );

  const resetSessionState = () => {
    setPrepared(new Map());
    setSkippedIds(new Set());
    setManualReviewIds(new Set());
    setCheckedIds(new Set());
    setShowPreparedReview(false);
    setApplySummary(null);
    setSearch('');
    setSeverityFilter('all');
    setRepairStateFilter('all');
    setGroupMode('none');
    setViewMode('findings');
    setFileFilter(null);
  };

  const load = async (list: FileList) => {
    const next = await readSelectedFiles(list);
    setFiles(next);
    const diagnosis = diagnoseMetaBundle(next);
    setResult(diagnosis);
    resetSessionState();
    setSelectedId(diagnosis.findings[0]?.id ?? null);
  };

  const rerunDiagnosis = useCallback(() => {
    if (files.length === 0) return;
    const diagnosis = diagnoseMetaBundle(files);
    setResult(diagnosis);
    resetSessionState();
    setSelectedId(diagnosis.findings[0]?.id ?? null);
  }, [files]);

  useEffect(() => {
    if (!result) return;
    if (result.findings.length === 1) {
      setSelectedId(result.findings[0]?.id ?? null);
    }
  }, [result]);

  const prepareFix = (finding: MetaFinding) => {
    const repair = finding.repair;
    if (!repair?.validated) return;
    setPrepared((prev) => {
      const next = new Map(prev);
      next.set(finding.id, {
        findingId: finding.id,
        file: finding.file,
        fileName: finding.fileName,
        before: repair.before,
        after: repair.after,
        repairedContent: repair.repairedContent,
        summary: repair.summary,
        linesChanged: repair.linesChanged,
      });
      return next;
    });
    setSkippedIds((prev) => {
      const next = new Set(prev);
      next.delete(finding.id);
      return next;
    });
    setApplySummary(null);
  };

  const prepareMany = (findings: MetaFinding[]) => {
    for (const finding of findings) {
      prepareFix(finding);
    }
  };

  const unprepareFix = (findingId: string) => {
    setPrepared((prev) => {
      const next = new Map(prev);
      next.delete(findingId);
      return next;
    });
  };

  const unprepareAll = () => {
    setPrepared(new Map());
  };

  const toggleChecked = (findingId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });
  };

  const applyPrepared = () => {
    if (!result || prepared.size === 0) return;
    const items = [...prepared.values()];
    const repairedFiles = applyPreparedRepairs(
      files,
      items.map((item) => ({ file: item.file, repairedContent: item.repairedContent })),
    );
    const recheck = revalidateRepairedFiles(repairedFiles);
    const stamp = new Date().toISOString().replaceAll(':', '-');
    const linesChanged = items.reduce((sum, item) => sum + item.linesChanged, 0);
    const filesChanged = new Set(items.map((item) => item.file)).size;

    for (const item of items) {
      const original = files.find((file) => file.name === item.file);
      if (original) {
        downloadText(`backup-${stamp}-${item.fileName}`, original.content, 'application/xml');
      }
      downloadText(item.fileName, item.repairedContent, 'application/xml');
    }

    setApplySummary({
      filesChanged,
      linesChanged,
      validationOk: recheck.stats.errors === 0,
      remainingManual: recheck.findings.filter(
        (item) => item.repairAvailability !== 'candidate' && item.severity !== 'info',
      ).length,
      backupLabel: `backup-${stamp}-*`,
      appliedAt: stamp,
    });
    setFiles(repairedFiles);
    setResult(recheck);
    setPrepared(new Map());
    setCheckedIds(new Set());
    setShowPreparedReview(false);
    setSelectedId(recheck.findings[0]?.id ?? null);
  };

  const exportDiagnosis = () => {
    if (!result) return;
    const lines = [
      '# Align metadata diagnosis',
      '',
      `Files: ${result.stats.files}`,
      `Root findings: ${result.stats.rootFindings}`,
      `Repair candidates: ${result.stats.repairCandidates}`,
      `Unverifiable / info: ${result.stats.info ?? 0}`,
      '',
      ...(result.coverageReport ? [result.coverageReport, ''] : []),
      ...result.findings.map(
        (finding) =>
          `## ${severityLabel(finding)} · ${finding.title}\n${finding.fileName}:${finding.location.line}\n${finding.explanation}\n`,
      ),
    ];
    downloadText('align-diagnosis.md', lines.join('\n'), 'text/markdown');
  };

  const visibleFindings = useMemo(() => {
    if (!result) return [] as MetaFinding[];
    const needle = search.trim().toLowerCase();
    return result.findings.filter((finding) => {
      if (fileFilter && finding.file !== fileFilter) return false;
      if (severityFilter !== 'all' && finding.severity !== severityFilter) return false;

      const isPrepared = prepared.has(finding.id);
      const isSkipped = skippedIds.has(finding.id);
      const isManual = manualReviewIds.has(finding.id) || finding.repairAvailability === 'manual';

      if (repairStateFilter === 'candidate' && finding.repairAvailability !== 'candidate')
        return false;
      if (repairStateFilter === 'prepared' && !isPrepared) return false;
      if (repairStateFilter === 'manual' && !isManual) return false;
      if (repairStateFilter === 'skipped' && !isSkipped) return false;
      if (repairStateFilter === 'none' && finding.repairAvailability !== 'none') return false;

      if (!needle) return true;
      const haystack = [finding.title, finding.explanation, finding.fileName, finding.file]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [
    result,
    search,
    severityFilter,
    repairStateFilter,
    fileFilter,
    prepared,
    skippedIds,
    manualReviewIds,
  ]);

  const fileRows = useMemo(() => {
    if (!result) return [];
    const map = new Map<
      string,
      { file: string; fileName: string; count: number; candidates: number }
    >();
    for (const finding of result.findings) {
      const current = map.get(finding.file) ?? {
        file: finding.file,
        fileName: finding.fileName,
        count: 0,
        candidates: 0,
      };
      current.count += 1;
      if (finding.repairAvailability === 'candidate') current.candidates += 1;
      map.set(finding.file, current);
    }
    return [...map.values()].sort(
      (a, b) => b.count - a.count || a.fileName.localeCompare(b.fileName),
    );
  }, [result]);

  const groupedFindings = useMemo(() => {
    if (groupMode !== 'file') return null;
    const groups = new Map<string, MetaFinding[]>();
    for (const finding of visibleFindings) {
      const bucket = groups.get(finding.file) ?? [];
      bucket.push(finding);
      groups.set(finding.file, bucket);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [visibleFindings, groupMode]);

  const preparedFileCount = useMemo(
    () => new Set([...prepared.values()].map((item) => item.file)).size,
    [prepared],
  );

  const allValidated =
    result !== null &&
    result.stats.repairCandidates > 0 &&
    result.findings
      .filter((item) => item.repairAvailability === 'candidate')
      .every((item) => item.repair?.validated);

  const diagnosisHeadline = useMemo(() => {
    if (!result) return '';
    if (result.stats.repairCandidates > 0) {
      return `${result.stats.repairCandidates} repair${result.stats.repairCandidates === 1 ? '' : 's'} found`;
    }
    if (result.stats.rootFindings > 0) {
      return `${result.stats.rootFindings} finding${result.stats.rootFindings === 1 ? '' : 's'} found`;
    }
    return 'No repairs needed';
  }, [result]);

  const diagnosisDetail = useMemo(() => {
    if (!result) return '';
    const fileSummary =
      result.stats.filesWithFindings > 0
        ? `${result.stats.filesWithFindings} of ${result.stats.files} file${result.stats.files === 1 ? '' : 's'} contain repairable problems.`
        : `All ${result.stats.files} loaded file${result.stats.files === 1 ? '' : 's'} passed diagnosis.`;
    const validationNote =
      result.stats.repairCandidates > 0
        ? allValidated
          ? ' All proposed changes validated successfully in memory.'
          : ' Some proposed changes need manual review before applying.'
        : '';
    return `${fileSummary}${validationNote}`;
  }, [result, allValidated]);

  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeRef.current = { startX: event.clientX, startWidth: findingsWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const delta = event.clientX - resizeRef.current.startX;
    const next = Math.min(
      FINDINGS_MAX,
      Math.max(FINDINGS_MIN, resizeRef.current.startWidth + delta),
    );
    setFindingsWidth(next);
  };

  const onResizeEnd = () => {
    resizeRef.current = null;
  };

  const renderFindingRow = (finding: MetaFinding) => {
    const isSelected = finding.id === selectedId;
    const isPrepared = prepared.has(finding.id);
    const isSkipped = skippedIds.has(finding.id);
    const isManual = manualReviewIds.has(finding.id);
    const isChecked = checkedIds.has(finding.id);

    return (
      <li key={finding.id}>
        <div
          className={`align-finding-row severity-${finding.severity}${isSelected ? ' is-selected' : ''}${isSkipped ? ' is-skipped' : ''}`}
        >
          <label className="align-finding-check" aria-label={`Select ${finding.title}`}>
            <input type="checkbox" checked={isChecked} onChange={() => toggleChecked(finding.id)} />
          </label>
          <button
            type="button"
            className="align-finding-select"
            onClick={() => {
              setSelectedId(finding.id);
            }}
          >
            <SeverityIcon severity={finding.severity} />
            <span className="align-finding-body">
              <strong>{finding.title}</strong>
              <span className="align-finding-location mono">
                {finding.fileName} · Line {finding.location.line}
              </span>
              <span className="align-finding-state">
                {confidenceLabel(finding.confidence)} confidence ·{' '}
                {repairStateLabel(finding, isPrepared, isSkipped, isManual)}
              </span>
            </span>
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="tool-view workbench-page align-view">
      <header className={`align-header${result ? ' has-diagnosis' : ''}`}>
        <div className="align-header-copy">
          <div className="align-header-title">
            <h1>Align</h1>
            {result ? (
              <>
                <span className="align-header-sep" aria-hidden="true">
                  ·
                </span>
                <span className="align-header-headline">{diagnosisHeadline}</span>
              </>
            ) : null}
          </div>
          <p className="align-header-lead">
            {result ? diagnosisDetail : 'Diagnose and safely repair linked vehicle metadata.'}
          </p>
          {result ? (
            <p className="align-header-counts">
              <span>{result.stats.files} files</span>
              <span className="align-header-sep" aria-hidden="true">
                ·
              </span>
              <span className="is-error">{result.stats.errors} errors</span>
              <span className="align-header-sep" aria-hidden="true">
                ·
              </span>
              <span className="is-warning">{result.stats.warnings} warnings</span>
              <span className="align-header-sep" aria-hidden="true">
                ·
              </span>
              <span>{result.stats.manualReview} manual review</span>
            </p>
          ) : null}
        </div>
        <div className="align-header-actions">
          {result && result.stats.repairCandidates > 0 ? (
            <button
              type="button"
              className="primary align-prepare-all"
              onClick={() =>
                prepareMany(
                  result.findings.filter(
                    (item) =>
                      item.repairAvailability === 'candidate' &&
                      item.repair?.validated &&
                      !skippedIds.has(item.id),
                  ),
                )
              }
            >
              <Wrench aria-hidden="true" />
              Prepare all {result.stats.repairCandidates}
            </button>
          ) : null}
          <div className="align-header-actions-row">
            <AlignOverflowMenu
              onExport={exportDiagnosis}
              onReload={rerunDiagnosis}
              disabled={!result}
            />
            <label className="file-pick-button primary">
              <Upload aria-hidden="true" />
              Choose metadata
              <input
                ref={fileInputRef}
                type="file"
                name="metadata-repair-files"
                accept=".meta,.xml"
                multiple
                onChange={(event) => event.target.files?.length && void load(event.target.files)}
              />
            </label>
          </div>
          {result ? (
            <TechnicalDisclosure title="Technical details">
              <dl className="align-technical-stats">
                <div>
                  <dt>Root findings</dt>
                  <dd>{result.stats.rootFindings}</dd>
                </div>
                <div>
                  <dt>Raw parser diagnostics</dt>
                  <dd>{result.stats.rawParserDiagnostics}</dd>
                </div>
                <div>
                  <dt>Repair candidates</dt>
                  <dd>{result.stats.repairCandidates}</dd>
                </div>
                <div>
                  <dt>Prepared fixes</dt>
                  <dd>{prepared.size}</dd>
                </div>
                <div>
                  <dt>Unverifiable / info</dt>
                  <dd>{result.stats.info ?? 0}</dd>
                </div>
              </dl>
              {result.coverageReport ? (
                <pre className="align-coverage-report" aria-label="Scan coverage">
                  {result.coverageReport}
                </pre>
              ) : null}
            </TechnicalDisclosure>
          ) : null}
        </div>
      </header>

      {!result && (
        <div className="align-empty">
          <EmptyState
            icon={GitCompareArrows}
            title="Drop in the files that no longer agree"
            description="Select carcols.meta, carvariations.meta, vehicles.meta, or a whole set. Folder-relative paths are used when the browser provides them."
          />
        </div>
      )}

      {result && (
        <div className="align-results">
          {applySummary && (
            <div className="align-apply-summary" role="status">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <strong>Repairs exported</strong>
                <p>
                  {applySummary.filesChanged} file
                  {applySummary.filesChanged === 1 ? '' : 's'} · {applySummary.linesChanged} line
                  {applySummary.linesChanged === 1 ? '' : 's'} changed · Validation{' '}
                  {applySummary.validationOk ? 'passed' : 'still has findings'} · Backups{' '}
                  <code>{applySummary.backupLabel}</code>
                  {applySummary.remainingManual > 0
                    ? ` · ${applySummary.remainingManual} remaining for manual review`
                    : ''}
                </p>
              </div>
            </div>
          )}

          {showPreparedReview ? (
            <section className="align-prepared-review">
              <header className="align-prepared-review-header">
                <div>
                  <h2>Review prepared changes</h2>
                  <p>
                    {prepared.size} repair{prepared.size === 1 ? '' : 's'} across{' '}
                    {preparedFileCount} file{preparedFileCount === 1 ? '' : 's'}
                  </p>
                </div>
                <button type="button" onClick={() => setShowPreparedReview(false)}>
                  Back to workbench
                </button>
              </header>
              <ul className="align-prepared-list">
                {[...prepared.values()].map((item) => (
                  <li key={item.findingId}>
                    <div className="align-prepared-list-heading">
                      <strong className="mono">{item.fileName}</strong>
                      <span>{item.summary}</span>
                    </div>
                    {item.linesChanged <= 1 ? (
                      <UnifiedDiff before={item.before} after={item.after} />
                    ) : (
                      <SideBySideDiff before={item.before} after={item.after} />
                    )}
                    <button type="button" onClick={() => unprepareFix(item.findingId)}>
                      Remove from batch
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="align-workbench">
              <section
                className="align-findings-pane"
                style={{ width: findingsWidth }}
                aria-label="Findings"
              >
                <div className="align-findings-toolbar">
                  <label className="align-search">
                    <Search aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="Search findings…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      aria-label="Search findings"
                    />
                  </label>
                  <div className="align-filter-group" role="group" aria-label="Severity filter">
                    {(['all', 'error', 'warning', 'info'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`align-filter${severityFilter === value ? ' is-active' : ''}`}
                        onClick={() => setSeverityFilter(value)}
                      >
                        {value === 'all'
                          ? 'All'
                          : `${value.charAt(0).toUpperCase()}${value.slice(1)}`}
                      </button>
                    ))}
                  </div>
                  <div className="align-filter-group" role="group" aria-label="Repair state filter">
                    {(
                      [
                        ['all', 'All states'],
                        ['candidate', 'Candidates'],
                        ['prepared', 'Prepared'],
                        ['manual', 'Manual'],
                        ['skipped', 'Skipped'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`align-filter${repairStateFilter === value ? ' is-active' : ''}`}
                        onClick={() => setRepairStateFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="align-toolbar-row">
                    <label className="align-control">
                      <span>Group</span>
                      <select
                        value={groupMode}
                        onChange={(event) => setGroupMode(event.target.value as GroupMode)}
                        aria-label="Grouping"
                      >
                        <option value="none">None</option>
                        <option value="file">By file</option>
                      </select>
                    </label>
                    <div className="align-view-switch" role="group" aria-label="View mode">
                      <button
                        type="button"
                        className={viewMode === 'findings' ? 'is-active' : ''}
                        onClick={() => {
                          setViewMode('findings');
                          setFileFilter(null);
                        }}
                      >
                        Findings
                      </button>
                      <button
                        type="button"
                        className={viewMode === 'files' ? 'is-active' : ''}
                        onClick={() => setViewMode('files')}
                      >
                        Files
                      </button>
                    </div>
                  </div>
                  <div className="align-bulk-actions">
                    <button
                      type="button"
                      onClick={() =>
                        prepareMany(
                          result.findings.filter(
                            (item) =>
                              item.repairAvailability === 'candidate' &&
                              item.repair?.validated &&
                              item.confidence >= HIGH_CONFIDENCE &&
                              !skippedIds.has(item.id),
                          ),
                        )
                      }
                      disabled={result.stats.repairCandidates === 0}
                    >
                      Prepare high-confidence
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        prepareMany(
                          result.findings.filter(
                            (item) =>
                              checkedIds.has(item.id) &&
                              item.repairAvailability === 'candidate' &&
                              item.repair?.validated,
                          ),
                        )
                      }
                      disabled={checkedIds.size === 0}
                    >
                      Prepare selected ({checkedIds.size})
                    </button>
                    <button type="button" onClick={unprepareAll} disabled={prepared.size === 0}>
                      Undo preparation
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setManualReviewIds((prev) => {
                          const next = new Set(prev);
                          for (const id of checkedIds) next.add(id);
                          return next;
                        });
                      }}
                      disabled={checkedIds.size === 0}
                    >
                      Mark for manual review
                    </button>
                  </div>
                </div>

                <div className="align-findings-scroll">
                  {viewMode === 'files' ? (
                    <ul className="align-file-rows">
                      {fileRows.map((row) => (
                        <li key={row.file}>
                          <button
                            type="button"
                            className={`align-file-row${fileFilter === row.file ? ' is-selected' : ''}`}
                            onClick={() => {
                              setFileFilter(row.file);
                              setViewMode('findings');
                              const first = result.findings.find((item) => item.file === row.file);
                              if (first) setSelectedId(first.id);
                            }}
                          >
                            <strong className="mono">{row.fileName}</strong>
                            <span>
                              {row.count} finding{row.count === 1 ? '' : 's'}
                              {row.candidates > 0
                                ? ` · ${row.candidates} repair candidate${row.candidates === 1 ? '' : 's'}`
                                : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : visibleFindings.length === 0 ? (
                    <div className="align-findings-empty">
                      No findings match the current filters.
                    </div>
                  ) : groupedFindings ? (
                    <div className="align-finding-groups">
                      {groupedFindings.map(([file, items]) => (
                        <section key={file} className="align-finding-group">
                          <h3 className="align-finding-group-title mono">
                            {items[0]?.fileName ?? file}
                          </h3>
                          <ul className="align-finding-rows">{items.map(renderFindingRow)}</ul>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <ul className="align-finding-rows">{visibleFindings.map(renderFindingRow)}</ul>
                  )}
                </div>
              </section>

              <div
                className="align-pane-resize"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize findings pane"
                onPointerDown={onResizeStart}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeEnd}
                onPointerCancel={onResizeEnd}
              />

              <section className="align-inspector" aria-label="Repair inspector">
                {!selected ? (
                  <InspectorEmpty result={result} preparedCount={prepared.size} />
                ) : (
                  <FindingInspector
                    finding={selected}
                    fileContent={files.find((file) => file.name === selected.file)?.content ?? ''}
                    prepared={prepared.has(selected.id)}
                    skipped={skippedIds.has(selected.id)}
                    manualMarked={manualReviewIds.has(selected.id)}
                    onPrepare={() => prepareFix(selected)}
                    onUnprepare={() => unprepareFix(selected.id)}
                    onSkip={() => {
                      setSkippedIds((prev) => new Set(prev).add(selected.id));
                      unprepareFix(selected.id);
                    }}
                    onMarkManual={() =>
                      setManualReviewIds((prev) => new Set(prev).add(selected.id))
                    }
                    onOpenFile={() => {
                      const file = files.find((item) => item.name === selected.file);
                      if (!file) return;
                      const url = URL.createObjectURL(
                        new Blob([file.content], { type: 'application/xml' }),
                      );
                      window.open(url, '_blank', 'noopener,noreferrer');
                      window.setTimeout(() => URL.revokeObjectURL(url), 0);
                    }}
                    onCopyChange={() => {
                      const repair = selected.repair;
                      if (!repair) return;
                      const text =
                        repair.linesChanged <= 1
                          ? `- ${repair.before}\n+ ${repair.after}`
                          : `Before:\n${repair.before}\n\nAfter:\n${repair.after}`;
                      void navigator.clipboard.writeText(text).catch(() => undefined);
                    }}
                  />
                )}
              </section>
            </div>
          )}

          {prepared.size > 0 && !showPreparedReview && (
            <footer className="align-prepared-bar">
              <span>
                {prepared.size} repair{prepared.size === 1 ? '' : 's'} prepared across{' '}
                {preparedFileCount} file{preparedFileCount === 1 ? '' : 's'}
              </span>
              <div className="align-prepared-bar-actions">
                <button type="button" onClick={() => setShowPreparedReview(true)}>
                  Review changes
                </button>
                <button type="button" className="primary" onClick={applyPrepared}>
                  <Download aria-hidden="true" />
                  Validate and apply {prepared.size} repair{prepared.size === 1 ? '' : 's'}
                </button>
              </div>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}

function FindingInspector({
  finding,
  fileContent,
  prepared,
  skipped,
  manualMarked,
  onPrepare,
  onUnprepare,
  onSkip,
  onMarkManual,
  onOpenFile,
  onCopyChange,
}: {
  finding: MetaFinding;
  fileContent: string;
  prepared: boolean;
  skipped: boolean;
  manualMarked: boolean;
  onPrepare: () => void;
  onUnprepare: () => void;
  onSkip: () => void;
  onMarkManual: () => void;
  onOpenFile: () => void;
  onCopyChange: () => void;
}): React.JSX.Element {
  const repair: RepairCandidate | undefined = finding.repair;
  const canPrepare =
    finding.repairAvailability === 'candidate' && repair?.validated && !prepared && !skipped;

  return (
    <div className="align-detail-inner">
      <header className="align-detail-header">
        <h2>{finding.title}</h2>
        <div className="align-detail-badges">
          <span className={`severity-text severity-${finding.severity}`}>
            {severityLabel(finding)}
          </span>
          <span>{confidenceLabel(finding.confidence)} confidence</span>
          <span>{repairStateLabel(finding, prepared, skipped, manualMarked)}</span>
        </div>
        <p className="align-detail-location mono">
          {finding.fileName} · line {finding.location.line}, column {finding.location.column}
        </p>
      </header>

      <section className="align-detail-section">
        <p className="align-explanation">{finding.explanation}</p>
      </section>

      <section className="align-detail-section">
        <h3>Source excerpt</h3>
        <SourceExcerpt excerpt={finding.excerpt} highlightLine={finding.location.line} />
      </section>

      {repair ? (
        <>
          <section className="align-detail-section">
            <h3>Proposed diff</h3>
            <RepairDiff repair={repair} />
          </section>

          <section className="align-detail-section">
            <h3>Validation</h3>
            <ValidationChecks repair={repair} />
            {repair.safetyRationale ? (
              <p className="align-safety">{repair.safetyRationale}</p>
            ) : null}
            {repair.suggestedValue ? (
              <p className="align-suggestion">
                Suggested reference value: <code>{repair.suggestedValue}</code>
              </p>
            ) : null}
            {!repair.validated ? (
              <p className="align-validation-error" role="alert">
                This candidate did not fully validate in memory. Preparing it may produce an invalid
                document.
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="align-detail-section">
          <h3>Repair</h3>
          <p className="align-explanation">
            Automatic repair unavailable for this finding. Inspect the excerpt and apply a manual
            fix in your editor.
          </p>
        </section>
      )}

      {finding.supportingDiagnostics.length > 0 && (
        <TechnicalDisclosure title={`Parser diagnostics (${finding.supportingDiagnostics.length})`}>
          <ul className="align-diagnostics-list">
            {finding.supportingDiagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.message}-${index}`}>
                <code>
                  {diagnostic.location
                    ? `L${diagnostic.location.line}:C${diagnostic.location.column} · `
                    : ''}
                  {diagnostic.message}
                </code>
                {diagnostic.openElementStack && diagnostic.openElementStack.length > 0 ? (
                  <small>Stack: {diagnostic.openElementStack.join(' › ')}</small>
                ) : null}
                {diagnostic.expected ? (
                  <small>
                    Expected {diagnostic.expected}
                    {diagnostic.encountered ? ` · encountered ${diagnostic.encountered}` : ''}
                  </small>
                ) : null}
              </li>
            ))}
          </ul>
        </TechnicalDisclosure>
      )}

      <footer className="align-detail-actions">
        <button type="button" onClick={onSkip} disabled={skipped}>
          <SkipForward aria-hidden="true" />
          Skip
        </button>
        <button type="button" onClick={onOpenFile} disabled={!fileContent}>
          <ExternalLink aria-hidden="true" />
          Open file
        </button>
        <button type="button" onClick={() => onCopyChange()} disabled={!repair}>
          <Copy aria-hidden="true" />
          Copy proposed change
        </button>
        {canPrepare ? (
          <button type="button" className="primary" onClick={onPrepare}>
            <Wrench aria-hidden="true" />
            Prepare fix
          </button>
        ) : null}
        {prepared ? (
          <button type="button" onClick={onUnprepare}>
            Unprepare
          </button>
        ) : null}
        {!manualMarked && finding.repairAvailability !== 'manual' ? (
          <button type="button" onClick={onMarkManual}>
            Mark manual review
          </button>
        ) : null}
      </footer>
    </div>
  );
}
