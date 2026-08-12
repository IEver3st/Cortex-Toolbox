import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertTrustedGitHubAssetUrl,
  checksumForAsset,
  downloadBodyToFile,
  fileMatchesSha256,
  sha256ForFile,
} from './update-integrity';

describe('update integrity', () => {
  it('matches a release checksum by installer basename', () => {
    const hash = 'a'.repeat(64);
    const checksums = `${hash}  apps/desktop/out/make/squirrel.windows/x64/CortexToolBoxSetup.exe`;
    expect(checksumForAsset(checksums, 'CortexToolBoxSetup.exe')).toBe(hash);
  });

  it('rejects missing installer checksum entries', () => {
    const checksums = `${'b'.repeat(64)}  apps/desktop/out/make/other.zip`;
    expect(checksumForAsset(checksums, 'CortexToolBoxSetup.exe')).toBeNull();
  });

  it('accepts only HTTPS GitHub release asset URLs', () => {
    expect(() =>
      assertTrustedGitHubAssetUrl(
        'https://github.com/example-owner/example-repo/releases/download/v1.0.0/CortexToolBoxSetup.exe',
      ),
    ).not.toThrow();
    expect(() => assertTrustedGitHubAssetUrl('http://github.com/example.exe')).toThrow(
      /untrusted/i,
    );
    expect(() => assertTrustedGitHubAssetUrl('https://example.com/update.exe')).toThrow(
      /untrusted/i,
    );
  });

  it('rechecks pending installer bytes against the persisted checksum', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-update-integrity-'));
    const installer = path.join(root, 'cortex-update-1.1.0.exe');
    await writeFile(installer, 'verified installer bytes');
    const expected = await sha256ForFile(installer);
    await expect(fileMatchesSha256(installer, expected)).resolves.toBe(true);

    await writeFile(installer, 'replaced installer bytes');
    await expect(fileMatchesSha256(installer, expected)).resolves.toBe(false);
    await expect(fileMatchesSha256(installer, 'not-a-hash')).resolves.toBe(false);
  });

  it('streams update bytes to disk while reporting an authoritative digest', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cortex-update-stream-'));
    const installer = path.join(root, 'cortex-update-1.2.0.exe.partial');
    const encoder = new TextEncoder();
    const progress: number[] = [];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('verified '));
        controller.enqueue(encoder.encode('installer bytes'));
        controller.close();
      },
    });

    const result = await downloadBodyToFile(body, installer, (received) => progress.push(received));
    expect(result.bytes).toBe(24);
    expect(result.sha256).toBe(await sha256ForFile(installer));
    expect(progress).toEqual([9, 24]);

    await expect(
      downloadBodyToFile(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('replacement'));
            controller.close();
          },
        }),
        installer,
      ),
    ).rejects.toThrow();
  });
});
