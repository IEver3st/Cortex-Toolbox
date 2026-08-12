import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAuthorizedProjectPath } from './project-path-authorization';

describe('project path authorization', () => {
  it('allows the active workspace, its real descendants, and exact recent roots', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-project-path-'));
    const active = path.join(root, 'active');
    const child = path.join(active, 'resource');
    const recent = path.join(root, 'recent');
    await mkdir(child, { recursive: true });
    await mkdir(recent, { recursive: true });

    await expect(resolveAuthorizedProjectPath(active, active, [])).resolves.toBe(active);
    await expect(resolveAuthorizedProjectPath(child, active, [])).resolves.toBe(child);
    await expect(resolveAuthorizedProjectPath(recent, null, [recent])).resolves.toBe(recent);
  });

  it('rejects arbitrary paths and symlink escapes from the active workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-project-jail-'));
    const active = path.join(root, 'active');
    const outside = path.join(root, 'outside');
    await mkdir(active, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, 'secret.txt'), 'outside');

    await expect(resolveAuthorizedProjectPath(outside, active, [])).rejects.toThrow(/only open/i);

    const linked = path.join(active, 'linked');
    try {
      await symlink(outside, linked, 'junction');
    } catch {
      return;
    }
    await expect(resolveAuthorizedProjectPath(linked, active, [])).rejects.toThrow(/only open/i);
  });
});
