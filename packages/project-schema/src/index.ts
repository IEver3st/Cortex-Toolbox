import { z } from 'zod';

export const projectTypeSchema = z.enum([
  'vehicle',
  'clothing',
  'prop',
  'weapon',
  'script',
  'mixed',
]);
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    name: z.string().trim().min(1).max(120),
    type: projectTypeSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    sourceRoots: z.array(z.string()),
    outputDirectory: z.string(),
    modules: z.record(z.string(), z.unknown()),
    preferences: z.record(z.string(), z.unknown()),
    externalTools: z.record(z.string(), z.unknown()),
  })
  .loose();
export type CortexProject = z.infer<typeof projectSchema>;

const legacySchema = z
  .object({
    schemaVersion: z.literal(0).optional(),
    name: z.string().min(1),
    type: projectTypeSchema.optional(),
    createdAt: z.string().optional(),
    sourceRoots: z.array(z.string()).optional(),
    outputDirectory: z.string().optional(),
  })
  .loose();

export function createProject(
  name: string,
  type: z.infer<typeof projectTypeSchema>,
  now = new Date(),
): CortexProject {
  const timestamp = now.toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    type,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceRoots: ['.'],
    outputDirectory: 'dist',
    modules: {},
    preferences: {},
    externalTools: {},
  };
}

export function migrateProject(input: unknown): CortexProject {
  const current = projectSchema.safeParse(input);
  if (current.success) return current.data;
  const legacy = legacySchema.parse(input);
  const timestamp =
    legacy.createdAt && !Number.isNaN(Date.parse(legacy.createdAt))
      ? new Date(legacy.createdAt).toISOString()
      : new Date().toISOString();
  const known = createProject(legacy.name, legacy.type ?? 'mixed', new Date(timestamp));
  return projectSchema.parse({
    ...legacy,
    ...known,
    sourceRoots: legacy.sourceRoots ?? ['.'],
    outputDirectory: legacy.outputDirectory ?? 'dist',
  });
}
