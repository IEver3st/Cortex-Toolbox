import { useQuery } from '@tanstack/react-query';
import { Archive, CheckCircle2, Eye, PackageCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { buildManifestFromFiles } from '@cortex/resource-parser/manifest';
import { formatBytes, unwrap } from '../lib/result';
import { recordActivity } from '../lib/activity-history';
import { useWorkspaceStore } from '../store/workspace';
import { ActionButton } from './ActionButton';
import { ResultsRefreshBar } from './ScanState';
import { Tooltip } from './Tooltip';
import { CodeEditor } from './CodeEditor';

const DEFAULT_EXCLUDES = 'node_modules/**\n.git/**\n.env*\n*.map\n.cortex/**';

export function PackageView(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const files = useWorkspaceStore((state) => state.files);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const setJobs = useWorkspaceStore((state) => state.setJobs);
  const setLastPackagePreview = useWorkspaceStore((state) => state.setLastPackagePreview);
  const [archiveName, setArchiveName] = useState('resource-release.zip');
  const [excludeText, setExcludeText] = useState(DEFAULT_EXCLUDES);
  const [manifestPlan, setManifestPlan] = useState<{
    id: string;
    entries: { relativePath: string; kind: string }[];
  } | null>(null);
  const generatedManifest = useMemo(() => buildManifestFromFiles(files), [files]);
  const profile = {
    includes: ['**/*'],
    excludes: excludeText
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean),
  };
  const archiveNameValid = /^[a-zA-Z0-9._-]+$/.test(archiveName) && archiveName.length <= 128;
  const preview = useQuery({
    queryKey: ['package-preview', workspace?.root, excludeText],
    queryFn: async () => unwrap(await window.cortex.resources.previewPackage(profile)),
    enabled: false,
  });

  useEffect(() => {
    if (!preview.data || !workspace) return;
    const at = new Date().toISOString();
    setLastPackagePreview({
      at,
      fileCount: preview.data.entries.length,
    });
    const name = workspace.project?.name ?? workspace.root.split(/[\\/]/).at(-1) ?? workspace.root;
    const blocked = !preview.data.gate.allowed;
    recordActivity({
      tool: 'bundle',
      workspaceRoot: workspace.root,
      workspaceName: name,
      status: blocked ? 'warning' : 'success',
      summary: blocked
        ? `Preview blocked · ${preview.data.gate.blockers.length} blocker${preview.data.gate.blockers.length === 1 ? '' : 's'}`
        : `${preview.data.entries.length} file${preview.data.entries.length === 1 ? '' : 's'} ready for export`,
      navigate: { kind: 'bundle', tabLabel: 'Bundle' },
      at,
    });
  }, [preview.data, setLastPackagePreview, workspace]);

  const gateAllowed = preview.data?.gate.allowed === true;
  const hasEntries = Boolean(preview.data?.entries.length);
  const buildDisabledReason = !workspace
    ? 'Open a workspace first.'
    : !archiveNameValid
      ? 'Fix the archive name before building.'
      : !preview.data
        ? 'Run a dry run before building.'
        : !hasEntries
          ? 'Dry run produced an empty file list.'
          : !gateAllowed
            ? 'Release gate blockers must be resolved first.'
            : undefined;
  const dryRunDisabledReason = !workspace
    ? 'Open a workspace first.'
    : preview.isFetching
      ? 'Dry run is already running.'
      : !archiveNameValid
        ? 'Fix the archive name before dry run.'
        : undefined;

  const build = async () => {
    try {
      const job = unwrap(await window.cortex.resources.buildPackage({ ...profile, archiveName }));
      if (job) {
        toast.success('Package job started.');
        setJobs(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Package build failed.');
    }
  };
  const planManifest = async () => {
    try {
      setManifestPlan(
        unwrap(await window.cortex.changes.planManifest({ source: generatedManifest })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare the manifest.');
    }
  };
  const applyManifest = async () => {
    if (!manifestPlan) return;
    try {
      unwrap(await window.cortex.changes.applyManifest({ planId: manifestPlan.id }));
      const current = unwrap(await window.cortex.projects.current());
      setWorkspace(current);
      setManifestPlan(null);
      toast.success('fxmanifest.lua created from the current resource files.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create fxmanifest.lua.');
    }
  };
  return (
    <div className="tool-view package-view workbench-page package-workbench">
      {workspace && !workspace.manifestName && (
        <section className="bundle-manifest module-panel" aria-labelledby="bundle-manifest-title">
          <div className="bundle-manifest-copy">
            <span className="badge warning">Manifest missing</span>
            <h2 id="bundle-manifest-title">Build a FiveM boundary from what is actually here</h2>
            <p>
              Bundle classified {files.length} files into client, server, shared, metadata, and
              streamed assets. Review the generated manifest before Cortex writes it.
            </p>
            <div className="form-actions">
              <button type="button" onClick={() => void planManifest()}>
                Review generated fxmanifest
              </button>
              {manifestPlan && (
                <button type="button" className="primary" onClick={() => void applyManifest()}>
                  Create fxmanifest.lua
                </button>
              )}
            </div>
            {manifestPlan && (
              <p className="field-hint" role="status">
                {manifestPlan.entries
                  .map((entry) => `${entry.kind} ${entry.relativePath}`)
                  .join(' · ')}
              </p>
            )}
          </div>
          <CodeEditor value={generatedManifest} label="Generated fxmanifest preview" readOnly />
        </section>
      )}
      <ol className="release-steps" aria-label="Package workflow">
        <li className="active">
          <span>1</span>
          <strong>Define boundary</strong>
          <small>Name the archive and exclude development files.</small>
        </li>
        <li className={preview.data ? 'active' : ''}>
          <span>2</span>
          <strong>Verify output</strong>
          <small>Hash and inspect every path before writing.</small>
        </li>
        <li>
          <span>3</span>
          <strong>Create archive</strong>
          <small>Choose a destination and record the checksum.</small>
        </li>
      </ol>
      <div className="package-layout">
        <section className="package-form">
          <label>
            Archive name
            <input
              name="archiveName"
              autoComplete="off"
              value={archiveName}
              aria-invalid={!archiveNameValid}
              aria-describedby="archive-name-hint"
              onChange={(event) => setArchiveName(event.target.value)}
            />
          </label>
          <small id="archive-name-hint" className={archiveNameValid ? 'field-hint' : 'field-error'}>
            {archiveNameValid
              ? 'Letters, numbers, dots, underscores, and hyphens.'
              : 'Use only letters, numbers, dots, underscores, and hyphens (128 characters max).'}
          </small>
          <label>
            Exclude patterns
            <textarea
              name="excludePatterns"
              autoComplete="off"
              rows={7}
              value={excludeText}
              onChange={(event) => setExcludeText(event.target.value)}
            />
          </label>
          <div className="form-actions">
            <Tooltip
              content={dryRunDisabledReason ?? 'Preview the archive file list without writing'}
              disabled={!dryRunDisabledReason}
              side="top"
            >
              <ActionButton
                busy={preview.isFetching}
                busyLabel="Hashing…"
                disabled={Boolean(dryRunDisabledReason) && !preview.isFetching}
                icon={<Eye aria-hidden="true" />}
                aria-describedby={dryRunDisabledReason ? 'package-dryrun-disabled' : undefined}
                onClick={() => void preview.refetch()}
              >
                Dry run
              </ActionButton>
            </Tooltip>
            <Tooltip
              content={buildDisabledReason ?? 'Choose an output path and build the release ZIP'}
              disabled={!buildDisabledReason}
              side="top"
            >
              <ActionButton
                variant="primary"
                disabled={Boolean(buildDisabledReason)}
                icon={<Archive aria-hidden="true" />}
                aria-describedby={buildDisabledReason ? 'package-build-disabled' : undefined}
                onClick={() => void build()}
              >
                Choose output and build
              </ActionButton>
            </Tooltip>
          </div>
          {dryRunDisabledReason && (
            <span id="package-dryrun-disabled" className="sr-only">
              {dryRunDisabledReason}
            </span>
          )}
          {buildDisabledReason && (
            <span id="package-build-disabled" className="sr-only">
              {buildDisabledReason}
            </span>
          )}
          <details className="glob-map">
            <summary>Rule evaluation</summary>
            <div>
              <span className="include">INCLUDE</span>
              <code>**/*</code>
            </div>
            {profile.excludes.map((pattern) => (
              <div key={pattern}>
                <span>EXCLUDE</span>
                <code>{pattern}</code>
              </div>
            ))}
            <small>
              Paths are matched case-sensitively. Cortex always excludes .cortex/**,
              .cortex-write.lock, *.zip, and *.sha256. Case-folded and Unicode-normalized ZIP
              collisions are blocked.
            </small>
          </details>
        </section>
        <section className={`package-preview${preview.isFetching ? ' is-refreshing' : ''}`}>
          <ResultsRefreshBar active={preview.isFetching && Boolean(preview.data)} />
          <div className="preview-heading">
            <strong>Bundle output manifest</strong>
            <span>
              {preview.isFetching && !preview.data
                ? 'Hashing selected files…'
                : preview.data
                  ? `${preview.data.entries.length} files · ${formatBytes(preview.data.entries.reduce((sum, entry) => sum + entry.bytes, 0))}`
                  : 'Run a dry run'}
            </span>
          </div>
          {preview.isFetching && !preview.data && (
            <div className="editor-state" role="status">
              Hashing selected files…
            </div>
          )}
          {preview.isError && (
            <div className="error-banner" role="alert">
              <strong>Dry run failed.</strong> {preview.error.message} Review the patterns and try
              again.
            </div>
          )}
          {preview.data && !preview.data.gate.allowed && (
            <div className="error-banner" role="alert">
              <strong>Release gate blocked.</strong>
              <ul>
                {preview.data.gate.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}
          {preview.data?.gate.allowed && (
            <div className="validation-success" style={{ marginBottom: '0.75rem' }}>
              <div className="success-banner">
                <CheckCircle2 />
                Gate checks passed for this dry run.
              </div>
            </div>
          )}
          {!preview.isFetching && !preview.isError && !preview.data && (
            <div className="package-empty">
              <PackageCheck />
              <strong>Preview before you build</strong>
              <p>
                Run a dry run to calculate the exact file list, size, and checksum evidence. The
                build action stays unavailable until the preview succeeds and the gate allows it.
              </p>
              <ul>
                <li>
                  <CheckCircle2 /> Internal Cortex files are always excluded
                </li>
                <li>
                  <CheckCircle2 /> Case-folding and Unicode collisions are blocked
                </li>
              </ul>
            </div>
          )}
          <div className="preview-files">
            {preview.data?.entries.map((entry) => (
              <div key={entry.relativePath}>
                <code>{entry.relativePath}</code>
                <span>{formatBytes(entry.bytes)}</span>
                <small>{entry.sha256.slice(0, 12)}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
