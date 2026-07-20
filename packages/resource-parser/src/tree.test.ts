import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isInternalResourcePath, listResourceFiles } from './tree';

describe('isInternalResourcePath', () => {
  it('detects .cortex directory segments', () => {
    expect(isInternalResourcePath('.cortex/backups/a.lua')).toBe(true);
    expect(isInternalResourcePath('.cortex/cache/x')).toBe(true);
    expect(isInternalResourcePath('nested/.cortex/plugins/p.json')).toBe(true);
    expect(isInternalResourcePath('.cortex')).toBe(true);
  });
  it('detects write lock files', () => {
    expect(isInternalResourcePath('.cortex-write.lock')).toBe(true);
    expect(isInternalResourcePath('sub/.cortex-write.lock')).toBe(true);
  });
  it('allows ordinary resource paths', () => {
    expect(isInternalResourcePath('fxmanifest.lua')).toBe(false);
    expect(isInternalResourcePath('client/main.lua')).toBe(false);
    expect(isInternalResourcePath('cortex.project.json')).toBe(false);
    expect(isInternalResourcePath('.env')).toBe(false);
  });
});

describe('listResourceFiles', () => {
  it('excludes Cortex internals from inventory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-tree-'));
    await mkdir(path.join(root, '.cortex', 'backups'), { recursive: true });
    await mkdir(path.join(root, 'client'));
    await writeFile(path.join(root, 'client', 'main.lua'), 'print(1)');
    await writeFile(path.join(root, 'fxmanifest.lua'), "fx_version 'cerulean'");
    await writeFile(path.join(root, '.cortex-write.lock'), 'lock');
    await writeFile(path.join(root, '.cortex', 'backups', 'fxmanifest.lua'), 'old');
    await writeFile(path.join(root, 'cortex.project.json'), '{}');

    const files = await listResourceFiles(root);
    const paths = files.map((file) => file.relativePath);

    expect(paths).toContain('client/main.lua');
    expect(paths).toContain('fxmanifest.lua');
    expect(paths).toContain('cortex.project.json');
    expect(paths.some((p) => p.includes('.cortex'))).toBe(false);
    expect(paths).not.toContain('.cortex-write.lock');
  });
});
