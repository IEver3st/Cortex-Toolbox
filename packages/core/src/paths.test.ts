import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveEntryDestination, assertWithinRoot, normalizeRelative } from './paths';

describe('path safety', () => {
  it('allows descendants', () =>
    expect(assertWithinRoot('C:/work', 'C:/work/a.txt')).toContain(`work${path.sep}a.txt`));
  it('rejects traversal', () =>
    expect(() => assertWithinRoot('C:/work', 'C:/outside.txt')).toThrow(/outside/));
  it('rejects archive traversal', () =>
    expect(() => archiveEntryDestination('C:/output', '../evil.txt')).toThrow(/Unsafe/));
  it('normalizes separators', () =>
    expect(normalizeRelative('client\\main.lua')).toBe('client/main.lua'));
});
