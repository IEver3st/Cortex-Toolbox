import { describe, expect, it } from 'vitest';
import { assertTrustedGitHubAssetUrl, checksumForAsset } from './update-integrity';

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
});
