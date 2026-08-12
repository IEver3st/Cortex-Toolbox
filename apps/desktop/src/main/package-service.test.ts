import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writePackage } from './package-service';

describe('package writer', () => {
  it('writes an inspectable ZIP and checksum without touching the source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-zip-source-'));
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'cortex-zip-output-'));
    await writeFile(path.join(root, 'fxmanifest.lua'), "fx_version 'cerulean'\n");
    const output = path.join(outputRoot, 'resource.zip');
    const files = await writePackage(
      root,
      output,
      [{ relativePath: 'fxmanifest.lua', bytes: 23, sha256: 'unused-by-writer' }],
      { signal: new AbortController().signal, stage: () => undefined, log: () => undefined },
    );
    expect(files).toEqual([output, `${output}.sha256`]);
    expect((await readFile(output)).subarray(0, 2).toString()).toBe('PK');
    expect(await readFile(path.join(root, 'fxmanifest.lua'), 'utf8')).toContain('cerulean');
  });
});
