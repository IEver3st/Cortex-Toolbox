import path from 'node:path';

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
