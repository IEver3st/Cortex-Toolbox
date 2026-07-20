import { createHash } from 'node:crypto';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { assertWithinRoot, normalizeRelative } from './paths';

export const changeKindSchema = z.enum([
  'create',
  'modify',
  'rename',
  'move',
  'delete',
  'unchanged',
]);
export const changeEntrySchema = z.object({
  id: z.string(),
  kind: changeKindSchema,
  relativePath: z.string(),
  beforeBytes: z.number().int().nonnegative().nullable(),
  afterBytes: z.number().int().nonnegative().nullable(),
  beforeHash: z.string().nullable(),
  afterHash: z.string().nullable(),
  selected: z.boolean(),
});
export const changePlanSchema = z.object({
  id: z.string(),
  root: z.string(),
  createdAt: z.string(),
  entries: z.array(changeEntrySchema).min(1),
});
export type ChangePlan = z.infer<typeof changePlanSchema>;

const hash = (value: Buffer): string => createHash('sha256').update(value).digest('hex');

export async function planTextWrite(
  root: string,
  relativePath: string,
  content: string,
): Promise<ChangePlan> {
  const target = assertWithinRoot(root, path.join(root, normalizeRelative(relativePath)));
  let before: Buffer | null = null;
  try {
    await stat(target);
    before = await readFile(target);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  const after = Buffer.from(content, 'utf8');
  const beforeHash = before ? hash(before) : null;
  const afterHash = hash(after);
  const kind = before === null ? 'create' : beforeHash === afterHash ? 'unchanged' : 'modify';
  return {
    id: crypto.randomUUID(),
    root,
    createdAt: new Date().toISOString(),
    entries: [
      {
        id: crypto.randomUUID(),
        kind,
        relativePath,
        beforeBytes: before?.byteLength ?? null,
        afterBytes: after.byteLength,
        beforeHash,
        afterHash,
        selected: kind !== 'unchanged',
      },
    ],
  };
}
