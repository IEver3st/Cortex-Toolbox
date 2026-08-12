import type { ForgeConfig } from '@electron-forge/shared-types';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { CortexZipMaker } from './makers/zip-maker';
import { brandingForChannel, resolveChannel } from './src/shared/branding';

const channel = resolveChannel(process.env.CORTEX_RELEASE_CHANNEL, 'stable');
const brand = brandingForChannel(channel);
const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const brandDir = path.join(desktopRoot, 'assets', 'brand');
const iconPath = path.join(brandDir, brand.iconBaseName);

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // Sharp's optional @img packages contain native binaries and must stay outside the archive.
      unpack: '**/node_modules/@img/**/*',
    },
    name: brand.productName,
    executableName: brand.executableName,
    appBundleId: brand.appBundleId,
    // electron-packager appends platform extensions (.ico / .icns / .png)
    icon: iconPath,
    win32metadata: {
      CompanyName: 'Cortex contributors',
      FileDescription: brand.productName,
      ProductName: brand.productName,
      InternalName: brand.executableName,
      OriginalFilename: `${brand.executableName}.exe`,
    },
    // Bake channel so packaged apps report the correct release track.
    extraResource: [
      path.join(brandDir, 'icon.png'),
      path.join(brandDir, 'icon-dev.png'),
      path.join(brandDir, 'icon-beta.png'),
    ],
    afterPrune: [
      (buildPath, _electronVersion, _platform, _arch, callback) => {
        void import('node:fs/promises')
          .then(async ({ cp, mkdir }) => {
            const source = path.resolve(desktopRoot, '..', '..', 'node_modules', '@img');
            const destination = path.join(buildPath, 'node_modules', '@img');
            await mkdir(path.dirname(destination), { recursive: true });
            await cp(source, destination, { recursive: true, force: true });
          })
          .then(
            () => callback(),
            (error: unknown) => callback(error as Error),
          );
      },
    ],
    appCopyright: `Copyright © ${new Date().getFullYear()} Cortex contributors`,
  },
  rebuildConfig: {},
  makers: [
    new CortexZipMaker(),
    new MakerSquirrel({
      name: brand.squirrelName,
      setupExe: brand.setupExe,
      setupIcon: `${iconPath}.ico`,
      noMsi: true,
      vendorDirectory: fileURLToPath(
        new URL('../../node_modules/electron-winstaller/vendor', import.meta.url),
      ),
      ...(process.env.CORTEX_WINDOWS_CERTIFICATE_FILE
        ? {
            certificateFile: process.env.CORTEX_WINDOWS_CERTIFICATE_FILE,
            ...(process.env.CORTEX_WINDOWS_CERTIFICATE_PASSWORD
              ? { certificatePassword: process.env.CORTEX_WINDOWS_CERTIFICATE_PASSWORD }
              : {}),
          }
        : {}),
    }),
  ],
  hooks: {
    generateAssets: async () => {
      // Ensure ICO/PNG exist before packager runs (no-op if already current).
      const { spawnSync } = await import('node:child_process');
      const script = path.join(desktopRoot, 'scripts', 'generate-icons.mjs');
      const result = spawnSync(process.execPath, [script], {
        cwd: desktopRoot,
        stdio: 'inherit',
        env: process.env,
      });
      if (result.status !== 0) {
        throw new Error(`Brand icon generation failed with exit ${String(result.status)}`);
      }
    },
  },
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
};

export default config;
