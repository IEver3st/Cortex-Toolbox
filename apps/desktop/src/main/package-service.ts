import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import { assertWithinRoot, type JobContext } from '@cortex/core';
import type { PackageEntry } from '@cortex/resource-parser';

export async function writePackage(
  root: string,
  output: string,
  entries: PackageEntry[],
  context: JobContext,
): Promise<string[]> {
  const ordered = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  context.stage('Preparing archive');
  context.log(`Packaging ${ordered.length} selected files.`);
  await new Promise<void>((resolve, reject) => {
    const destination = createWriteStream(output, { flags: 'wx' });
    const archive = new ZipArchive({ zlib: { level: 9 }, forceLocalTime: false });
    const abort = (): void => {
      void archive.abort();
      destination.destroy(new DOMException('Job cancelled', 'AbortError'));
    };
    context.signal.addEventListener('abort', abort, { once: true });
    destination.on('close', resolve);
    destination.on('error', reject);
    archive.on('error', reject);
    archive.pipe(destination);
    ordered.forEach((entry, index) => {
      if (context.signal.aborted) return;
      const source = assertWithinRoot(root, path.join(root, entry.relativePath));
      archive.append(createReadStream(source), {
        name: entry.relativePath,
        date: new Date('1980-01-01T00:00:00.000Z'),
        mode: 0o644,
      });
      context.stage(`Adding ${entry.relativePath}`, ordered.length ? index / ordered.length : 0);
    });
    void archive.finalize();
  }).catch(async (error: unknown) => {
    await rm(output, { force: true });
    throw error;
  });
  context.stage('Calculating checksum');
  const digest = createHash('sha256')
    .update(await readFile(output))
    .digest('hex');
  const checksum = `${output}.sha256`;
  const { writeFile } = await import('node:fs/promises');
  await writeFile(checksum, `${digest}  ${path.basename(output)}\n`, { flag: 'wx' });
  context.log(`Archive checksum: ${digest}`);
  return [output, checksum];
}
