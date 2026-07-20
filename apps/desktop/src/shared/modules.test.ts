import { describe, expect, it } from 'vitest';
import { defaultInstalledModuleIds, MODULE_CATALOG, normalizeInstalledModules } from './modules';

describe('module catalog', () => {
  it('ships workflow modules by default', () => {
    const defaults = defaultInstalledModuleIds();
    expect(defaults).toContain('index');
    expect(defaults).toContain('sentinel');
    expect(defaults).toContain('pulse');
  });

  it('normalizes unknown or empty stored lists', () => {
    expect(normalizeInstalledModules(['index', 'unknown', 'sentinel'])).toEqual([
      'index',
      'sentinel',
    ]);
    expect(normalizeInstalledModules([])).toEqual(defaultInstalledModuleIds());
    expect(normalizeInstalledModules(null)).toEqual(defaultInstalledModuleIds());
  });

  it('keeps unique module ids only', () => {
    expect(normalizeInstalledModules(['index', 'index', 'bundle'])).toEqual(['index', 'bundle']);
  });

  it('migrates legacy workflow modules and preserves the promoted texture tool', () => {
    expect(normalizeInstalledModules(['analysis', 'package', 'textures', 'vehicles'])).toEqual([
      'probe',
      'wire',
      'bundle',
      'textures',
      'chassis',
      'align',
      'pulse',
    ]);
  });

  it('migrates renamed module ids', () => {
    expect(
      normalizeInstalledModules([
        'manifest',
        'code-smith',
        'lattice',
        'packbench',
        'metaforge',
        'concord',
        'blinklab',
      ]),
    ).toEqual(['index', 'probe', 'wire', 'bundle', 'chassis', 'align', 'pulse']);
  });

  it('defines a tab kind for every catalog entry', () => {
    for (const module of MODULE_CATALOG) {
      expect(module.kind).toBe(module.id);
    }
  });
});
