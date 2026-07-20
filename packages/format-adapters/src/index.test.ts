import { describe, expect, it } from 'vitest';
import { adapterSchema, canWrite } from './index';
describe('adapter capabilities', () => {
  it('never enables unavailable writes', () => {
    const adapter = adapterSchema.parse({
      id: 'gltf',
      name: 'glTF',
      version: '1',
      license: 'MIT',
      supportedExtensions: ['.gltf'],
      platforms: ['win32'],
      read: 'fully-supported',
      write: 'unavailable',
      preview: 'fully-supported',
      metadata: 'read-only',
      externalExecutableRequired: false,
      lossless: true,
      knownLimitations: [],
    });
    expect(canWrite(adapter)).toBe(false);
  });
});
