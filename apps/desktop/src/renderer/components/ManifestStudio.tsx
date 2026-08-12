import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, FolderOpen, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ChangePlan } from '@cortex/core';
import { EmptyState } from './UiPrimitives';
import { unwrap } from '../lib/result';
import { useWorkspaceStore } from '../store/workspace';
import { ManifestCodeEditor } from './manifest/ManifestCodeEditor';
import { ManifestHeader } from './manifest/ManifestHeader';
import { ManifestInspector, type InspectorTab } from './manifest/ManifestInspector';
import { ManifestReviewDialog } from './manifest/ManifestReviewDialog';
import { ManifestStructuredView } from './manifest/ManifestStructuredView';
import {
  buildDocumentSummary,
  buildManifestProblems,
  buildPathEntries,
  computeDocumentStatus,
  computeLineDiff,
  detectEncoding,
  detectLineEnding,
  findingsToProblems,
  normalizePath,
  safeParseManifest,
  type ManifestProblem,
  type ManifestView,
} from './manifest/manifest-utils';

const STARTER_MANIFEST =
  "fx_version 'cerulean'\ngame 'gta5'\n\nauthor ''\ndescription ''\nversion '1.0.0'\n";

const INSPECTOR_MIN = 280;
const INSPECTOR_MAX = 480;
const INSPECTOR_DEFAULT = 320;

export function ManifestStudio(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const files = useWorkspaceStore((state) => state.files);
  const markDirty = useWorkspaceStore((state) => state.markDirty);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const setFiles = useWorkspaceStore((state) => state.setFiles);
  const queryClient = useQueryClient();

  const [source, setSource] = useState('');
  const [baseline, setBaseline] = useState('');
  const [diskBaseline, setDiskBaseline] = useState('');
  const [plan, setPlan] = useState<ChangePlan | null>(null);
  const [applying, setApplying] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [view, setView] = useState<ManifestView>('source');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('problems');
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT);
  const [highlightLine, setHighlightLine] = useState<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [externalChange, setExternalChange] = useState(false);
  const [auditProblems, setAuditProblems] = useState<ManifestProblem[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const query = useQuery({
    queryKey: ['index', workspace?.root],
    queryFn: async () => unwrap(await window.cortex.resources.loadManifest()),
    enabled: Boolean(workspace),
  });

  useEffect(() => {
    if (query.data) {
      setSource(query.data.source);
      setBaseline(query.data.source);
      setDiskBaseline(query.data.source);
      setReadOnly(false);
    } else if (query.isSuccess) {
      setSource(STARTER_MANIFEST);
      setBaseline('');
      setDiskBaseline('');
      setReadOnly(false);
    }
    setValidated(false);
    setExternalChange(false);
  }, [query.data, query.isSuccess, workspace?.root]);

  useEffect(() => markDirty('index', source !== baseline), [source, baseline, markDirty]);

  useEffect(() => {
    if (!workspace || query.isLoading) return;
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const loaded = unwrap(await window.cortex.resources.loadManifest());
          const diskSource = loaded?.source ?? '';
          if (diskSource && diskSource !== diskBaseline && diskSource !== source) {
            setExternalChange(true);
          }
        } catch {
          /* ignore polling errors */
        }
      })();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [workspace, query.isLoading, diskBaseline, source]);

  const isNewFile = !query.data;
  const dirty = source !== baseline;
  const relativePath = query.data?.relativePath ?? 'fxmanifest.lua';
  const workspaceName =
    workspace?.project?.name ?? workspace?.root.split(/[\\/]/).at(-1) ?? 'Workspace';

  const liveParsed = useMemo(() => safeParseManifest(source), [source]);

  const fileIndex = useMemo(() => {
    const set = new Set<string>();
    for (const file of files) set.add(normalizePath(file.relativePath));
    return set;
  }, [files]);

  const allPaths = useMemo(() => files.map((file) => normalizePath(file.relativePath)), [files]);

  const pathEntries = useMemo(
    () => buildPathEntries(liveParsed, fileIndex, allPaths),
    [liveParsed, fileIndex, allPaths],
  );

  const auditSuppressions = useMemo(() => {
    const configured = workspace?.project?.preferences.auditSuppressions;
    return Array.isArray(configured)
      ? configured.filter((value): value is string => typeof value === 'string')
      : [];
  }, [workspace?.project?.preferences.auditSuppressions]);

  const problems = useMemo(
    () => buildManifestProblems(liveParsed, files, relativePath, auditSuppressions, auditProblems),
    [liveParsed, files, relativePath, auditSuppressions, auditProblems],
  );

  const documentStatus = useMemo(
    () => computeDocumentStatus(dirty, problems, validated),
    [dirty, problems, validated],
  );

  const summary = useMemo(
    () => buildDocumentSummary(liveParsed, pathEntries),
    [liveParsed, pathEntries],
  );

  const lineDiff = useMemo(
    () => (plan ? computeLineDiff(baseline, source) : null),
    [plan, baseline, source],
  );

  const hasBlockingErrors = problems.some((item) => item.severity === 'error');

  const goToLine = useCallback((line: number) => {
    setView('source');
    setHighlightLine(line);
  }, []);

  const validate = async () => {
    setValidating(true);
    setValidated(true);
    setInspectorTab('problems');
    let extra: ManifestProblem[] = [];
    try {
      const findings = unwrap(await window.cortex.resources.audit());
      extra = findingsToProblems(findings, relativePath);
      setAuditProblems(extra);
    } catch {
      setAuditProblems([]);
    }
    setValidating(false);
    const nextProblems = buildManifestProblems(
      liveParsed,
      files,
      relativePath,
      auditSuppressions,
      extra,
    );
    const blocking = nextProblems.some((item) => item.severity === 'error');
    if (blocking) {
      toast.error('Manifest has blocking validation errors.');
    } else if (
      nextProblems.some((item) => item.severity === 'warning' || item.severity === 'review')
    ) {
      toast.message('Validation complete — review findings in the inspector.');
    } else {
      toast.success('Manifest looks valid.');
    }
  };

  const review = async () => {
    if (hasBlockingErrors) {
      toast.error('Resolve blocking errors before reviewing save.');
      setInspectorTab('problems');
      return;
    }
    try {
      setPlanning(true);
      setPlan(unwrap(await window.cortex.changes.planManifest({ source })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create change plan.');
    } finally {
      setPlanning(false);
    }
  };

  const apply = async (options?: { force?: boolean }) => {
    if (!plan) return;
    if (hasBlockingErrors && !options?.force) {
      toast.error('Cannot save while blocking errors remain.');
      return;
    }
    try {
      setApplying(true);
      const result = unwrap(await window.cortex.changes.applyManifest({ planId: plan.id }));
      setBaseline(source);
      setDiskBaseline(source);
      setPlan(null);
      setLastSavedAt(new Date().toLocaleString());
      setValidated(true);
      setExternalChange(false);
      await queryClient.invalidateQueries({ queryKey: ['index', workspace?.root] });
      await query.refetch();
      const current = await window.cortex.projects.current();
      if (current.ok && current.data) setWorkspace(current.data);
      const listed = await window.cortex.files.list();
      if (listed.ok) setFiles(listed.data);
      toast.success(
        result.backup
          ? `Manifest saved. Backup: ${result.backup}`
          : 'Manifest created successfully.',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed — no file was written.');
    } finally {
      setApplying(false);
    }
  };

  const discard = () => {
    if (isNewFile && baseline === '') {
      setSource(STARTER_MANIFEST);
      return;
    }
    setSource(baseline);
    setValidated(false);
  };

  const reloadFromDisk = async () => {
    if (dirty && !window.confirm('Reload from disk and discard your unsaved edits?')) {
      return;
    }
    await query.refetch();
    setExternalChange(false);
    toast.message('Manifest reloaded from disk.');
  };

  const compareExternal = async () => {
    try {
      setPlanning(true);
      setPlan(unwrap(await window.cortex.changes.planManifest({ source })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not compare changes.');
    } finally {
      setPlanning(false);
    }
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeRef.current = { startX: event.clientX, startWidth: inspectorWidth };
    const onMove = (moveEvent: PointerEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startX - moveEvent.clientX;
      const next = Math.min(
        INSPECTOR_MAX,
        Math.max(INSPECTOR_MIN, resizeRef.current.startWidth + delta),
      );
      setInspectorWidth(next);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const revealManifest = () => {
    if (!workspace) return;
    void window.cortex.projects.reveal({ root: workspace.root });
  };

  const copyPath = async () => {
    if (!workspace) return;
    const fullPath = `${workspace.root.replace(/[\\/]$/, '')}/${relativePath}`;
    try {
      await navigator.clipboard.writeText(fullPath);
      toast.success('Path copied.');
    } catch {
      toast.error('Could not copy path.');
    }
  };

  if (!workspace) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Open a resource to edit its manifest"
        description="Index safely edits fxmanifest.lua without executing Lua. Open a resource folder first."
      />
    );
  }

  if (query.isLoading) {
    return (
      <div className="editor-state" role="status">
        Reading the resource manifest…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="editor-state error" role="alert">
        Cortex could not read the manifest. {query.error.message}
      </div>
    );
  }

  return (
    <div className="index-studio">
      {isNewFile ? (
        <div className="index-banner" role="status">
          <FilePlus2 aria-hidden="true" />
          <div>
            <strong>No manifest on disk yet</strong>
            <p>
              Cortex seeded a starter for <code>fxmanifest.lua</code>. Nothing is written until you
              review and save.
            </p>
          </div>
        </div>
      ) : null}

      {externalChange ? (
        <div className="index-banner warning" role="alert">
          <RefreshCw aria-hidden="true" />
          <div>
            <strong>File changed on disk</strong>
            <p>
              The manifest was modified outside Index. Compare or reload — Cortex will not silently
              overwrite external changes.
            </p>
          </div>
          <div className="index-banner-actions">
            <button type="button" onClick={() => void compareExternal()}>
              Compare changes
            </button>
            <button type="button" onClick={() => void reloadFromDisk()}>
              Reload
            </button>
          </div>
        </div>
      ) : null}

      <ManifestHeader
        workspaceName={workspaceName}
        manifestName={relativePath}
        status={documentStatus}
        view={view}
        dirty={dirty}
        validating={validating}
        planning={planning}
        onViewChange={setView}
        onValidate={() => void validate()}
        onReviewSave={() => void review()}
        onDiscard={discard}
      />

      <button
        type="button"
        className="index-summary"
        onClick={() => setView('structured')}
        title="Open structured view"
        aria-label={`Document summary: ${summary}`}
      >
        {summary}
      </button>

      <div className="index-workbench">
        <main className="index-editor-pane">
          {view === 'source' ? (
            <ManifestCodeEditor
              value={source}
              readOnly={readOnly}
              problems={problems}
              highlightLine={highlightLine}
              onChange={setSource}
              onPathClick={goToLine}
            />
          ) : (
            <ManifestStructuredView
              parsed={liveParsed}
              source={source}
              unsupportedCount={liveParsed.unsupported.length}
              onSourceChange={setSource}
              onEditInSource={() => setView('source')}
              onGoToLine={goToLine}
            />
          )}
        </main>

        <ManifestInspector
          width={inspectorWidth}
          activeTab={inspectorTab}
          problems={problems}
          paths={pathEntries}
          document={{
            parserMode: 'Restricted Lua subset',
            manifestType: relativePath.endsWith('__resource.lua')
              ? 'Legacy __resource.lua'
              : 'fxmanifest.lua',
            filePath: relativePath,
            encoding: detectEncoding(source),
            lineEndings: detectLineEnding(source),
            lastSavedAt,
            backupBehavior: 'Timestamped copy in .cortex/backups/',
            readOnly,
          }}
          onTabChange={setInspectorTab}
          onResizeStart={handleResizeStart}
          onGoToLine={goToLine}
          onReveal={revealManifest}
          onCopyPath={() => void copyPath()}
        />
      </div>

      <ManifestReviewDialog
        plan={plan}
        relativePath={relativePath}
        isNewFile={isNewFile}
        applying={applying}
        lineDiff={lineDiff}
        problems={problems}
        manualReviewCount={liveParsed.unsupported.length}
        hasBlockingErrors={hasBlockingErrors}
        onClose={() => setPlan(null)}
        onApply={() => void apply()}
        forceSaveDespiteErrors={
          hasBlockingErrors
            ? () => {
                if (
                  window.confirm(
                    'Save despite blocking validation errors? Only use this for source-only recovery.',
                  )
                ) {
                  void apply({ force: true });
                }
              }
            : undefined
        }
      />
    </div>
  );
}
