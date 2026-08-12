import { app, BrowserWindow, shell } from 'electron';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { brandingForChannel } from '../shared/branding';
import type { Preferences, UpdateStatus } from '../shared/contracts';
import { updatesChangedEvent } from '../shared/contracts';
import type { MainEnv } from './config/env';
import {
  assertTrustedGitHubAssetUrl,
  checksumForAsset,
  downloadBodyToFile,
  fileMatchesSha256,
} from './update-integrity';

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubAsset[];
}

const RELEASE_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const METADATA_REQUEST_TIMEOUT_MS = 20_000;
const INSTALLER_DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

function normalizedReleaseVersion(tag: string): string | null {
  const version = tag.replace(/^v/i, '');
  return RELEASE_VERSION_PATTERN.test(version) ? version : null;
}

function parseSemver(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value.replace(/^v/i, ''));
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isNewerVersion(remote: string, local: string): boolean {
  const remoteParts = parseSemver(remote);
  const localParts = parseSemver(local);
  if (!remoteParts || !localParts) return false;
  for (let index = 0; index < 3; index += 1) {
    const remotePart = remoteParts[index] ?? 0;
    const localPart = localParts[index] ?? 0;
    if (remotePart > localPart) return true;
    if (remotePart < localPart) return false;
  }
  return false;
}

function installerExtension(): string {
  return '.exe';
}

function checksumAssetName(): string {
  return 'SHA256SUMS-Windows.txt';
}

function baseStatus(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    phase: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: null,
    progress: null,
    message: null,
    releaseUrl: null,
    ...overrides,
  };
}

export class UpdateService {
  private status: UpdateStatus = baseStatus();
  private pendingInstaller: string | null = null;
  private pendingInstallerHash: string | null = null;
  private checkInFlight: Promise<UpdateStatus> | null = null;
  private downloadInFlight: Promise<UpdateStatus> | null = null;

  constructor(
    private readonly env: MainEnv,
    private readonly readPreferences: () => Preferences,
  ) {}

  getStatus(): UpdateStatus {
    return this.status;
  }

  private publish(next: UpdateStatus): UpdateStatus {
    this.status = next;
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(updatesChangedEvent, next);
    }
    return next;
  }

  private updatesEnabled(): boolean {
    return (
      this.env.CORTEX_ENABLE_AUTO_UPDATE &&
      Boolean(this.env.CORTEX_GITHUB_OWNER && this.env.CORTEX_GITHUB_REPOSITORY) &&
      app.isPackaged &&
      process.platform === 'win32'
    );
  }

  private disabledStatus(message: string): UpdateStatus {
    return baseStatus({ phase: 'disabled', message });
  }

  async initialize(): Promise<void> {
    if (!this.updatesEnabled()) {
      this.publish(
        this.disabledStatus(
          app.isPackaged
            ? process.platform === 'win32'
              ? 'Automatic updates are not configured for this build.'
              : 'In-app updates are currently available on Windows only.'
            : 'Updates are available only in packaged releases.',
        ),
      );
      return;
    }
    const preferences = this.readPreferences();
    if (preferences.autoDownloadUpdates) {
      await this.check();
    } else {
      this.publish(baseStatus({ message: 'Automatic update checks are off.' }));
    }
  }

  async check(): Promise<UpdateStatus> {
    if (!this.updatesEnabled()) return this.publish(this.disabledStatus(this.status.message ?? ''));
    if (this.checkInFlight) return this.checkInFlight;
    this.checkInFlight = this.runCheck().finally(() => {
      this.checkInFlight = null;
    });
    return this.checkInFlight;
  }

  private async runCheck(): Promise<UpdateStatus> {
    this.publish(baseStatus({ phase: 'checking', message: 'Checking for updates…' }));
    try {
      const preferences = this.readPreferences();
      const release = await this.fetchLatestRelease(preferences.releaseBranch);
      if (!release) {
        return this.publish(
          baseStatus({ phase: 'uptodate', message: 'You are on the latest release.' }),
        );
      }
      const availableVersion = normalizedReleaseVersion(release.tag_name);
      if (!availableVersion) {
        return this.publish(
          baseStatus({
            phase: 'error',
            releaseUrl: release.html_url,
            message: 'The latest release tag is not a supported semantic version.',
          }),
        );
      }
      if (!isNewerVersion(availableVersion, app.getVersion())) {
        return this.publish(
          baseStatus({ phase: 'uptodate', message: 'You are on the latest release.' }),
        );
      }
      const asset = this.pickInstallerAsset(release);
      if (!asset) {
        return this.publish(
          baseStatus({
            phase: 'error',
            availableVersion,
            releaseUrl: release.html_url,
            message: 'A newer release exists, but no installer asset was found for this platform.',
          }),
        );
      }
      const next = baseStatus({
        phase: 'available',
        availableVersion,
        releaseUrl: release.html_url,
        message: `Version ${availableVersion} is ready to download.`,
      });
      this.pendingInstaller = null;
      this.pendingInstallerHash = null;
      this.publish(next);
      if (preferences.autoDownloadUpdates) {
        return await this.download(asset, release);
      }
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update check failed.';
      return this.publish(baseStatus({ phase: 'error', message }));
    }
  }

  async download(asset?: GitHubAsset, release?: GitHubRelease): Promise<UpdateStatus> {
    if (!this.updatesEnabled()) return this.publish(this.disabledStatus(this.status.message ?? ''));
    if (this.downloadInFlight) return this.downloadInFlight;
    if (this.status.phase !== 'available' && this.status.phase !== 'error') {
      return this.status;
    }
    this.downloadInFlight = this.runDownload(asset, release).finally(() => {
      this.downloadInFlight = null;
    });
    return this.downloadInFlight;
  }

  private async runDownload(asset?: GitHubAsset, release?: GitHubRelease): Promise<UpdateStatus> {
    const availableVersion = this.status.availableVersion;
    if (!availableVersion) {
      return this.publish(
        baseStatus({ phase: 'error', message: 'No update is available to download.' }),
      );
    }
    let downloadAsset: GitHubAsset | null | undefined = asset;
    let sourceRelease: GitHubRelease | null | undefined = release;
    if (!downloadAsset || !sourceRelease) {
      const preferences = this.readPreferences();
      sourceRelease = await this.fetchLatestRelease(preferences.releaseBranch);
      downloadAsset = sourceRelease ? this.pickInstallerAsset(sourceRelease) : null;
    }
    if (!downloadAsset || !sourceRelease) {
      return this.publish(
        baseStatus({
          phase: 'error',
          availableVersion,
          message: 'Could not resolve the installer download for this platform.',
        }),
      );
    }
    if (normalizedReleaseVersion(sourceRelease.tag_name) !== availableVersion) {
      return this.publish(
        baseStatus({
          phase: 'error',
          availableVersion,
          releaseUrl: sourceRelease.html_url,
          message: 'The available release changed. Check for updates again before downloading.',
        }),
      );
    }

    const targetDir = path.join(app.getPath('userData'), 'pending-update');
    const extension = installerExtension();
    const targetPath = path.join(targetDir, `cortex-update-${availableVersion}${extension}`);
    const partialPath = `${targetPath}.partial`;
    const hashPath = `${targetPath}.sha256`;
    const partialHashPath = `${hashPath}.partial`;
    this.publish(
      baseStatus({
        phase: 'downloading',
        availableVersion,
        releaseUrl: this.status.releaseUrl,
        progress: 0,
        message: `Downloading version ${availableVersion}…`,
      }),
    );

    try {
      assertTrustedGitHubAssetUrl(downloadAsset.browser_download_url);
      const expectedHash = await this.fetchExpectedChecksum(sourceRelease, downloadAsset);
      await mkdir(targetDir, { recursive: true });
      await unlink(partialPath).catch(() => undefined);
      await unlink(partialHashPath).catch(() => undefined);
      const response = await fetch(downloadAsset.browser_download_url, {
        headers: { Accept: 'application/octet-stream', 'User-Agent': 'Cortex-ToolBox' },
        signal: AbortSignal.timeout(INSTALLER_DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Download failed with status ${response.status}.`);
      }
      const total = Number(response.headers.get('content-length') ?? 0);
      const downloaded = await downloadBodyToFile(response.body, partialPath, (received) => {
        if (total > 0) {
          this.publish(
            baseStatus({
              phase: 'downloading',
              availableVersion,
              releaseUrl: this.status.releaseUrl,
              progress: Math.min(1, received / total),
              message: `Downloading version ${availableVersion}…`,
            }),
          );
        }
      });
      const actualHash = downloaded.sha256;
      if (actualHash !== expectedHash) {
        await unlink(partialPath).catch(() => undefined);
        throw new Error('The downloaded installer failed SHA-256 verification.');
      }
      await writeFile(partialHashPath, `${actualHash}\n`, { encoding: 'utf8', flag: 'wx' });
      await unlink(targetPath).catch(() => undefined);
      await unlink(hashPath).catch(() => undefined);
      await rename(partialPath, targetPath);
      await rename(partialHashPath, hashPath);
      this.pendingInstaller = targetPath;
      this.pendingInstallerHash = actualHash;
      return this.publish(
        baseStatus({
          phase: 'ready',
          availableVersion,
          releaseUrl: this.status.releaseUrl,
          progress: 1,
          message: `Version ${availableVersion} is ready to install.`,
        }),
      );
    } catch (error) {
      await unlink(partialPath).catch(() => undefined);
      await unlink(partialHashPath).catch(() => undefined);
      const message = error instanceof Error ? error.message : 'Update download failed.';
      return this.publish(
        baseStatus({
          phase: 'error',
          availableVersion,
          releaseUrl: this.status.releaseUrl,
          message,
        }),
      );
    }
  }

  private async fetchExpectedChecksum(
    release: GitHubRelease,
    installer: GitHubAsset,
  ): Promise<string> {
    const checksumAsset = release.assets.find(
      (asset) => asset.name.toLowerCase() === checksumAssetName().toLowerCase(),
    );
    if (!checksumAsset) {
      throw new Error('This release does not include the required SHA-256 checksum file.');
    }
    assertTrustedGitHubAssetUrl(checksumAsset.browser_download_url);
    const response = await fetch(checksumAsset.browser_download_url, {
      headers: { Accept: 'text/plain', 'User-Agent': 'Cortex-ToolBox' },
      signal: AbortSignal.timeout(METADATA_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Checksum download failed with status ${response.status}.`);
    }
    const expected = checksumForAsset(await response.text(), installer.name);
    if (!expected) {
      throw new Error('The release checksum file does not cover this installer.');
    }
    return expected;
  }

  async install(): Promise<boolean> {
    if (!this.pendingInstaller || !this.pendingInstallerHash) {
      throw new Error('Download the update before installing.');
    }
    try {
      await access(this.pendingInstaller);
    } catch {
      throw new Error('The downloaded installer is no longer available.');
    }
    let expectedHash: string;
    try {
      const version = this.status.availableVersion;
      if (!version) throw new Error('The pending update version is missing.');
      const release = await this.fetchLatestRelease(this.readPreferences().releaseBranch);
      if (!release || normalizedReleaseVersion(release.tag_name) !== version) {
        throw new Error('The pending update is no longer the current release. Download it again.');
      }
      const asset = this.pickInstallerAsset(release);
      if (!asset) throw new Error('The current release has no Windows installer asset.');
      expectedHash = await this.fetchExpectedChecksum(release, asset);
    } catch (error) {
      throw new Error('Cortex could not refresh update integrity before installation.', {
        cause: error,
      });
    }
    if (
      this.pendingInstallerHash !== expectedHash ||
      !(await fileMatchesSha256(this.pendingInstaller, expectedHash))
    ) {
      this.pendingInstaller = null;
      this.pendingInstallerHash = null;
      this.publish(
        baseStatus({
          phase: 'error',
          availableVersion: this.status.availableVersion,
          releaseUrl: this.status.releaseUrl,
          message: 'The pending installer changed after verification. Download it again.',
        }),
      );
      throw new Error('The pending installer failed SHA-256 verification.');
    }
    const opened = await shell.openPath(this.pendingInstaller);
    if (opened) throw new Error(opened);
    return true;
  }

  async restorePendingDownload(): Promise<void> {
    const targetDir = path.join(app.getPath('userData'), 'pending-update');
    try {
      const entries = await stat(targetDir);
      if (!entries.isDirectory()) return;
    } catch {
      return;
    }
    const extension = installerExtension();
    const files = await readdir(targetDir);
    const candidates = files.filter((file) => {
      if (!file.startsWith('cortex-update-') || !file.endsWith(extension)) return false;
      const version = file.slice('cortex-update-'.length, -extension.length);
      return RELEASE_VERSION_PATTERN.test(version);
    });
    for (const match of candidates) {
      const targetPath = path.join(targetDir, match);
      try {
        const expectedHash = (await readFile(`${targetPath}.sha256`, 'utf8')).trim();
        if (!(await fileMatchesSha256(targetPath, expectedHash))) continue;
        const version = match
          .replace(/^cortex-update-/, '')
          .replace(new RegExp(`${extension}$`), '');
        this.pendingInstaller = targetPath;
        this.pendingInstallerHash = expectedHash.toLowerCase();
        this.publish(
          baseStatus({
            phase: 'ready',
            availableVersion: version,
            progress: 1,
            message: `Version ${version} is ready to install.`,
          }),
        );
        return;
      } catch {
        // Ignore incomplete or modified pending downloads. A fresh check can replace them.
      }
    }
  }

  private async fetchLatestRelease(
    releaseBranch: Preferences['releaseBranch'],
  ): Promise<GitHubRelease | null> {
    const owner = this.env.CORTEX_GITHUB_OWNER;
    const repository = this.env.CORTEX_GITHUB_REPOSITORY;
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repository}/releases?per_page=20`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Cortex-ToolBox',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(METADATA_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub release lookup failed with status ${response.status}.`);
    }
    const releases = (await response.json()) as GitHubRelease[];
    const candidates = releases.filter((release) => !release.draft);
    const match =
      releaseBranch === 'developer'
        ? candidates[0]
        : candidates.find((release) => !release.prerelease);
    return match ?? null;
  }

  private pickInstallerAsset(release: GitHubRelease): GitHubRelease['assets'][number] | null {
    const extension = installerExtension();
    const brand = brandingForChannel(this.env.CORTEX_RELEASE_CHANNEL);
    const preferred = release.assets.find(
      (asset) =>
        asset.name.toLowerCase().endsWith(extension) &&
        asset.name.toLowerCase().includes(brand.executableName.toLowerCase()),
    );
    if (preferred) return preferred;
    return release.assets.find((asset) => asset.name.toLowerCase().endsWith(extension)) ?? null;
  }
}
