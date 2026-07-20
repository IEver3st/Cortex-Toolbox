import { z } from 'zod';
export const capabilityStatusSchema = z.enum([
  'fully-supported',
  'read-only',
  'preview-only',
  'metadata-only',
  'experimental',
  'external-tool-required',
  'unavailable',
]);
export const adapterSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    license: z.string(),
    supportedExtensions: z.array(z.string()),
    platforms: z.array(z.enum(['win32', 'darwin', 'linux'])),
    read: capabilityStatusSchema,
    write: capabilityStatusSchema,
    preview: capabilityStatusSchema,
    metadata: capabilityStatusSchema,
    externalExecutableRequired: z.boolean(),
    lossless: z.boolean(),
    knownLimitations: z.array(z.string()),
  })
  .strict();
export type FormatAdapter = z.infer<typeof adapterSchema>;
export function canWrite(adapter: FormatAdapter): boolean {
  return (
    adapter.write === 'fully-supported' ||
    adapter.write === 'experimental' ||
    adapter.write === 'external-tool-required'
  );
}

export const builtInAdapters: FormatAdapter[] = [
  {
    id: 'raster-sharp',
    name: 'Cortex Raster Pipeline',
    version: '1',
    license: 'Apache-2.0',
    supportedExtensions: ['.png', '.jpg', '.jpeg', '.webp'],
    platforms: ['win32', 'darwin', 'linux'],
    read: 'fully-supported',
    write: 'fully-supported',
    preview: 'fully-supported',
    metadata: 'fully-supported',
    externalExecutableRequired: false,
    lossless: false,
    knownLimitations: ['JPEG output is lossy.', 'Original files are never overwritten.'],
  },
  {
    id: 'psd-metadata',
    name: 'PSD Header Inspector',
    version: '1',
    license: 'GPL-3.0-or-later',
    supportedExtensions: ['.psd'],
    platforms: ['win32', 'darwin', 'linux'],
    read: 'metadata-only',
    write: 'unavailable',
    preview: 'unavailable',
    metadata: 'fully-supported',
    externalExecutableRequired: false,
    lossless: true,
    knownLimitations: ['Layers, effects, and color profiles are not decoded.'],
  },
  {
    id: 'tga-metadata',
    name: 'TGA Header Inspector',
    version: '1',
    license: 'GPL-3.0-or-later',
    supportedExtensions: ['.tga'],
    platforms: ['win32', 'darwin', 'linux'],
    read: 'metadata-only',
    write: 'unavailable',
    preview: 'external-tool-required',
    metadata: 'fully-supported',
    externalExecutableRequired: false,
    lossless: true,
    knownLimitations: ['Pixel payload and extension area are not decoded.'],
  },
  {
    id: 'rage-model-handoff',
    name: 'RAGE Asset Workbench Handoff',
    version: '1',
    license: 'GPL-3.0-or-later',
    supportedExtensions: ['.ydr', '.ydd', '.yft', '.ytd'],
    platforms: ['win32'],
    read: 'metadata-only',
    write: 'external-tool-required',
    preview: 'external-tool-required',
    metadata: 'metadata-only',
    externalExecutableRequired: true,
    lossless: false,
    knownLimitations: ['Cortex does not write undocumented game-native binary formats.'],
  },
];

export function adapterFor(
  extension: string,
  platform: NodeJS.Platform = process.platform,
): FormatAdapter | null {
  const normalized = extension.startsWith('.')
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
  return (
    builtInAdapters.find(
      (adapter) =>
        adapter.supportedExtensions.includes(normalized) &&
        adapter.platforms.includes(platform as 'win32' | 'darwin' | 'linux'),
    ) ?? null
  );
}
