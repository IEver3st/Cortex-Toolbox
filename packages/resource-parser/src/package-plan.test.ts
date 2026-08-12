import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findMissingManifestReferences } from './audit';
import { parseManifest } from './manifest';
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
      missingManifestReferences: [],
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
      missingManifestReferences: [],
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
      missingManifestReferences: [],
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
      missingManifestReferences: [],
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
      missingManifestReferences: [],
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => /empty/i.test(b))).toBe(true);
  });

  it('uses authoritative manifest references to pass clean resources and block broken packages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-release-truth-'));
    await mkdir(path.join(root, 'client'), { recursive: true });
    await mkdir(path.join(root, 'html'), { recursive: true });
    await mkdir(path.join(root, 'stream'), { recursive: true });
    const manifestSource = [
      "fx_version 'cerulean'",
      "game 'gta5'",
      "client_script 'client/main.lua'",
      "ui_page 'html/index.html'",
      "files { 'html/index.html', 'stream/*.ytyp' }",
      "data_file 'DLC_ITYP_REQUEST' 'stream/*.ytyp'",
    ].join('\n');
    await writeFile(path.join(root, 'fxmanifest.lua'), manifestSource);
    await writeFile(path.join(root, 'client', 'main.lua'), 'print("safe")');
    await writeFile(path.join(root, 'html', 'index.html'), '<main>Cortex</main>');
    await writeFile(path.join(root, 'stream', 'props.ytyp'), 'asset');
    const parsed = parseManifest(manifestSource);
    const cleanEntries = await createPackagePlan(root, await listResourceFiles(root), ['**/*'], []);
    const cleanMissing = findMissingManifestReferences(cleanEntries, parsed);
    const cleanGate = evaluateReleaseGate({
      manifestName: 'fxmanifest.lua',
      entries: cleanEntries,
      hasParsedManifest: true,
      hasFxVersion: true,
      hasGame: true,
      missingManifestReferences: cleanMissing,
    });
    expect(cleanMissing).toEqual([]);
    expect(cleanGate).toEqual({ allowed: true, blockers: [] });
    expect(cleanEntries.map((entry) => entry.relativePath)).toEqual(
      expect.arrayContaining([
        'fxmanifest.lua',
        'client/main.lua',
        'html/index.html',
        'stream/props.ytyp',
      ]),
    );

    const brokenEntries = cleanEntries.filter(
      (entry) =>
        entry.relativePath === 'fxmanifest.lua' || entry.relativePath === 'client/main.lua',
    );
    const brokenMissing = findMissingManifestReferences(brokenEntries, parsed);
    const brokenGate = evaluateReleaseGate({
      manifestName: 'fxmanifest.lua',
      entries: brokenEntries,
      hasParsedManifest: true,
      hasFxVersion: true,
      hasGame: true,
      missingManifestReferences: brokenMissing,
    });
    expect(brokenMissing.map((reference) => reference.kind)).toEqual(
      expect.arrayContaining(['ui_page', 'file', 'data_file']),
    );
    expect(brokenGate.allowed).toBe(false);
    expect(brokenGate.blockers).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ui_page.*html\/index\.html/i),
        expect.stringMatching(/data_file.*stream\/\*\.ytyp/i),
      ]),
    );
  });

  it('rejects traversal and external symlink entries before hashing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-package-containment-'));
    const outside = `${root}-outside.lua`;
    await writeFile(outside, 'print("outside")');
    const traversal = path.relative(root, outside).replaceAll('\\', '/');
    await expect(
      createPackagePlan(
        root,
        [{ relativePath: traversal, name: 'outside.lua', extension: '.lua', bytes: 16 }],
        [],
        [],
      ),
    ).rejects.toThrow(/unsafe package entry|outside the workspace/i);

    const link = path.join(root, 'linked.lua');
    try {
      await symlink(outside, link, 'file');
    } catch {
      return;
    }
    await expect(
      createPackagePlan(
        root,
        [{ relativePath: 'linked.lua', name: 'linked.lua', extension: '.lua', bytes: 16 }],
        [],
        [],
      ),
    ).rejects.toThrow(/symbolic link|outside the workspace/i);
  });
});
