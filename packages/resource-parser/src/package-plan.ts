import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import type { ResourceFile } from './tree';

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
  const selected = files.filter(
    (file) =>
      (includes.length === 0 || includes.some((glob) => minimatch(file.relativePath, glob))) &&
      !excludes.some((glob) => minimatch(file.relativePath, glob)),
  );
  const archiveNames = new Map<string, string>();
  for (const file of selected) {
    const key = file.relativePath.normalize('NFC').toLocaleLowerCase('en-US');
    const existing = archiveNames.get(key);
    if (existing && existing !== file.relativePath)
      throw new Error(
        `Archive collision: ${existing} and ${file.relativePath} resolve to the same portable ZIP path.`,
      );
    archiveNames.set(key, file.relativePath);
  }
  return mapConcurrent(selected, 8, async (file) => {
    const digest = await hashFile(path.join(root, file.relativePath));
    return {
      relativePath: file.relativePath,
      ...digest,
    };
  });
}
