import { z } from 'zod';

export * from './dds';

export const imageOperationPlanSchema = z
  .object({
    input: z.string(),
    output: z.string(),
    overwriteOriginal: z.literal(false).default(false),
    resize: z
      .object({
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        fit: z.enum(['contain', 'cover', 'fill', 'inside', 'outside']),
      })
      .optional(),
    flipGreenChannel: z.boolean().default(false),
    extractChannel: z.enum(['red', 'green', 'blue', 'alpha']).optional(),
    chevron: z
      .object({
        intensity: z.number().min(0).max(1),
        scale: z.number().min(0.1).max(8),
        angle: z.number().min(-180).max(180),
      })
      .optional(),
  })
  .strict();
export type ImageOperationPlan = z.infer<typeof imageOperationPlanSchema>;

export const imageAssetSchema = z.object({
  relativePath: z.string(),
  format: z.enum(['png', 'jpeg', 'webp', 'dds', 'tga', 'psd', 'ytd', 'unknown']),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  channels: z.number().int().min(1).max(4).nullable(),
  bytes: z.number().int().nonnegative(),
  capability: z.enum(['editable', 'inspect-only', 'external-tool']),
  limitations: z.array(z.string()),
});
export type ImageAsset = z.infer<typeof imageAssetSchema>;

export function inspectImageHeader(
  relativePath: string,
  buffer: Uint8Array,
  totalBytes = buffer.byteLength,
): ImageAsset {
  const extension = relativePath.toLowerCase().split('.').at(-1) ?? '';
  let format: ImageAsset['format'] = [
    'png',
    'jpg',
    'jpeg',
    'webp',
    'dds',
    'tga',
    'psd',
    'ytd',
  ].includes(extension)
    ? extension === 'jpg'
      ? 'jpeg'
      : (extension as ImageAsset['format'])
    : 'unknown';
  let width: number | null = null;
  let height: number | null = null;
  let channels: number | null = null;
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    format = 'png';
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    width = view.getUint32(16);
    height = view.getUint32(20);
    channels = buffer[25] === 6 || buffer[25] === 4 ? 4 : buffer[25] === 2 ? 3 : 1;
  } else if (buffer.length >= 26 && extension === 'tga') {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    width = view.getUint16(12, true);
    height = view.getUint16(14, true);
    channels = Math.max(1, Math.round((buffer[16] ?? 0) / 8));
  } else if (
    buffer.length >= 26 &&
    buffer[0] === 0x38 &&
    buffer[1] === 0x42 &&
    buffer[2] === 0x50 &&
    buffer[3] === 0x53
  ) {
    format = 'psd';
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    channels = view.getUint16(12);
    height = view.getUint32(14);
    width = view.getUint32(18);
  } else if (
    buffer.length >= 20 &&
    buffer[0] === 0x44 &&
    buffer[1] === 0x44 &&
    buffer[2] === 0x53
  ) {
    format = 'dds';
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    height = view.getUint32(12, true);
    width = view.getUint32(16, true);
  }
  const editable = ['png', 'jpeg', 'webp', 'dds'].includes(format);
  return imageAssetSchema.parse({
    relativePath,
    format,
    width: width && width > 0 ? width : null,
    height: height && height > 0 ? height : null,
    channels,
    bytes: totalBytes,
    capability: editable
      ? 'editable'
      : format === 'psd' || format === 'tga'
        ? 'inspect-only'
        : 'external-tool',
    limitations: editable
      ? []
      : [
          'Cortex preserves this source and exposes metadata only; layered or game-native binary writes are disabled.',
        ],
  });
}

export function validateImagePlan(plan: unknown): ImageOperationPlan {
  const parsed = imageOperationPlanSchema.parse(plan);
  if (parsed.input === parsed.output)
    throw new Error('Texture output must be a new file; original files are never overwritten.');
  if (!/\.(png|jpe?g|webp|dds)$/i.test(parsed.output))
    throw new Error(
      'The built-in pipeline writes PNG, JPEG, WebP, or uncompressed RGBA DDS output.',
    );
  return parsed;
}
