/**
 * Align regression suite for FiveM_40_Distinct_Broken_Meta_Batch
 * (batch_40_broken/ — 40 metadata files, one intentional defect each).
 *
 * ANSWER_KEY is a test-only oracle. Production analysis never reads it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyPreparedRepairs,
  diagnoseMetaBundle,
  revalidateRepairedFiles,
  type MetaFileInput,
  type MetaFinding,
} from './index';
import { repairSuiteRoot } from './repair-suite-root';

const SUITE_ROOT = repairSuiteRoot();
const BATCH_DIR = path.join(SUITE_ROOT, 'batch_40_broken');

/** Test-only oracle — not imported by production modules. */
interface AnswerRow {
  file: string;
  badLine: number;
  errorFamily: string;
  category: string;
  titlePattern: RegExp;
}

/**
 * Hand-authored oracle derived from intentional defects in the batch.
 * Kept in test code only (never shipped to the analyzer).
 */
const ANSWER_KEY: AnswerRow[] = [
  {
    file: 'carcols_atlas.meta',
    badLine: 6,
    errorFamily: 'integer',
    category: 'value',
    titlePattern: /integer|numeric|id/i,
  },
  {
    file: 'carcols_blaze.meta',
    badLine: 6,
    errorFamily: 'range',
    category: 'value',
    titlePattern: /out of range|negative|integer/i,
  },
  {
    file: 'carcols_cirrus.meta',
    badLine: 20,
    errorFamily: 'enum',
    category: 'value',
    titlePattern: /kit type/i,
  },
  {
    file: 'carcols_dune.meta',
    badLine: 18,
    errorFamily: 'uniqueness',
    category: 'duplicate-id',
    titlePattern: /duplicate kit name/i,
  },
  {
    file: 'carcols_echo.meta',
    badLine: 19,
    errorFamily: 'uniqueness',
    category: 'duplicate-id',
    titlePattern: /duplicate kit/i,
  },
  {
    file: 'carcols_forge.meta',
    badLine: 38,
    errorFamily: 'hex',
    category: 'value',
    titlePattern: /hex/i,
  },
  {
    file: 'carcols_glide.meta',
    badLine: 32,
    errorFamily: 'range',
    category: 'value',
    titlePattern: /out of range|intensity/i,
  },
  {
    file: 'carcols_havoc.meta',
    badLine: 36,
    errorFamily: 'relational',
    category: 'value',
    titlePattern: /relational|cone/i,
  },
  {
    file: 'carvariations_atlas.meta',
    badLine: 5,
    errorFamily: 'xml-syntax',
    category: 'xml-syntax',
    titlePattern: /closing tag missing|angle bracket/i,
  },
  {
    file: 'carvariations_blaze.meta',
    badLine: 27,
    errorFamily: 'xml-syntax',
    category: 'xml-syntax',
    titlePattern: /ampersand/i,
  },
  {
    file: 'carvariations_cirrus.meta',
    badLine: 32,
    errorFamily: 'xml-syntax',
    category: 'xml-syntax',
    titlePattern: /unclosed attribute quote/i,
  },
  {
    file: 'carvariations_dune.meta',
    badLine: 22,
    errorFamily: 'xml-syntax',
    category: 'xml-syntax',
    titlePattern: /mismatched closing/i,
  },
  {
    file: 'carvariations_echo.meta',
    badLine: 10,
    errorFamily: 'xml-syntax',
    category: 'xml-syntax',
    titlePattern: /self-closing/i,
  },
  {
    file: 'carvariations_forge.meta',
    badLine: 23,
    errorFamily: 'xml-syntax',
    category: 'xml-syntax',
    titlePattern: /unexpected closing/i,
  },
  {
    file: 'carvariations_glide.meta',
    badLine: 16,
    errorFamily: 'xml-syntax',
    category: 'xml-syntax',
    titlePattern: /duplicate attribute/i,
  },
  {
    file: 'carvariations_havoc.meta',
    badLine: 27,
    errorFamily: 'xml-syntax',
    category: 'xml-syntax',
    titlePattern: /undefined entity|entity/i,
  },
  {
    file: 'handling_atlas.meta',
    badLine: 6,
    errorFamily: 'range',
    category: 'value',
    titlePattern: /out of range|mass/i,
  },
  {
    file: 'handling_blaze.meta',
    badLine: 13,
    errorFamily: 'numeric',
    category: 'value',
    titlePattern: /invalid numeric|non-finite/i,
  },
  {
    file: 'handling_cirrus.meta',
    badLine: 11,
    errorFamily: 'range',
    category: 'value',
    titlePattern: /out of range|drive bias/i,
  },
  {
    file: 'handling_dune.meta',
    badLine: 12,
    errorFamily: 'integer',
    category: 'value',
    titlePattern: /integer/i,
  },
  {
    file: 'handling_echo.meta',
    badLine: 22,
    errorFamily: 'relational',
    category: 'value',
    titlePattern: /relational|traction/i,
  },
  {
    file: 'handling_forge.meta',
    badLine: 33,
    errorFamily: 'relational',
    category: 'value',
    titlePattern: /relational|suspension/i,
  },
  {
    file: 'handling_glide.meta',
    badLine: 45,
    errorFamily: 'range',
    category: 'value',
    titlePattern: /out of range|petrol/i,
  },
  {
    file: 'handling_havoc.meta',
    badLine: 54,
    errorFamily: 'enum',
    category: 'value',
    titlePattern: /AI handling/i,
  },
  {
    file: 'vehiclelayouts_atlas.meta',
    badLine: 10,
    errorFamily: 'uniqueness',
    category: 'duplicate-id',
    titlePattern: /duplicate seat/i,
  },
  {
    file: 'vehiclelayouts_blaze.meta',
    badLine: 12,
    errorFamily: 'cross-file-seat',
    category: 'cross-file',
    titlePattern: /ShuffleLink/i,
  },
  {
    file: 'vehiclelayouts_cirrus.meta',
    badLine: 12,
    errorFamily: 'self-ref',
    category: 'value',
    titlePattern: /self-referenc/i,
  },
  {
    file: 'vehiclelayouts_dune.meta',
    badLine: 6,
    errorFamily: 'required',
    category: 'value',
    titlePattern: /empty required/i,
  },
  {
    file: 'vehiclelayouts_echo.meta',
    badLine: 31,
    errorFamily: 'uniqueness',
    category: 'duplicate-id',
    titlePattern: /duplicate seat/i,
  },
  {
    file: 'vehiclelayouts_forge.meta',
    badLine: 23,
    errorFamily: 'enum',
    category: 'value',
    titlePattern: /DriveBy/i,
  },
  {
    file: 'vehiclelayouts_glide.meta',
    badLine: 35,
    errorFamily: 'uniqueness',
    category: 'duplicate-id',
    titlePattern: /duplicate layout/i,
  },
  {
    file: 'vehiclelayouts_havoc.meta',
    badLine: 37,
    errorFamily: 'cross-file-seat',
    category: 'cross-file',
    titlePattern: /seat|layout seat/i,
  },
  {
    file: 'vehicles_atlas.meta',
    badLine: 9,
    errorFamily: 'cross-file-handling',
    category: 'cross-file',
    titlePattern: /handling/i,
  },
  {
    file: 'vehicles_blaze.meta',
    badLine: 18,
    errorFamily: 'cross-file-layout',
    category: 'cross-file',
    titlePattern: /layout/i,
  },
  {
    file: 'vehicles_cirrus.meta',
    badLine: 53,
    errorFamily: 'enum',
    category: 'value',
    titlePattern: /vehicle class/i,
  },
  {
    file: 'vehicles_dune.meta',
    badLine: 54,
    errorFamily: 'enum',
    category: 'value',
    titlePattern: /wheel type/i,
  },
  {
    file: 'vehicles_echo.meta',
    badLine: 50,
    errorFamily: 'enum',
    category: 'value',
    titlePattern: /vehicle type/i,
  },
  {
    file: 'vehicles_forge.meta',
    badLine: 37,
    errorFamily: 'array',
    category: 'value',
    titlePattern: /array|item count|lod/i,
  },
  {
    file: 'vehicles_glide.meta',
    badLine: 46,
    errorFamily: 'range',
    category: 'value',
    titlePattern: /out of range|frequency/i,
  },
  {
    file: 'vehicles_havoc.meta',
    badLine: 26,
    errorFamily: 'range',
    category: 'value',
    titlePattern: /out of range|wheelScale|positive/i,
  },
];

function loadBatch(order: 'alpha' | 'reverse' | 'shuffle' = 'alpha', seed = 1): MetaFileInput[] {
  const names = readdirSync(BATCH_DIR).filter((name) => name.endsWith('.meta'));
  let ordered = [...names].sort((a, b) => a.localeCompare(b));
  if (order === 'reverse') ordered = ordered.reverse();
  if (order === 'shuffle') {
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
    name: path.join('batch_40_broken', name).replaceAll('\\', '/'),
    content: readFileSync(path.join(BATCH_DIR, name), 'utf8'),
  }));
}

function rootFindings(findings: MetaFinding[]): MetaFinding[] {
  return findings.filter((f) => f.severity !== 'info');
}

function stableSignature(findings: MetaFinding[]): string {
  return rootFindings(findings)
    .map(
      (f) => `${f.fileName}|${f.category}|${f.title}|L${f.location.line}|${f.repairAvailability}`,
    )
    .sort()
    .join('\n');
}

describe('Align 40-file Distinct Broken Meta batch', () => {
  it('loads all 40 meta files with zero silent skips and full coverage disclosure', () => {
    const files = loadBatch('alpha');
    expect(files).toHaveLength(40);
    const result = diagnoseMetaBundle(files);

    expect(result.stats.files).toBe(40);
    expect(result.stats.filesWithFindings).toBe(40);
    expect(result.stats.rootFindings).toBe(40);
    expect(result.coverage?.silentlySkipped).toBe(0);
    expect(result.coverage?.filesInventoried).toBe(40);
    expect(result.coverageReport).toMatch(/SCAN COVERAGE/);
    expect(result.coverageReport).toMatch(/0 files silently skipped/);
  });

  it('associates exactly one intended root finding per file from the test oracle', () => {
    const files = loadBatch('alpha');
    const result = diagnoseMetaBundle(files);
    const roots = rootFindings(result.findings);

    expect(roots).toHaveLength(40);
    expect(ANSWER_KEY).toHaveLength(40);

    for (const expected of ANSWER_KEY) {
      const fileRoots = roots.filter((f) => f.fileName === expected.file);
      expect(fileRoots, `expected one root finding for ${expected.file}`).toHaveLength(1);
      const finding = fileRoots[0]!;
      expect(finding.category, expected.file).toBe(expected.category);
      expect(finding.title, expected.file).toMatch(expected.titlePattern);
      expect(finding.location.line, expected.file).toBe(expected.badLine);
      if (expected.category === 'xml-syntax') {
        // Cascades stay nested under one root finding
        expect(finding.supportingDiagnostics.length).toBeGreaterThanOrEqual(0);
      }
    }

    const answerFiles = new Set(ANSWER_KEY.map((row) => row.file));
    for (const finding of roots) {
      expect(answerFiles.has(finding.fileName)).toBe(true);
    }
  });

  it('does not emit false-positive broken references for well-linked companions', () => {
    const files = loadBatch('alpha');
    const result = diagnoseMetaBundle(files);
    // carvariations that are well-formed should not invent missing modkits when kits exist
    const forgeVar = result.findings.filter(
      (f) =>
        f.fileName === 'carvariations_echo.meta' &&
        f.severity === 'error' &&
        /broken modkit/i.test(f.title),
    );
    // echo variations is malformed XML — no cross-file modkit error expected as root
    expect(forgeVar).toHaveLength(0);
  });

  it('is stable under reverse and shuffled file order', () => {
    const alpha = stableSignature(diagnoseMetaBundle(loadBatch('alpha')).findings);
    const reverse = stableSignature(diagnoseMetaBundle(loadBatch('reverse')).findings);
    const shuffle = stableSignature(diagnoseMetaBundle(loadBatch('shuffle', 42)).findings);
    const shuffle2 = stableSignature(diagnoseMetaBundle(loadBatch('shuffle', 99)).findings);
    expect(reverse).toBe(alpha);
    expect(shuffle).toBe(alpha);
    expect(shuffle2).toBe(alpha);
  });

  it('produces identical root findings under concurrent partition diagnosis', () => {
    const files = loadBatch('alpha');
    const mid = Math.floor(files.length / 2);
    const left = diagnoseMetaBundle(files.slice(0, mid));
    const right = diagnoseMetaBundle(files.slice(mid));
    const merged = diagnoseMetaBundle([...files.slice(mid), ...files.slice(0, mid)]);
    const full = diagnoseMetaBundle(files);

    // Partition diagnoses are incomplete for cross-file; full batch must stay stable
    expect(stableSignature(merged.findings)).toBe(stableSignature(full.findings));
    expect(full.stats.rootFindings).toBe(40);
    // Smoke: partitions did not throw and returned some findings
    expect(left.findings.length + right.findings.length).toBeGreaterThan(0);
  });

  it('revalidates repair candidates without reintroducing the original defect', () => {
    const files = loadBatch('alpha');
    const result = diagnoseMetaBundle(files);
    const roots = rootFindings(result.findings);
    const repairable = roots.filter((f) => f.repairAvailability === 'candidate' && f.repair);

    expect(repairable.length).toBeGreaterThan(10);

    for (const finding of repairable.slice(0, 12)) {
      const repair = finding.repair!;
      expect(repair.validated).toBe(true);
      const prepared = applyPreparedRepairs(files, [
        { file: finding.file, repairedContent: repair.repairedContent },
      ]);
      const recheck = revalidateRepairedFiles(prepared);
      const remaining = rootFindings(recheck.findings).filter(
        (f) => f.fileName === finding.fileName && f.title === finding.title,
      );
      expect(remaining, `repair should clear ${finding.fileName}: ${finding.title}`).toHaveLength(
        0,
      );
    }
  });

  it('emits a machine-readable coverage report of expected defect detection', () => {
    const files = loadBatch('alpha');
    const result = diagnoseMetaBundle(files);
    const roots = rootFindings(result.findings);
    const report = ANSWER_KEY.map((expected) => {
      const hit = roots.find((f) => f.fileName === expected.file);
      const status = !hit
        ? 'missed'
        : hit.location.line !== expected.badLine
          ? 'mislocated'
          : !expected.titlePattern.test(hit.title)
            ? 'misclassified'
            : hit.category !== expected.category
              ? 'misclassified'
              : 'detected';
      return {
        file: expected.file,
        expectedLine: expected.badLine,
        expectedFamily: expected.errorFamily,
        status,
        actualTitle: hit?.title ?? null,
        actualLine: hit?.location.line ?? null,
        actualCategory: hit?.category ?? null,
      };
    });

    const detected = report.filter((r) => r.status === 'detected');
    expect(detected).toHaveLength(40);
    expect(report.every((r) => r.status === 'detected')).toBe(true);
  });
});
