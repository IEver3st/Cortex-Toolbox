import { describe, expect, it } from 'vitest';
import { assertRealPathWithinRoot } from './workspace-sandbox';

describe('main-process AI realpath sandbox', () => {
  it('allows a resolved file inside the workspace', () => {
    expect(() =>
      assertRealPathWithinRoot('C:\\workspace', 'C:\\workspace\\data\\handling.meta'),
    ).not.toThrow();
  });

  it('rejects a symlink target that resolves outside the workspace', () => {
    expect(() =>
      assertRealPathWithinRoot('C:\\workspace', 'C:\\Users\\User\\.ssh\\id_ed25519'),
    ).toThrow(/symlink/);
  });
});
