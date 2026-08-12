import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { minimatch } from 'minimatch';
import type { ResourceFile } from './tree';
import type { MissingManifestReference } from './audit';

export interface PackageEntry {
  relativePath: string;
  bytes: number;
  sha256: string;
}

export interface ReleaseGateInput {
  manifestName: string | null;
  entries: PackageEntry[];
  hasParsedManifest: boolean;
  hasFxVersion: boolean;
  hasGame: boolean;
  missingManifestReferences: MissingManifestReference[];
}

export interface ReleaseGateResult {
  allowed: boolean;
  blockers: string[];
}

const MANIFEST_BASENAMES = new Set(['fxmanifest.lua', '__resource.lua']);

const CORTEX_METADATA_NAMES = new Set(['cortex.project.json', '.cortex-write.lock', '.cortex']);

const PAYLOAD_EXTENSIONS = new Set([
  '.lua',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.json',
  '.yml',
  '.yaml',
  '.xml',
  '.meta',
  '.ymap',
  '.ytyp',
  '.ydr',
  '.yft',
  '.ytd',
  '.ycd',
  '.ybn',
  '.ymt',
  '.gfx',
  '.dds',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.ogg',
  '.wav',
  '.mp3',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
]);

function normalizeEntryPath(relativePath: string): string {
  return relativePath.replaceAll('\\', '/').replace(/^\.\/+/, '');
}

function safeEntryPath(
  root: string,
  relativePath: string,
): { relativePath: string; target: string } {
  if (relativePath.includes('\0')) throw new Error('Package paths cannot contain null bytes.');
  const normalized = normalizeEntryPath(relativePath);
  const segments = normalized.split('/');
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.some((segment) => segment === '..' || segment === '.' || segment === '')
  ) {
    throw new Error(`Unsafe package entry path: ${relativePath}`);
  }
  const safeRoot = path.resolve(root);
  const target = path.resolve(safeRoot, ...segments);
  const fromRoot = path.relative(safeRoot, target);
  if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw new Error(`Package entry resolves outside the workspace: ${relativePath}`);
  }
  return { relativePath: normalized, target };
}

function assertRealTargetWithinRoot(rootRealPath: string, targetRealPath: string): void {
  const fromRoot = path.relative(rootRealPath, targetRealPath);
  if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw new Error('Package entries cannot escape the workspace through a symbolic link.');
  }
}

function entryBasename(relativePath: string): string {
  const normalized = normalizeEntryPath(relativePath);
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? normalized : normalized.slice(slash + 1);
}

function isCortexMetadataEntry(relativePath: string): boolean {
  const normalized = normalizeEntryPath(relativePath);
  const basename = entryBasename(normalized);
  if (CORTEX_METADATA_NAMES.has(basename) || CORTEX_METADATA_NAMES.has(normalized)) return true;
  if (normalized === '.cortex' || normalized.startsWith('.cortex/')) return true;
  if (normalized.split('/').includes('.cortex')) return true;
  return false;
}

function isManifestEntry(relativePath: string): boolean {
  return MANIFEST_BASENAMES.has(entryBasename(relativePath));
}

function isPayloadEntry(relativePath: string): boolean {
  if (isCortexMetadataEntry(relativePath)) return false;
  if (isManifestEntry(relativePath)) return false;
  const normalized = normalizeEntryPath(relativePath);
  const ext = path.extname(normalized).toLowerCase();
  if (PAYLOAD_EXTENSIONS.has(ext)) return true;
  if (normalized.split('/').some((segment) => segment.toLowerCase() === 'stream')) return true;
  return false;
}

export function evaluateReleaseGate(input: ReleaseGateInput): ReleaseGateResult {
  const blockers: string[] = [];

  if (!input.manifestName)
    blockers.push('No resource manifest (fxmanifest.lua or __resource.lua) was found.');

  if (input.hasParsedManifest) {
    if (!input.hasFxVersion) blockers.push('The manifest does not declare fx_version.');
    if (!input.hasGame) blockers.push('The manifest does not declare a target game.');
  }

  for (const reference of input.missingManifestReferences) {
    blockers.push(
      `Manifest ${reference.kind} reference "${reference.value}" on line ${reference.line} is missing from the package.`,
    );
  }

  if (input.entries.length === 0) blockers.push('Package entries are empty.');
  else {
    const hasManifestInEntries = input.entries.some((entry) => isManifestEntry(entry.relativePath));
    const hasPayload = input.entries.some((entry) => isPayloadEntry(entry.relativePath));
    const onlyMetadata =
      input.entries.length > 0 &&
      input.entries.every(
        (entry) => isCortexMetadataEntry(entry.relativePath) || isManifestEntry(entry.relativePath),
      ) &&
      !hasPayload;

    if (!hasManifestInEntries)
      blockers.push(
        'Package entries do not include a resource manifest (fxmanifest.lua or __resource.lua).',
      );
    if (!hasPayload || onlyMetadata)
      blockers.push(
        'Package entries contain only Cortex project metadata or lack resource payload files (scripts, assets, or stream content).',
      );
  }

  return { allowed: blockers.length === 0, blockers };
}

async function hashFile(filePath: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(filePath, { highWaterMark: 256 * 1024 })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest('hex') };
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < values.length) {
      const index = next++;
      results[index] = await mapper(values[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

export async function createPackagePlan(
  root: string,
  files: ResourceFile[],
  includes: string[],
  excludes: string[],
): Promise<PackageEntry[]> {
  const rootRealPath = await realpath(root);
  const selected = files
    .map((file) => safeEntryPath(rootRealPath, file.relativePath))
    .filter(
      (safe) =>
        (includes.length === 0 || includes.some((glob) => minimatch(safe.relativePath, glob))) &&
        !excludes.some((glob) => minimatch(safe.relativePath, glob)),
    );
  const archiveNames = new Map<string, string>();
  for (const safe of selected) {
    const key = safe.relativePath.normalize('NFC').toLocaleLowerCase('en-US');
    const existing = archiveNames.get(key);
    if (existing && existing !== safe.relativePath)
      throw new Error(
        `Archive collision: ${existing} and ${safe.relativePath} resolve to the same portable ZIP path.`,
      );
    archiveNames.set(key, safe.relativePath);
  }
  return mapConcurrent(selected, 8, async (safe) => {
    const targetRealPath = await realpath(safe.target);
    assertRealTargetWithinRoot(rootRealPath, targetRealPath);
    const info = await stat(targetRealPath);
    if (!info.isFile())
      throw new Error(`Package entry is not a regular file: ${safe.relativePath}`);
    const digest = await hashFile(targetRealPath);
    return {
      relativePath: safe.relativePath,
      ...digest,
    };
  });
}
