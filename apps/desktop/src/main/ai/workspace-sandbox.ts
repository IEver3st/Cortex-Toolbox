import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { assertAiReadablePath } from '@cortex/ai';

export function assertRealPathWithinRoot(rootRealPath: string, targetRealPath: string): void {
  const relative = path.relative(rootRealPath, targetRealPath);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new Error(
    'AI file access cannot escape the active workspace, including through a symlink.',
  );
}

export async function resolveAiWorkspaceFile(
  root: string,
  input: string,
  options: { allowSensitive?: boolean; mustExist?: boolean } = {},
): Promise<{ relativePath: string; target: string }> {
  const relativePath = assertAiReadablePath(input, options.allowSensitive ?? false);
  const rootRealPath = await realpath(root);
  const lexicalTarget = path.resolve(rootRealPath, ...relativePath.split('/'));
  assertRealPathWithinRoot(rootRealPath, lexicalTarget);

  try {
    const targetRealPath = await realpath(lexicalTarget);
    assertRealPathWithinRoot(rootRealPath, targetRealPath);
    const info = await stat(targetRealPath);
    if (!info.isFile()) throw new Error('The requested AI workspace path is not a file.');
    return { relativePath, target: targetRealPath };
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    if (!missing || options.mustExist !== false) throw error;
    const parentRealPath = await realpath(path.dirname(lexicalTarget));
    assertRealPathWithinRoot(rootRealPath, parentRealPath);
    return { relativePath, target: lexicalTarget };
  }
}
