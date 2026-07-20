import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, FileImage, ImageDown, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, Toggle } from '../../components/UiPrimitives';
import { unwrap } from '../../lib/result';
import { useWorkspaceStore } from '../../store/workspace';

type OutputFormat = 'png' | 'jpeg' | 'webp' | 'dds';

function replaceExtension(relativePath: string, extension: string): string {
  const divider = Math.max(relativePath.lastIndexOf('/'), relativePath.lastIndexOf('\\'));
  const dot = relativePath.lastIndexOf('.');
  const base = dot > divider ? relativePath.slice(0, dot) : relativePath;
  return `${base}-converted.${extension}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TextureConverter(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const queryClient = useQueryClient();
  const assets = useQuery({
    queryKey: ['texture-assets', workspace?.root],
    queryFn: async () => unwrap(await window.cortex.resources.assets()),
    enabled: Boolean(workspace),
  });
  const [source, setSource] = useState('');
  const [format, setFormat] = useState<OutputFormat>('png');
  const [output, setOutput] = useState('');
  const [width, setWidth] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [flipGreen, setFlipGreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const effectiveSource = source.length > 0 ? source : (assets.data?.images[0]?.relativePath ?? '');
  const selected =
    assets.data?.images.find((image) => image.relativePath === effectiveSource) ?? null;
  const isYtd = selected?.format === 'ytd';

  const preview = useQuery({
    queryKey: ['texture-preview', workspace?.root, effectiveSource],
    queryFn: async () =>
      unwrap(await window.cortex.resources.previewTexture({ input: effectiveSource })),
    enabled: Boolean(effectiveSource && !isYtd),
  });

  const supportedOutput = useMemo<OutputFormat[]>(() => {
    if (selected?.format === 'dds') return ['png', 'jpeg', 'webp'];
    return ['dds', 'png', 'jpeg', 'webp'];
  }, [selected?.format]);
  const effectiveFormat = supportedOutput.includes(format) ? format : (supportedOutput[0] ?? 'png');
  const effectiveOutput =
    output ||
    (effectiveSource
      ? replaceExtension(
          effectiveSource,
          isYtd ? 'zip' : effectiveFormat === 'jpeg' ? 'jpg' : effectiveFormat,
        )
      : '');

  const convert = async () => {
    if (!effectiveSource || !effectiveOutput) return;
    setBusy(true);
    try {
      const result = isYtd
        ? await window.cortex.resources.extractYtd({
            input: effectiveSource,
            output: effectiveOutput,
          })
        : await window.cortex.resources.processTexture({
            input: effectiveSource,
            output: effectiveOutput,
            overwriteOriginal: false,
            resize:
              width || height
                ? {
                    width: width || undefined,
                    height: height || undefined,
                    fit: 'inside',
                  }
                : undefined,
            flipGreenChannel: flipGreen,
          });
      if (!result.ok) throw new Error(result.error.message);
      toast.success(`${result.data.relativePath} created (${formatBytes(result.data.bytes)}).`);
      await assets.refetch();
      await queryClient.invalidateQueries({ queryKey: ['workspace-files'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Texture conversion failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!workspace) {
    return (
      <div className="workbench-page module-page texture-view">
        <EmptyState
          icon={ImageDown}
          title="Open a resource folder"
          description="Texture conversion writes reviewed new files inside a workspace and never overwrites the source."
        />
      </div>
    );
  }

  return (
    <div className="workbench-page module-page texture-view">
      <PageHeader
        actions={
          <button type="button" onClick={() => void assets.refetch()}>
            <RefreshCw aria-hidden="true" /> Rescan
          </button>
        }
      />
      <div className="texture-shell">
        <aside className="texture-source-list" aria-label="Workspace textures">
          <h2>
            Textures <span>{assets.data?.images.length ?? 0}</span>
          </h2>
          {assets.isPending ? <p>Reading texture headers…</p> : null}
          {assets.data?.images.map((image) => (
            <button
              key={image.relativePath}
              type="button"
              className={effectiveSource === image.relativePath ? 'is-selected' : ''}
              onClick={() => {
                setSource(image.relativePath);
                setOutput('');
              }}
            >
              {image.format === 'ytd' ? (
                <Archive aria-hidden="true" />
              ) : (
                <FileImage aria-hidden="true" />
              )}
              <span>
                <strong>{image.relativePath.split(/[\\/]/).at(-1)}</strong>
                <small>
                  {image.width && image.height ? `${image.width} × ${image.height} · ` : ''}
                  {image.format.toUpperCase()} · {formatBytes(image.bytes)}
                </small>
              </span>
            </button>
          ))}
          {!assets.isPending && assets.data?.images.length === 0 ? (
            <p>No supported textures were found in this resource.</p>
          ) : null}
        </aside>

        <section className="texture-preview-panel">
          <header>
            <div>
              <h2>{selected?.relativePath.split(/[\\/]/).at(-1) ?? 'Select a texture'}</h2>
              <p>
                {selected
                  ? `${selected.format.toUpperCase()} · ${formatBytes(selected.bytes)}`
                  : 'Workspace source'}
              </p>
            </div>
            {selected?.capability ? <span>{selected.capability.replace('-', ' ')}</span> : null}
          </header>
          <div className="texture-preview-stage">
            {isYtd ? (
              <div className="texture-ytd-summary">
                <Archive aria-hidden="true" />
                <strong>GTA V texture dictionary</strong>
                <p>
                  Extraction preserves each embedded texture as emitted by the configured YTDToolio
                  executable, then packages the results into one ZIP.
                </p>
              </div>
            ) : preview.data ? (
              <img
                src={preview.data.dataUrl}
                alt={`Preview of ${effectiveSource}`}
                width={preview.data.width}
                height={preview.data.height}
              />
            ) : preview.isError ? (
              <div className="texture-ytd-summary">
                <FileImage aria-hidden="true" />
                <strong>Preview unavailable</strong>
                <p>
                  {preview.error instanceof Error
                    ? preview.error.message
                    : 'The texture could not be decoded.'}
                </p>
              </div>
            ) : (
              <div className="texture-preview-skeleton" aria-label="Loading texture preview" />
            )}
          </div>
          {selected && !isYtd ? (
            <dl className="texture-metadata">
              <div>
                <dt>Source</dt>
                <dd>{selected.relativePath}</dd>
              </div>
              <div>
                <dt>Dimensions</dt>
                <dd>
                  {selected.width && selected.height
                    ? `${selected.width} × ${selected.height}`
                    : 'Read during decode'}
                </dd>
              </div>
              <div>
                <dt>Output alpha</dt>
                <dd>{effectiveFormat === 'jpeg' ? 'Flattened' : 'Preserved'}</dd>
              </div>
            </dl>
          ) : null}
        </section>

        <aside className="texture-convert-panel" aria-label="Conversion settings">
          <h2>{isYtd ? 'Extract dictionary' : 'Convert texture'}</h2>
          {!isYtd ? (
            <>
              <label>
                Output format
                <select
                  value={effectiveFormat}
                  onChange={(event) => {
                    setFormat(event.target.value as OutputFormat);
                    setOutput('');
                  }}
                >
                  {supportedOutput.map((option) => (
                    <option key={option} value={option}>
                      {option === 'dds' ? 'DDS (32-bit RGBA)' : option.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <div className="texture-size-inputs">
                <label>
                  Width
                  <input
                    type="number"
                    min={1}
                    max={16384}
                    placeholder="Keep"
                    value={width}
                    onChange={(event) =>
                      setWidth(event.target.value ? Number(event.target.value) : '')
                    }
                  />
                </label>
                <label>
                  Height
                  <input
                    type="number"
                    min={1}
                    max={16384}
                    placeholder="Keep"
                    value={height}
                    onChange={(event) =>
                      setHeight(event.target.value ? Number(event.target.value) : '')
                    }
                  />
                </label>
              </div>
              <div className="texture-option-row">
                <span>
                  <strong>Flip green channel</strong>
                  <small>Useful when adapting normal-map conventions.</small>
                </span>
                <Toggle
                  id="texture-flip-green"
                  name="textureFlipGreen"
                  checked={flipGreen}
                  onChange={setFlipGreen}
                />
              </div>
              <p className="texture-format-note">
                DDS decoding supports RGBA8, DXT1, DXT3, and DXT5. DDS output uses lossless 32-bit
                BGRA pixels for predictable round trips.
              </p>
            </>
          ) : (
            <p className="texture-format-note">
              YTD extraction uses the executable path in Settings &gt; External tools. Cortex passes
              the selected file to <code>unpack</code>, archives the extracted textures, and removes
              its temporary folder.
            </p>
          )}
          <label>
            Output path
            <input
              name="textureOutputPath"
              autoComplete="off"
              value={effectiveOutput}
              onChange={(event) => setOutput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={!selected || busy}
            onClick={() => void convert()}
          >
            <Download aria-hidden="true" />{' '}
            {busy
              ? isYtd
                ? 'Extracting…'
                : 'Converting…'
              : isYtd
                ? 'Extract to ZIP'
                : `Create ${effectiveFormat.toUpperCase()}`}
          </button>
          <small>
            Outputs must be new files inside the active workspace. Existing files are never
            replaced.
          </small>
        </aside>
      </div>
    </div>
  );
}
