/**
 * Align regression suite for FiveM_Near_Perfect_20_Meta_Test_Batch
 * (batch_all_broken/ — 20 metadata files, one intentional defect each).
 *
 * ANSWER_KEY.csv is a test-only oracle. Production analysis never reads it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyPreparedRepairs,
  diagnoseMetaBundle,
  isWellFormedXml,
  revalidateRepairedFiles,
  type MetaFileInput,
  type MetaFinding,
} from './index';

const SUITE_ROOT = path.resolve('C:/Users/User/Desktop/FiveM_Vehicle_Meta_Repair_Test_Suite');
const BATCH_DIR = path.join(SUITE_ROOT, 'batch_all_broken');
const ANSWER_KEY_PATH = path.join(BATCH_DIR, 'ANSWER_KEY.csv');

interface AnswerRow {
  file: string;
  badLine: number;
  errorFamily: string;
  category: string;
  titlePattern: RegExp;
  expectedFix?: string;
}

function parseAnswerKey(csv: string): AnswerRow[] {
  const lines = csv.trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    // Simple CSV split (fields do not contain commas except in notes which we ignore after 6)
    const parts = line.split(',');
    const file = parts[0] ?? '';
    const badLine = Number(parts[1] ?? 0);
    const errorFamily = parts[2] ?? '';
    const category = parts[3] ?? '';
    const titlePattern = new RegExp(parts[4] ?? '.', 'i');
    const fixRaw = parts[5]?.trim();
    const row: AnswerRow = { file, badLine, errorFamily, category, titlePattern };
    if (fixRaw) row.expectedFix = fixRaw;
    return row;
  });
}

function loadBatch(order: 'alpha' | 'reverse' | 'shuffle' = 'alpha', seed = 1): MetaFileInput[] {
  const names = readdirSync(BATCH_DIR).filter((name) => name.endsWith('.meta'));
  let ordered = [...names].sort((a, b) => a.localeCompare(b));
  if (order === 'reverse') ordered = ordered.reverse();
  if (order === 'shuffle') {
    // Deterministic shuffle from seed
    let state = seed;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffff_ffff;
    };
    for (let i = ordered.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!];
    }
  }
  return ordered.map((name) => ({
    name: path.join('batch_all_broken', name).replaceAll('\\', '/'),
    content: readFileSync(path.join(BATCH_DIR, name), 'utf8'),
  }));
}

function rootFindings(findings: MetaFinding[]): MetaFinding[] {
  return findings.filter((f) => f.severity !== 'info');
}

function stableSignature(findings: MetaFinding[]): string {
  return rootFindings(findings)
    .map(
      (f) =>
        `${f.fileName}|${f.category}|${f.title}|L${f.location.line}|${f.repairAvailability}|${f.repair?.suggestedValue ?? ''}`,
    )
    .sort()
    .join('\n');
}

const answerKey = parseAnswerKey(readFileSync(ANSWER_KEY_PATH, 'utf8'));

describe('Align 20-file Near-Perfect Meta batch', () => {
  it('loads all 20 meta files and reports coverage without silent skips', () => {
    const files = loadBatch('alpha');
    expect(files).toHaveLength(20);
    const result = diagnoseMetaBundle(files);

    expect(result.stats.files).toBe(20);
    expect(result.stats.filesWithFindings).toBe(20);
    expect(result.stats.rootFindings).toBe(20);
    expect(result.coverage?.silentlySkipped).toBe(0);
    expect(result.coverage?.filesInventoried).toBe(20);
    expect(result.coverage?.parsedNormally).toBe(14);
    expect(result.coverage?.parsedWithStructuralFailures).toBe(6);
    expect(result.coverageReport).toMatch(/SCAN COVERAGE/);
    expect(result.coverageReport).toMatch(/0 files silently skipped/);
  });

  it('associates exactly one intended root finding per file from ANSWER_KEY', () => {
    const files = loadBatch('alpha');
    const result = diagnoseMetaBundle(files);
    const roots = rootFindings(result.findings);

    expect(roots).toHaveLength(20);
    expect(answerKey).toHaveLength(20);

    for (const expected of answerKey) {
      const fileRoots = roots.filter((f) => f.fileName === expected.file);
      expect(fileRoots, `expected one root finding for ${expected.file}`).toHaveLength(1);
      const finding = fileRoots[0]!;
      expect(finding.category).toBe(expected.category);
      expect(finding.title).toMatch(expected.titlePattern);
      expect(finding.location.line).toBe(expected.badLine);
      // Raw parser cascades stay nested on XML findings
      if (expected.category === 'xml-syntax') {
        expect(finding.supportingDiagnostics.length).toBeGreaterThan(0);
      }
    }

    // No unexpected root findings
    const answerFiles = new Set(answerKey.map((row) => row.file));
    for (const finding of roots) {
      expect(answerFiles.has(finding.fileName)).toBe(true);
    }
  });

  it('does not report false-positive broken modkit for carvariations_nomad', () => {
    const files = loadBatch('alpha');
    const result = diagnoseMetaBundle(files);
    const nomad = result.findings.filter((f) => f.fileName === 'carvariations_nomad.meta');
    const brokenModkit = nomad.filter(
      (f) => f.severity === 'error' && /broken modkit/i.test(f.title),
    );
    expect(brokenModkit).toHaveLength(0);

    // Unverifiable disclosure is allowed (info), never Missing/Broken
    const unverifiable = nomad.filter((f) => /could not be verified/i.test(f.title));
    for (const finding of unverifiable) {
      expect(finding.severity).toBe('info');
      expect(finding.explanation).toMatch(/could not be fully parsed/i);
    }
  });

  it('generates repair candidates when supported and reanalysis clears the defect', () => {
    const files = loadBatch('alpha');
    const result = diagnoseMetaBundle(files);
    const roots = rootFindings(result.findings);

    // Most defects should be candidates; COPILOT shuffle may be manual
    expect(result.stats.repairCandidates).toBeGreaterThanOrEqual(15);

    for (const expected of answerKey) {
      const finding = roots.find((f) => f.fileName === expected.file);
      expect(finding).toBeTruthy();
      if (!finding?.repair || finding.repairAvailability !== 'candidate') continue;

      expect(finding.repair.validated).toBe(true);
      if (expected.expectedFix) {
        const haystack = [
          finding.repair.after,
          finding.repair.suggestedValue ?? '',
          finding.explanation,
          finding.repair.summary,
        ].join('\n');
        expect(haystack).toContain(expected.expectedFix);
      }

      // Apply candidate and reanalyze
      const repaired = applyPreparedRepairs(files, [
        { file: finding.file, repairedContent: finding.repair.repairedContent },
      ]);
      const recheck = revalidateRepairedFiles(repaired);
      const remaining = rootFindings(recheck.findings).filter(
        (f) => f.fileName === expected.file && f.title === finding.title,
      );
      expect(remaining, `repair should clear ${expected.file}: ${finding.title}`).toHaveLength(0);

      // Applying one repair must not invent new error findings on unrelated files
      // (info-level reclassifications are OK)
      const beforeOthers = new Set(
        roots.filter((f) => f.fileName !== expected.file).map((f) => `${f.fileName}|${f.title}`),
      );
      const afterOthers = rootFindings(recheck.findings)
        .filter((f) => f.fileName !== expected.file)
        .map((f) => `${f.fileName}|${f.title}`);
      for (const key of afterOthers) {
        // New errors on other files are not allowed unless they were already present
        if (!beforeOthers.has(key)) {
          // Allow previously unverifiable relationships to become missing/broken after provider repair
          const isReclassified =
            /reference|modkit|handling|layout|model/i.test(key) &&
            (expected.file.startsWith('carcols_') ||
              expected.file.startsWith('handling_') ||
              expected.file.startsWith('vehiclelayouts_') ||
              expected.file.startsWith('vehicles_'));
          if (!isReclassified) {
            expect.fail(`repair of ${expected.file} introduced new finding: ${key}`);
          }
        }
      }
    }
  });

  it('is stable under reverse and shuffled file order', () => {
    const alpha = diagnoseMetaBundle(loadBatch('alpha'));
    const reverse = diagnoseMetaBundle(loadBatch('reverse'));
    const shuffleA = diagnoseMetaBundle(loadBatch('shuffle', 7));
    const shuffleB = diagnoseMetaBundle(loadBatch('shuffle', 99));
    const malformedFirst = diagnoseMetaBundle([
      ...loadBatch('alpha').filter((f) => !isWellFormedXml(f.content)),
      ...loadBatch('alpha').filter((f) => isWellFormedXml(f.content)),
    ]);
    const malformedLast = diagnoseMetaBundle([
      ...loadBatch('alpha').filter((f) => isWellFormedXml(f.content)),
      ...loadBatch('alpha').filter((f) => !isWellFormedXml(f.content)),
    ]);

    const baseline = stableSignature(alpha.findings);
    expect(stableSignature(reverse.findings)).toBe(baseline);
    expect(stableSignature(shuffleA.findings)).toBe(baseline);
    expect(stableSignature(shuffleB.findings)).toBe(baseline);
    expect(stableSignature(malformedFirst.findings)).toBe(baseline);
    expect(stableSignature(malformedLast.findings)).toBe(baseline);

    for (const result of [alpha, reverse, shuffleA, shuffleB, malformedFirst, malformedLast]) {
      expect(result.stats.files).toBe(20);
      expect(result.stats.filesWithFindings).toBe(20);
      expect(result.stats.rootFindings).toBe(20);
    }
  });

  it('produces identical root findings when diagnosing concurrent partitions', async () => {
    const files = loadBatch('alpha');
    // Simulate concurrent parse completion by diagnosing in random chunk order then merging inputs
    const mid = Math.floor(files.length / 2);
    const [left, right] = await Promise.all([
      Promise.resolve(files.slice(0, mid).reverse()),
      Promise.resolve(files.slice(mid).reverse()),
    ]);
    const combined = [...right, ...left];
    const result = diagnoseMetaBundle(combined);
    const baseline = diagnoseMetaBundle(files);
    expect(stableSignature(result.findings)).toBe(stableSignature(baseline.findings));
    expect(result.stats.rootFindings).toBe(20);
  });

  it('never maps unverifiable relationships to missing/broken errors for exact partial matches', () => {
    const files = loadBatch('alpha');
    const result = diagnoseMetaBundle(files);
    // carcols_nomad is malformed but declares 2300_cortex_nomad_modkit
    const falsePositives = result.findings.filter(
      (f) =>
        f.severity === 'error' &&
        /broken modkit/i.test(f.title) &&
        f.fileName === 'carvariations_nomad.meta',
    );
    expect(falsePositives).toHaveLength(0);
  });
});
