import { describe, expect, it } from 'vitest';
import { applyTextWriteTransaction } from './write-transaction';

const entries = [
  {
    root: 'C:\\workspace',
    relativePath: 'handling.meta',
    source: 'after handling',
    originalSource: 'before handling',
  },
  {
    root: 'C:\\workspace',
    relativePath: 'vehicles.meta',
    source: 'after vehicles',
    originalSource: 'before vehicles',
  },
];

describe('AI write transaction', () => {
  it('applies every preflighted file in order', async () => {
    const disk = new Map(entries.map((entry) => [entry.relativePath, entry.originalSource]));
    const result = await applyTextWriteTransaction(
      entries,
      (_root, relativePath, source) => {
        disk.set(relativePath, source);
        return Promise.resolve(relativePath);
      },
      () => Promise.resolve(),
    );
    expect(result).toEqual(['handling.meta', 'vehicles.meta']);
    expect(disk.get('handling.meta')).toBe('after handling');
    expect(disk.get('vehicles.meta')).toBe('after vehicles');
  });

  it('rolls already-applied files back after a partial failure', async () => {
    const disk = new Map(entries.map((entry) => [entry.relativePath, entry.originalSource]));
    let failed = false;
    await expect(
      applyTextWriteTransaction(
        entries,
        (_root, relativePath, source) => {
          if (relativePath === 'vehicles.meta' && !failed) {
            failed = true;
            throw new Error('disk full');
          }
          disk.set(relativePath, source);
          return Promise.resolve(relativePath);
        },
        () => Promise.resolve(),
      ),
    ).rejects.toThrow('disk full');
    expect(disk.get('handling.meta')).toBe('before handling');
    expect(disk.get('vehicles.meta')).toBe('before vehicles');
  });

  it('reports rollback failures with backup recovery guidance', async () => {
    let call = 0;
    await expect(
      applyTextWriteTransaction(
        entries,
        () => {
          call += 1;
          if (call > 1) throw new Error('write failed');
          return Promise.resolve(true);
        },
        () => Promise.resolve(),
      ),
    ).rejects.toThrow('.cortex backup');
  });

  it('removes a newly created file when a later write fails', async () => {
    const disk = new Map<string, string>();
    const mixed = [
      {
        root: 'C:\\workspace',
        relativePath: 'handling.meta',
        source: 'after handling',
        originalSource: null,
      },
      {
        root: 'C:\\workspace',
        relativePath: 'vehicles.meta',
        source: 'after vehicles',
        originalSource: 'before vehicles',
      },
    ];

    await expect(
      applyTextWriteTransaction(
        mixed,
        (_root, relativePath, source) => {
          if (relativePath === 'vehicles.meta') throw new Error('disk full');
          disk.set(relativePath, source);
          return Promise.resolve(relativePath);
        },
        (_root, relativePath) => {
          disk.delete(relativePath);
          return Promise.resolve();
        },
      ),
    ).rejects.toThrow('disk full');
    expect(disk.has('handling.meta')).toBe(false);
  });
});
