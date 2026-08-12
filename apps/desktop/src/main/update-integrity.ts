import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export function assertTrustedGitHubAssetUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
    throw new Error('GitHub returned an untrusted update download URL.');
  }
}

export function checksumForAsset(contents: string, assetName: string): string | null {
  const normalizedAssetName = assetName.toLowerCase();
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})\s+(.+)$/i.exec(line.trim());
    if (!match?.[1] || !match[2]) continue;
    const listedName = path.basename(match[2].replaceAll('\\', '/')).toLowerCase();
    if (listedName === normalizedAssetName) return match[1].toLowerCase();
  }
  return null;
}

export async function sha256ForFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath, { highWaterMark: 256 * 1024 })) {
    hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return hash.digest('hex');
}

export async function fileMatchesSha256(filePath: string, expectedHash: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  return (await sha256ForFile(filePath)) === expectedHash.toLowerCase();
}

export async function downloadBodyToFile(
  body: ReadableStream<Uint8Array>,
  filePath: string,
  onProgress?: (receivedBytes: number) => void,
): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash('sha256');
  const reader = body.getReader();
  let bytes = 0;
  let completed = false;

  const chunks = (async function* () {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) {
          completed = true;
          return;
        }
        const buffer = Buffer.from(chunk.value);
        bytes += buffer.byteLength;
        hash.update(buffer);
        onProgress?.(bytes);
        yield buffer;
      }
    } finally {
      if (!completed) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  })();

  await pipeline(chunks, createWriteStream(filePath, { flags: 'wx' }));
  return { bytes, sha256: hash.digest('hex') };
}
