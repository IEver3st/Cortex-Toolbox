import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planTextWrite } from './change-plan';
import { safeWriteText } from './safe-write';
describe('change plans and safe writes', () => {
  it('classifies modifications and backs up originals', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-'));
    await writeFile(path.join(root, 'fxmanifest.lua'), 'old');
    const plan = await planTextWrite(root, 'fxmanifest.lua', 'new');
    expect(plan.entries[0]?.kind).toBe('modify');
    const result = await safeWriteText(root, 'fxmanifest.lua', 'new');
    expect(result.backup).not.toBeNull();
  });
});
