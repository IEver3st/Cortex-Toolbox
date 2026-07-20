import path from 'node:path';
import fg from 'fast-glob';
import { z } from 'zod';

export const resourceFileSchema = z.object({
  relativePath: z.string(),
  name: z.string(),
  extension: z.string(),
  bytes: z.number().int().nonnegative(),
});
export type ResourceFile = z.infer<typeof resourceFileSchema>;

export function isInternalResourcePath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\/+/, '');
  if (normalized === '.cortex-write.lock' || normalized.endsWith('/.cortex-write.lock'))
    return true;
  const segments = normalized.split('/').filter(Boolean);
  return segments.some((segment) => segment === '.cortex');
}

export async function listResourceFiles(root: string): Promise<ResourceFile[]> {
  const entries = await fg(['**/*'], {
    cwd: root,
    onlyFiles: true,
    dot: true,
    stats: true,
    followSymbolicLinks: false,
    ignore: ['**/node_modules/**', '**/.git/**', '**/.cortex/**', '**/dist/**', '**/build/**'],
  });
  return entries
    .map((entry) => ({
      relativePath: entry.path.replaceAll('\\', '/'),
      name: path.basename(entry.path),
      extension: path.extname(entry.path).toLowerCase(),
      bytes: entry.stats?.size ?? 0,
    }))
    .filter((file) => !isInternalResourcePath(file.relativePath))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
