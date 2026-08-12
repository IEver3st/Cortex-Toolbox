import { createWriteStream } from 'node:fs';
import { lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import extractZip from 'extract-zip';
import { describe, expect, it } from 'vitest';

async function createSymlinkArchive(output: string, target: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const destination = createWriteStream(output);
    const archive = new ZipArchive();
    destination.on('close', resolve);
    destination.on('error', reject);
    archive.on('error', reject);
    archive.pipe(destination);
    archive.symlink('links/escape', target);
    void archive.finalize();
  });
}

describe('patched extract-zip', () => {
  it('rejects a symlink whose target escapes the extraction directory', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'cortex-extract-zip-'));
    const archive = path.join(temporary, 'malicious.zip');
    const destination = path.join(temporary, 'destination');
    try {
      await createSymlinkArchive(archive, '../../outside-cortex-test');
      await expect(extractZip(archive, { dir: destination })).rejects.toThrow(
        /out of bound symlink/i,
      );
      await expect(lstat(path.join(destination, 'links', 'escape'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
