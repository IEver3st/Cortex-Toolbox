import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream } from 'node:fs';
import { access, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { minimatch } from 'minimatch';
import sharp from 'sharp';
import { ZipArchive } from 'archiver';
import { assertWithinRoot, normalizeRelative } from '@cortex/core';
import {
  decodeDds,
  encodeDdsRgba,
  inspectImageHeader,
  validateImagePlan,
  type ImageOperationPlan,
} from '@cortex/image-pipeline';
import { createPulseTimeline, inspectModel } from '@cortex/model-inspection';
import {
  analyzeScript,
  buildResourceAnalysis,
  type ResourceAnalysis,
} from '@cortex/script-analysis';
import { pluginManifestSchema, type PluginManifest } from '@cortex/plugin-sdk';
import { parseManifest, type ResourceFile } from '@cortex/resource-parser';

const execFileAsync = promisify(execFile);
const scriptExtensions = new Set(['.lua', '.js', '.mjs', '.cjs', '.ts', '.tsx']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.dds', '.tga', '.psd', '.ytd']);
const modelExtensions = new Set(['.gltf', '.glb', '.ydr', '.ydd', '.yft']);
const metadataExtensions = new Set(['.meta', '.xml', '.json']);
const analysisCache = new Map<string, { signature: string; analysis: ResourceAnalysis }>();

const ROLE_PREFIXES = [
  'client',
  'server',
  'shared',
  'stream',
  'data',
  'html',
  'nui',
  'ui',
  'web',
] as const;

type RoleKey = (typeof ROLE_PREFIXES)[number] | 'root' | 'other';

function classifyRole(relativePath: string): RoleKey {
  const normalized = relativePath.replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return 'root';
  const top = (parts[0] ?? '').toLowerCase();
  if ((ROLE_PREFIXES as readonly string[]).includes(top)) return top as RoleKey;
  return 'other';
}

function deriveKind(input: {
  scripts: number;
  textures: number;
  models: number;
  metadata: number;
  total: number;
}): 'script' | 'asset' | 'mixed' | 'empty' {
  if (input.total === 0) return 'empty';
  const assets = input.textures + input.models;
  if (input.scripts === 0 && assets === 0) return 'empty';
  if (input.scripts > 0 && assets === 0) return 'script';
  if (assets > 0 && input.scripts === 0) return 'asset';
  if (input.scripts >= assets * 2) return 'script';
  if (assets >= input.scripts * 2) return 'asset';
  return 'mixed';
}

function hasGlob(pattern: string): boolean {
  return /[*?[{]/.test(pattern);
}

function pathExistsInWorkspace(declared: string, files: ResourceFile[]): boolean {
  const normalized = declared.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized) return true;
  if (!hasGlob(normalized)) {
    const lower = normalized.toLowerCase();
    return files.some((file) => file.relativePath.replaceAll('\\', '/').toLowerCase() === lower);
  }
  return files.some((file) =>
    minimatch(file.relativePath.replaceAll('\\', '/'), normalized, {
      nocase: true,
      dot: true,
    }),
  );
}

export interface ManifestCandidate {
  relativePath: string;
  directory: string;
  manifestName: string;
  label: string;
}

export interface WorkspaceDetection {
  scope: 'resolved' | 'ambiguous' | 'unsupported' | 'empty';
  confidence: 'high' | 'medium' | 'low';
  projectType: string;
  message: string | null;
  candidates: ManifestCandidate[];
}

function findManifestCandidates(files: ResourceFile[]): ManifestCandidate[] {
  return files
    .filter((file) => {
      const name = file.name.toLowerCase();
      return name === 'fxmanifest.lua' || name === '__resource.lua';
    })
    .map((file) => {
      const normalized = file.relativePath.replaceAll('\\', '/');
      const dir = path.posix.dirname(normalized);
      const directory = dir === '.' ? '' : dir;
      const segments = directory.split('/').filter(Boolean);
      const label = segments.length > 0 ? (segments.at(-1) ?? directory) : '(root)';
      return {
        relativePath: file.relativePath,
        directory,
        manifestName: file.name,
        label,
      };
    })
    .sort((a, b) => a.directory.localeCompare(b.directory));
}

function kindLabel(kind: 'script' | 'asset' | 'mixed' | 'empty'): string {
  switch (kind) {
    case 'script':
      return 'Script resource';
    case 'asset':
      return 'Asset pack';
    case 'mixed':
      return 'Mixed resource';
    case 'empty':
      return 'Empty folder';
  }
}

export function detectWorkspaceScope(
  rootManifestName: string | null,
  files: ResourceFile[],
  kind: 'script' | 'asset' | 'mixed' | 'empty',
): WorkspaceDetection {
  const candidates = findManifestCandidates(files);
  const rootHasManifest = Boolean(rootManifestName);
  const nestedCandidates = candidates.filter((entry) => entry.directory !== '');

  if (files.length === 0) {
    return {
      scope: 'empty',
      confidence: 'high',
      projectType: 'Empty folder',
      message: 'This folder is empty. Add a resource manifest or choose a different folder.',
      candidates: [],
    };
  }

  if (candidates.length === 0) {
    const projectType =
      kind === 'asset' || kind === 'mixed' ? 'Mixed asset collection' : 'No supported project';
    return {
      scope: 'unsupported',
      confidence: 'high',
      projectType,
      message: 'No fxmanifest.lua or __resource.lua found in this folder.',
      candidates: [],
    };
  }

  if (candidates.length > 1) {
    return {
      scope: 'ambiguous',
      confidence: 'low',
      projectType: 'Multiple projects',
      message: `This folder may contain multiple projects. Cortex found ${candidates.length} possible resource roots inside.`,
      candidates,
    };
  }

  if (!rootHasManifest && nestedCandidates.length > 0) {
    return {
      scope: 'ambiguous',
      confidence: 'low',
      projectType: 'Nested resource',
      message:
        'A manifest exists in a nested folder, not at the selected root. Choose which resource Cortex should inspect.',
      candidates,
    };
  }

  if (rootHasManifest && nestedCandidates.length > 0) {
    return {
      scope: 'ambiguous',
      confidence: 'medium',
      projectType: kindLabel(kind),
      message: `This folder may be broader than a single resource. Cortex found ${candidates.length} possible resource roots inside.`,
      candidates,
    };
  }

  return {
    scope: 'resolved',
    confidence: 'high',
    projectType: kindLabel(kind),
    message: null,
    candidates: [],
  };
}

async function buildManifestProfile(
  root: string,
  files: ResourceFile[],
  manifestName: string | null,
): Promise<{
  relativePath: string;
  fxVersion: string | null;
  game: string | null;
  author: string | null;
  description: string | null;
  version: string | null;
  clientScripts: number;
  serverScripts: number;
  sharedScripts: number;
  declaredFiles: number;
  dependencies: string[];
  dataFiles: number;
  hasUiPage: boolean;
  uiPage: string | null;
  missing: string[];
  unsupportedCount: number;
  declaredScriptEntries: number;
  missingCount: number;
} | null> {
  if (!manifestName) return null;
  const manifestFile = files.find((file) => {
    const normalized = file.relativePath.replaceAll('\\', '/');
    return normalized.toLowerCase() === manifestName.replaceAll('\\', '/').toLowerCase();
  });
  if (!manifestFile) return null;

  try {
    const source = await readFile(
      assertWithinRoot(root, path.join(root, normalizeRelative(manifestFile.relativePath))),
      'utf8',
    );
    const parsed = parseManifest(source);
    const declared = [
      ...parsed.clientScripts,
      ...parsed.serverScripts,
      ...parsed.sharedScripts,
      ...parsed.files,
      ...parsed.dataFiles.map((entry) => entry.path),
      ...(parsed.uiPage ? [parsed.uiPage] : []),
    ];
    const allMissing = declared
      .map((entry) => entry.value)
      .filter((value) => !pathExistsInWorkspace(value, files));
    const missing = allMissing.slice(0, 12);

    return {
      relativePath: manifestFile.relativePath,
      fxVersion: parsed.fxVersion?.value ?? null,
      game: parsed.game?.value ?? null,
      author: parsed.author?.value ?? null,
      description: parsed.description?.value ?? null,
      version: parsed.version?.value ?? null,
      clientScripts: parsed.clientScripts.length,
      serverScripts: parsed.serverScripts.length,
      sharedScripts: parsed.sharedScripts.length,
      declaredFiles: parsed.files.length,
      dependencies: parsed.dependencies.map((entry) => entry.value).slice(0, 24),
      dataFiles: parsed.dataFiles.length,
      hasUiPage: Boolean(parsed.uiPage),
      uiPage: parsed.uiPage?.value ?? null,
      missing,
      missingCount: allMissing.length,
      unsupportedCount: parsed.unsupported.length,
      declaredScriptEntries:
        parsed.clientScripts.length + parsed.serverScripts.length + parsed.sharedScripts.length,
    };
  } catch {
    return {
      relativePath: manifestFile.relativePath,
      fxVersion: null,
      game: null,
      author: null,
      description: null,
      version: null,
      clientScripts: 0,
      serverScripts: 0,
      sharedScripts: 0,
      declaredFiles: 0,
      dependencies: [],
      dataFiles: 0,
      hasUiPage: false,
      uiPage: null,
      missing: [],
      missingCount: 0,
      unsupportedCount: 0,
      declaredScriptEntries: 0,
    };
  }
}

export async function workspaceSummary(
  root: string,
  files: ResourceFile[],
  manifestName: string | null = null,
) {
  let git = {
    available: false,
    branch: null as string | null,
    changed: [] as { path: string; status: string }[],
  };
  try {
    const [{ stdout: branch }, { stdout: porcelain }] = await Promise.all([
      execFileAsync('git', ['branch', '--show-current'], {
        cwd: root,
        timeout: 3_000,
        windowsHide: true,
      }),
      execFileAsync('git', ['status', '--porcelain=v1', '-uno'], {
        cwd: root,
        timeout: 3_000,
        windowsHide: true,
      }),
    ]);
    git = {
      available: true,
      branch: branch.trim() || null,
      changed: porcelain
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, 500)
        .map((line) => ({ status: line.slice(0, 2).trim() || '?', path: line.slice(3).trim() })),
    };
  } catch {
    // A workspace does not need to be a Git repository.
  }

  const scripts = files.filter((file) => scriptExtensions.has(file.extension)).length;
  const textures = files.filter((file) => imageExtensions.has(file.extension)).length;
  const models = files.filter((file) => modelExtensions.has(file.extension)).length;
  const metadata = files.filter((file) => metadataExtensions.has(file.extension)).length;
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);

  const roles: Record<RoleKey, number> = {
    client: 0,
    server: 0,
    shared: 0,
    stream: 0,
    data: 0,
    html: 0,
    nui: 0,
    ui: 0,
    web: 0,
    root: 0,
    other: 0,
  };
  for (const file of files) {
    roles[classifyRole(file.relativePath)] += 1;
  }

  const extensionCounts = new Map<string, number>();
  for (const file of files) {
    const ext = file.extension || '(none)';
    extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
  }
  const extensions = [...extensionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([ext, count]) => ({ ext, count }));

  const largest = [...files]
    .sort((a, b) => b.bytes - a.bytes || a.relativePath.localeCompare(b.relativePath))
    .slice(0, 6)
    .map((file) => ({ path: file.relativePath, bytes: file.bytes }));

  const kind = deriveKind({
    scripts,
    textures,
    models,
    metadata,
    total: files.length,
  });
  const detection = detectWorkspaceScope(manifestName, files, kind);
  const manifest = await buildManifestProfile(root, files, manifestName);

  const signals: { id: string; severity: 'info' | 'warning' | 'error'; text: string }[] = [];
  if (!manifest && detection.scope !== 'ambiguous') {
    signals.push({
      id: 'no-manifest',
      severity: 'error',
      text: 'No fxmanifest.lua or __resource.lua detected in this folder.',
    });
  } else if (manifest) {
    if (manifest.missingCount > 0) {
      signals.push({
        id: 'missing-refs',
        severity: 'error',
        text: `${manifest.missingCount} manifest path${manifest.missingCount === 1 ? '' : 's'} missing on disk.`,
      });
    }
    if (manifest.declaredScriptEntries === 0 && scripts === 0 && textures + models === 0) {
      signals.push({
        id: 'empty-payload',
        severity: 'warning',
        text: 'Manifest present, but no scripts, models, or textures are declared or found.',
      });
    }
    if (manifest.hasUiPage) {
      signals.push({
        id: 'nui',
        severity: 'info',
        text: `NUI page declared (${manifest.uiPage ?? 'ui_page'}).`,
      });
    }
    if (manifest.dependencies.length > 0) {
      signals.push({
        id: 'deps',
        severity: 'info',
        text: `${manifest.dependencies.length} resource dependenc${manifest.dependencies.length === 1 ? 'y' : 'ies'} declared.`,
      });
    }
    if (manifest.unsupportedCount > 0) {
      signals.push({
        id: 'unsupported',
        severity: 'warning',
        text: `${manifest.unsupportedCount} manifest line${manifest.unsupportedCount === 1 ? '' : 's'} not fully interpreted by the restricted parser.`,
      });
    }
  }

  if (largest[0] && largest[0].bytes >= 5 * 1024 * 1024) {
    signals.push({
      id: 'large-file',
      severity: 'warning',
      text: `Largest file is ${largest[0].path} (${formatApproxBytes(largest[0].bytes)}).`,
    });
  }

  const sideTotal =
    roles.client + roles.server + roles.shared + roles.html + roles.nui + roles.ui + roles.web;
  if (sideTotal === 0 && scripts > 0) {
    signals.push({
      id: 'flat-layout',
      severity: 'info',
      text: 'Scripts are not under conventional client/server/shared folders.',
    });
  }

  return {
    files: files.length,
    bytes,
    scripts,
    textures,
    models,
    metadata,
    kind,
    roles: {
      client: roles.client,
      server: roles.server,
      shared: roles.shared,
      stream: roles.stream,
      data: roles.data,
      html: roles.html + roles.nui + roles.ui + roles.web,
      root: roles.root,
      other: roles.other,
    },
    extensions,
    largest,
    manifest,
    detection,
    signals: signals.slice(0, 8),
    git,
    indexedAt: new Date().toISOString(),
  };
}

function formatApproxBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function analyzeWorkspace(
  root: string,
  files: ResourceFile[],
): Promise<ResourceAnalysis> {
  const candidates = files.filter(
    (file) => scriptExtensions.has(file.extension) && file.bytes <= 2_000_000,
  );
  const signatures = await Promise.all(
    candidates.map(async (file) => {
      const details = await stat(
        assertWithinRoot(root, path.join(root, normalizeRelative(file.relativePath))),
      );
      return `${file.relativePath}:${file.bytes}:${details.mtimeMs}`;
    }),
  );
  const signature = signatures.join('|');
  const cached = analysisCache.get(root);
  if (cached?.signature === signature) return cached.analysis;
  const analyses = await Promise.all(
    candidates.map(async (file) => {
      const source = await readFile(
        assertWithinRoot(root, path.join(root, normalizeRelative(file.relativePath))),
        'utf8',
      );
      return analyzeScript(file.relativePath, source);
    }),
  );
  const analysis = buildResourceAnalysis(analyses);
  analysisCache.set(root, { signature, analysis });
  return analysis;
}

export async function inventoryAssets(root: string, files: ResourceFile[]) {
  const [images, models] = await Promise.all([
    Promise.all(
      files
        .filter((entry) => imageExtensions.has(entry.extension))
        .map(async (file) => {
          const target = assertWithinRoot(
            root,
            path.join(root, normalizeRelative(file.relativePath)),
          );
          const handle = await open(target, 'r');
          try {
            const header = new Uint8Array(Math.min(file.bytes, 64));
            await handle.read(header, 0, header.length, 0);
            return inspectImageHeader(file.relativePath, header, file.bytes);
          } finally {
            await handle.close();
          }
        }),
    ),
    Promise.all(
      files
        .filter((entry) => modelExtensions.has(entry.extension))
        .map(async (file) => {
          const target = assertWithinRoot(
            root,
            path.join(root, normalizeRelative(file.relativePath)),
          );
          if (file.extension === '.gltf') {
            return inspectModel(file.relativePath, await readFile(target));
          }
          const handle = await open(target, 'r');
          try {
            const header = new Uint8Array(Math.min(file.bytes, 64));
            await handle.read(header, 0, header.length, 0);
            return inspectModel(file.relativePath, header);
          } finally {
            await handle.close();
          }
        }),
    ),
  ]);
  const vehicleSource =
    files.find((file) => file.name.toLowerCase() === 'handling.meta')?.relativePath ??
    models.find((model) => model.category === 'vehicle')?.source;
  return { images, models, timelines: vehicleSource ? [createPulseTimeline(vehicleSource)] : [] };
}

export async function processTexture(root: string, input: ImageOperationPlan) {
  const plan = validateImagePlan(input);
  const inputRelative = normalizeRelative(plan.input);
  const outputRelative = normalizeRelative(plan.output);
  const source = assertWithinRoot(root, path.join(root, inputRelative));
  const target = assertWithinRoot(root, path.join(root, outputRelative));
  try {
    await stat(target);
    throw new Error('The selected texture output already exists. Choose a new filename.');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // Expected for a new output.
    } else if (error instanceof Error && error.message.includes('already exists')) throw error;
    else if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  await mkdir(path.dirname(target), { recursive: true });
  const sourceExtension = path.extname(source).toLowerCase();
  const targetExtension = path.extname(target).toLowerCase();
  let pipeline =
    sourceExtension === '.dds'
      ? await (async () => {
          const decoded = decodeDds(await readFile(source));
          return sharp(decoded.data, {
            raw: { width: decoded.width, height: decoded.height, channels: 4 },
            failOn: 'warning',
          });
        })()
      : sharp(source, { failOn: 'warning' });
  if (plan.resize) pipeline = pipeline.resize({ ...plan.resize, withoutEnlargement: true });
  if (plan.flipGreenChannel) pipeline = pipeline.linear([1, -1, 1], [0, 255, 0]);
  if (plan.extractChannel) pipeline = pipeline.extractChannel(plan.extractChannel);
  if (plan.chevron) {
    const size = Math.max(8, Math.round(48 * plan.chevron.scale));
    const opacity = plan.chevron.intensity;
    const overlay = Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><path d="M0 ${size * 0.25} L${size * 0.5} ${size * 0.75} L${size} ${size * 0.25}" fill="none" stroke="rgba(255,255,255,${opacity})" stroke-width="${Math.max(1, size * 0.08)}" transform="rotate(${plan.chevron.angle} ${size / 2} ${size / 2})"/></svg>`,
    );
    pipeline = pipeline.composite([{ input: overlay, tile: true, blend: 'overlay' }]);
  }
  const temporary = `${target}.cortex-${crypto.randomUUID()}.tmp`;
  if (targetExtension === '.dds') {
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    await writeFile(temporary, encodeDdsRgba(data, info.width, info.height));
  } else {
    if (targetExtension === '.png') pipeline = pipeline.png();
    else if (targetExtension === '.webp') pipeline = pipeline.webp({ quality: 90 });
    else pipeline = pipeline.jpeg({ quality: 92 });
    await pipeline.toFile(temporary);
  }
  await rename(temporary, target);
  return { relativePath: outputRelative, bytes: (await stat(target)).size };
}

export async function previewTexture(root: string, input: string) {
  const relativePath = normalizeRelative(input);
  const source = assertWithinRoot(root, path.join(root, relativePath));
  const extension = path.extname(source).toLowerCase();
  let pipeline =
    extension === '.dds'
      ? await (async () => {
          const decoded = decodeDds(await readFile(source));
          return sharp(decoded.data, {
            raw: { width: decoded.width, height: decoded.height, channels: 4 },
          });
        })()
      : sharp(source, { failOn: 'warning' });
  pipeline = pipeline.resize({ width: 1200, height: 900, fit: 'inside', withoutEnlargement: true });
  const { data, info } = await pipeline.png().toBuffer({ resolveWithObject: true });
  return {
    dataUrl: `data:image/png;base64,${data.toString('base64')}`,
    width: info.width,
    height: info.height,
  };
}

export async function extractYtdToZip(
  root: string,
  input: string,
  output: string,
  executablePath: string,
) {
  if (!executablePath.trim()) {
    throw new Error('Configure a local YTDToolio executable in Settings > External tools first.');
  }
  const executable = path.resolve(executablePath.trim());
  await access(executable);
  const inputRelative = normalizeRelative(input);
  const outputRelative = normalizeRelative(output);
  if (path.extname(inputRelative).toLowerCase() !== '.ytd')
    throw new Error('YTD extraction requires a .ytd source file.');
  if (path.extname(outputRelative).toLowerCase() !== '.zip')
    throw new Error('YTD extraction output must be a .zip archive.');
  const source = assertWithinRoot(root, path.join(root, inputRelative));
  const target = assertWithinRoot(root, path.join(root, outputRelative));
  try {
    await stat(target);
    throw new Error('The selected ZIP output already exists. Choose a new filename.');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const temporaryRoot = assertWithinRoot(root, path.join(root, '.cortex', 'tmp'));
  const temporary = assertWithinRoot(
    temporaryRoot,
    path.join(temporaryRoot, `ytd-${crypto.randomUUID()}`),
  );
  await mkdir(temporary, { recursive: true });
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await execFileAsync(executable, ['unpack', source, '-d', temporary], {
      cwd: root,
      timeout: 120_000,
      windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      const outputStream = createWriteStream(target, { flags: 'wx' });
      const archive = new ZipArchive({ zlib: { level: 9 } });
      outputStream.on('close', resolve);
      outputStream.on('error', reject);
      archive.on('error', reject);
      archive.pipe(outputStream);
      archive.directory(temporary, false);
      void archive.finalize();
    });
    return { relativePath: outputRelative, bytes: (await stat(target)).size };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function discoverPlugins(
  root: string,
): Promise<{ manifest: PluginManifest; source: string }[]> {
  const manifests = await fg(['.cortex/plugins/*/plugin.json'], {
    cwd: root,
    onlyFiles: true,
    dot: true,
    followSymbolicLinks: false,
  });
  const output = await Promise.all(
    manifests.map(async (relativePath) => {
      try {
        const input = JSON.parse(
          await readFile(
            assertWithinRoot(root, path.join(root, normalizeRelative(relativePath))),
            'utf8',
          ),
        ) as unknown;
        return { manifest: pluginManifestSchema.parse(input), source: relativePath };
      } catch {
        // Invalid manifests are inert and intentionally not loaded.
        return null;
      }
    }),
  );
  return output.filter(
    (entry): entry is { manifest: PluginManifest; source: string } => entry !== null,
  );
}

export async function writeJsonExport(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8' });
}
