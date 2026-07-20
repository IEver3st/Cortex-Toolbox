import path from 'node:path';
import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises';
import lockfile from 'proper-lockfile';
import { assertWithinRoot, normalizeRelative } from './paths';

export interface SafeWriteResult {
  target: string;
  backup: string | null;
  bytes: number;
}

export async function safeWriteText(
  root: string,
  relativePath: string,
  content: string,
): Promise<SafeWriteResult> {
  const relative = normalizeRelative(relativePath);
  const target = assertWithinRoot(root, path.join(root, relative));
  await mkdir(path.dirname(target), { recursive: true });
  const lockTarget = path.join(root, '.cortex-write.lock');
  await writeFile(lockTarget, '', { flag: 'a' });
  const release = await lockfile.lock(lockTarget, { retries: { retries: 4, minTimeout: 50 } });
  let backup: string | null;
  try {
    try {
      const stamp = new Date().toISOString().replaceAll(':', '-');
      backup = assertWithinRoot(root, path.join(root, '.cortex', 'backups', stamp, relative));
      await mkdir(path.dirname(backup), { recursive: true });
      await copyFile(target, backup);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      backup = null;
    }
    const temporary = `${target}.cortex-${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
    return { target, backup, bytes: Buffer.byteLength(content, 'utf8') };
  } finally {
    await release();
  }
}
