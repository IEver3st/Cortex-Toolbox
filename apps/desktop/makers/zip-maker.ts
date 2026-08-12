import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { MakerBase, type MakerOptions } from '@electron-forge/maker-base';
import type { ForgePlatform } from '@electron-forge/shared-types';
import { ZipArchive } from 'archiver';
import { z } from 'zod';

export class CortexZipMaker extends MakerBase<Record<string, never>> {
  name = 'cortex-zip';
  defaultPlatforms: ForgePlatform[] = ['win32', 'darwin', 'linux'];

  override isSupportedOnCurrentPlatform(): boolean {
    return true;
  }

  override async make(options: MakerOptions): Promise<string[]> {
    const version = z.object({ version: z.string().min(1) }).parse(options.packageJSON).version;
    const output = path.resolve(
      options.makeDir,
      'zip',
      options.targetPlatform,
      options.targetArch,
      `${options.appName}-${version}-${options.targetPlatform}-${options.targetArch}.zip`,
    );
    await this.ensureFile(output);
    await new Promise<void>((resolve, reject) => {
      const destination = createWriteStream(output);
      const archive = new ZipArchive({ zlib: { level: 9 }, forceLocalTime: false });
      destination.on('close', resolve);
      destination.on('error', reject);
      archive.on('error', reject);
      archive.pipe(destination);
      archive.directory(options.dir, false, { date: new Date('1980-01-01T00:00:00.000Z') });
      void archive.finalize();
    });
    return [output];
  }
}
