import { z } from 'zod';

export const modelSummarySchema = z.object({
  source: z.string(),
  format: z.enum(['gltf', 'glb', 'ydr', 'ydd', 'yft']),
  category: z.enum(['prop', 'clothing', 'weapon', 'vehicle', 'generic']),
  meshes: z.number().int().nonnegative().nullable(),
  vertices: z.number().int().nonnegative().nullable(),
  triangles: z.number().int().nonnegative().nullable(),
  materials: z.number().int().nonnegative().nullable(),
  animations: z.number().int().nonnegative().nullable(),
  capability: z.enum(['viewport', 'metadata-only', 'external-tool']),
  limitations: z.array(z.string()),
});
export type ModelSummary = z.infer<typeof modelSummarySchema>;

const categoryFor = (source: string): ModelSummary['category'] => {
  const value = source.toLowerCase();
  if (/vehicle|car|yft/.test(value)) return 'vehicle';
  if (/weapon|gun/.test(value)) return 'weapon';
  if (/cloth|ped|ydd/.test(value)) return 'clothing';
  if (/prop|ydr/.test(value)) return 'prop';
  return 'generic';
};

export function inspectModel(source: string, bytes: Uint8Array): ModelSummary {
  const extension = source.toLowerCase().split('.').at(-1);
  if (extension === 'gltf') {
    const document = JSON.parse(new TextDecoder().decode(bytes)) as {
      meshes?: unknown[];
      materials?: unknown[];
      animations?: unknown[];
      accessors?: { count?: number; type?: string }[];
    };
    const vertices =
      document.accessors
        ?.filter((entry) => entry.type === 'VEC3')
        .reduce((sum, entry) => sum + (entry.count ?? 0), 0) ?? 0;
    return modelSummarySchema.parse({
      source,
      format: 'gltf',
      category: categoryFor(source),
      meshes: document.meshes?.length ?? 0,
      vertices,
      triangles: null,
      materials: document.materials?.length ?? 0,
      animations: document.animations?.length ?? 0,
      capability: 'metadata-only',
      limitations: [
        'No in-app 3D viewport is rendered; counts are declaration metadata only.',
        'Counts are derived from glTF declarations; triangle topology is not expanded.',
      ],
    });
  }
  if (extension === 'glb') {
    if (
      bytes.length < 12 ||
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) !==
        0x46546c67
    )
      throw new Error('Invalid GLB header.');
    return modelSummarySchema.parse({
      source,
      format: 'glb',
      category: categoryFor(source),
      meshes: null,
      vertices: null,
      triangles: null,
      materials: null,
      animations: null,
      capability: 'metadata-only',
      limitations: [
        'No in-app 3D viewport is rendered; counts are declaration metadata only.',
        'Detailed geometry counts require decoding binary glTF accessors.',
      ],
    });
  }
  if (extension === 'ydr' || extension === 'ydd' || extension === 'yft')
    return modelSummarySchema.parse({
      source,
      format: extension,
      category: categoryFor(source),
      meshes: null,
      vertices: null,
      triangles: null,
      materials: null,
      animations: null,
      capability: 'metadata-only',
      limitations: [
        'Game-native binary writes are disabled without a documented schema and redistributable fixture.',
        'Use the configured external asset workbench for conversion or editing.',
      ],
    });
  throw new Error(`Unsupported model format: .${extension ?? ''}`);
}

export const vehicleTimelineSchema = z.object({
  source: z.string(),
  entries: z.array(
    z.object({ time: z.number().nonnegative(), label: z.string(), value: z.number() }),
  ),
  exportFormat: z.literal('cortex-pulse-v1'),
});
export type VehicleTimeline = z.infer<typeof vehicleTimelineSchema>;

export function createPulseTimeline(source: string, duration = 4): VehicleTimeline {
  return vehicleTimelineSchema.parse({
    source,
    exportFormat: 'cortex-pulse-v1',
    entries: [
      { time: 0, label: 'Idle', value: 0 },
      { time: duration * 0.25, label: 'Launch', value: 0.65 },
      { time: duration * 0.65, label: 'Peak', value: 1 },
      { time: duration, label: 'Settle', value: 0.25 },
    ],
  });
}
