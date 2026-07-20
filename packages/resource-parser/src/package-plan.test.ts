import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPackagePlan, evaluateReleaseGate } from './package-plan';
import { listResourceFiles } from './tree';

describe('package plan', () => {
  it('expands includes, applies excludes, and hashes exact content', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-package-'));
    await mkdir(path.join(root, 'client'));
    await writeFile(path.join(root, 'client', 'main.lua'), 'print("safe")');
    await writeFile(path.join(root, '.env'), 'TOKEN=secret');
    const plan = await createPackagePlan(root, await listResourceFiles(root), ['**/*'], ['.env']);
    expect(plan.map((entry) => entry.relativePath)).toEqual(['client/main.lua']);
    expect(plan[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('blocks case-folded archive collisions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-collision-'));
    const files = [
      { relativePath: 'CAR.lua', name: 'CAR.lua', extension: '.lua', bytes: 1 },
      { relativePath: 'car.lua', name: 'car.lua', extension: '.lua', bytes: 1 },
    ];
    await expect(createPackagePlan(root, files, ['**/*'], [])).rejects.toThrow(/Archive collision/);
  });
});

describe('evaluateReleaseGate', () => {
  it('blocks missing manifest', () => {
    const result = evaluateReleaseGate({
      manifestName: null,
      entries: [{ relativePath: 'client/main.lua', bytes: 10, sha256: 'a'.repeat(64) }],
      hasParsedManifest: false,
      hasFxVersion: false,
      hasGame: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => /manifest/i.test(b))).toBe(true);
  });

  it('blocks metadata-only packages', () => {
    const result = evaluateReleaseGate({
      manifestName: null,
      entries: [{ relativePath: 'cortex.project.json', bytes: 40, sha256: 'b'.repeat(64) }],
      hasParsedManifest: false,
      hasFxVersion: false,
      hasGame: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => /metadata|payload|manifest/i.test(b))).toBe(true);
  });

  it('allows a valid resource with fxmanifest and client script', () => {
    const result = evaluateReleaseGate({
      manifestName: 'fxmanifest.lua',
      entries: [
        { relativePath: 'fxmanifest.lua', bytes: 80, sha256: 'c'.repeat(64) },
        { relativePath: 'client/main.lua', bytes: 20, sha256: 'd'.repeat(64) },
      ],
      hasParsedManifest: true,
      hasFxVersion: true,
      hasGame: true,
    });
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('blocks when parsed manifest is missing fx_version or game', () => {
    const result = evaluateReleaseGate({
      manifestName: 'fxmanifest.lua',
      entries: [
        { relativePath: 'fxmanifest.lua', bytes: 80, sha256: 'c'.repeat(64) },
        { relativePath: 'client/main.lua', bytes: 20, sha256: 'd'.repeat(64) },
      ],
      hasParsedManifest: true,
      hasFxVersion: false,
      hasGame: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => /fx_version/i.test(b))).toBe(true);
    expect(result.blockers.some((b) => /game/i.test(b))).toBe(true);
  });

  it('blocks empty entries', () => {
    const result = evaluateReleaseGate({
      manifestName: 'fxmanifest.lua',
      entries: [],
      hasParsedManifest: true,
      hasFxVersion: true,
      hasGame: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => /empty/i.test(b))).toBe(true);
  });
});
