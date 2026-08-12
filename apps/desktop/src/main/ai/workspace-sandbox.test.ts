import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertRealPathWithinRoot } from './workspace-sandbox';

describe('main-process AI realpath sandbox', () => {
  const workspace = path.resolve(path.parse(process.cwd()).root, 'workspace');

  it('allows a resolved file inside the workspace', () => {
    expect(() =>
      assertRealPathWithinRoot(workspace, path.join(workspace, 'data', 'handling.meta')),
    ).not.toThrow();
  });

  it('rejects a symlink target that resolves outside the workspace', () => {
    expect(() =>
      assertRealPathWithinRoot(workspace, path.resolve(workspace, '..', 'outside', 'id_ed25519')),
    ).toThrow(/symlink/);
  });
});
