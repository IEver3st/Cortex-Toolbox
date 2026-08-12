/** Packaging and UI identity for release channels. */

export type ReleaseChannel = 'stable' | 'beta' | 'development';

/** User-selected update branch shown in Settings (stable vs developer icon/feed). */
export type ReleaseBranch = 'stable' | 'developer';

export type IconBaseName = 'icon' | 'icon-beta' | 'icon-dev';

export function iconBaseNameForReleaseBranch(branch: ReleaseBranch): IconBaseName {
  return branch === 'developer' ? 'icon-dev' : 'icon';
}

export interface ChannelBranding {
  channel: ReleaseChannel;
  /** electron-packager / window title product name */
  productName: string;
  /** Windows/Linux executable basename without extension */
  executableName: string;
  /** CFBundleIdentifier / app user model family */
  appBundleId: string;
  /** Squirrel nuget package id (alphanumeric + underscore) */
  squirrelName: string;
  setupExe: string;
  /** Path basenames under assets/brand (no extension) */
  iconBaseName: IconBaseName;
  wordmark: string;
  isBeta: boolean;
}

export function resolveChannel(
  raw: string | undefined | null,
  fallback: ReleaseChannel = 'development',
): ReleaseChannel {
  if (raw === 'stable' || raw === 'beta' || raw === 'development') return raw;
  return fallback;
}

export function brandingForChannel(channel: ReleaseChannel): ChannelBranding {
  if (channel === 'beta') {
    return {
      channel,
      productName: 'Cortex ToolBox Beta',
      executableName: 'cortex-toolbox-beta',
      appBundleId: 'org.cortextoolbox.desktop.beta',
      squirrelName: 'cortex_toolbox_beta',
      setupExe: 'CortexToolBoxBetaSetup.exe',
      iconBaseName: 'icon-beta',
      wordmark: 'Cortex ToolBox Beta',
      isBeta: true,
    };
  }

  // stable + development share stable product identity so local packages
  // match shipping names; only channel metadata differs at runtime.
  return {
    channel,
    productName: 'Cortex ToolBox',
    executableName: 'cortex-toolbox',
    appBundleId: 'org.cortextoolbox.desktop',
    squirrelName: 'cortex_toolbox',
    setupExe: 'CortexToolBoxSetup.exe',
    iconBaseName: 'icon',
    wordmark: 'Cortex ToolBox',
    isBeta: false,
  };
}
