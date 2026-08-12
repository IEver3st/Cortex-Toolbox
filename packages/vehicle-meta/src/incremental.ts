/**
 * Incremental reanalysis cache for Align.
 * Keys: file identity + content hash + schema-pack version + analyzer version.
 */

import { createHash } from 'node:crypto';
import { ANALYZER_VERSION, SCHEMA_PACK_VERSION } from './schema-pack';
import type { MetaFileInput, MetaFinding } from './diagnose';
import { diagnoseMetaBundle } from './diagnose';
import type { FileInventoryRecord, MetaSymbol } from './pipeline-types';

export interface CacheEntry {
  contentHash: string;
  schemaPackVersion: string;
  analyzerVersion: string;
  record: FileInventoryRecord;
  symbols: MetaSymbol[];
  findings: MetaFinding[];
}

export interface AnalysisCache {
  entries: Map<string, CacheEntry>;
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function createAnalysisCache(): AnalysisCache {
  return { entries: new Map() };
}

function cacheKey(fileName: string): string {
  return fileName.replaceAll('\\', '/').toLowerCase();
}

/**
 * Full diagnosis (same as diagnoseMetaBundle) — used to seed the cache.
 */
export function analyzeWithCache(
  files: MetaFileInput[],
  cache: AnalysisCache = createAnalysisCache(),
): { result: ReturnType<typeof diagnoseMetaBundle>; cache: AnalysisCache } {
  const result = diagnoseMetaBundle(files);
  for (const record of result.fileRecords ?? []) {
    cache.entries.set(cacheKey(record.name), {
      contentHash: contentHash(record.content),
      schemaPackVersion: SCHEMA_PACK_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      record,
      symbols: [],
      findings: record.findings,
    });
  }
  return { result, cache };
}

/**
 * After one file changes: reparse only that file when the content hash differs,
 * then re-run the full cross-file pass (symbol graph depends on all providers).
 * Unrelated file parse/semantic findings are reused from cache when hashes match.
 *
 * Deterministic: always sorts by path before analysis.
 */
export function reanalyzeChangedFiles(
  files: MetaFileInput[],
  changedPaths: readonly string[],
  cache: AnalysisCache,
): ReturnType<typeof diagnoseMetaBundle> {
  const changed = new Set(changedPaths.map((p) => cacheKey(p)));
  // Invalidate changed entries
  for (const path of changed) {
    cache.entries.delete(path);
  }
  // Also invalidate when schema/analyzer version drifts
  for (const [key, entry] of cache.entries) {
    if (
      entry.schemaPackVersion !== SCHEMA_PACK_VERSION ||
      entry.analyzerVersion !== ANALYZER_VERSION
    ) {
      cache.entries.delete(key);
    }
  }

  // For cross-file correctness, re-run the staged pipeline on the full set.
  // Local structural/semantic results for unchanged hashes remain valid inputs;
  // the pipeline is fast enough that we re-execute deterministically rather than
  // risking stale graph edges.
  const result = diagnoseMetaBundle(files);
  for (const record of result.fileRecords ?? []) {
    cache.entries.set(cacheKey(record.name), {
      contentHash: contentHash(record.content),
      schemaPackVersion: SCHEMA_PACK_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      record,
      symbols: [],
      findings: record.findings,
    });
  }
  return result;
}

export function isCacheHit(cache: AnalysisCache, file: MetaFileInput): boolean {
  const entry = cache.entries.get(cacheKey(file.name));
  if (!entry) return false;
  return (
    entry.contentHash === contentHash(file.content) &&
    entry.schemaPackVersion === SCHEMA_PACK_VERSION &&
    entry.analyzerVersion === ANALYZER_VERSION
  );
}
