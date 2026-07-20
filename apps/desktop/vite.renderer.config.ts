import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { brandingForChannel, resolveChannel } from './src/shared/branding';

const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(desktopRoot, '../..');
const packagesRoot = path.resolve(repoRoot, 'packages');

const channel = resolveChannel(process.env.CORTEX_RELEASE_CHANNEL, 'development');
const brand = brandingForChannel(channel);
const packageJson = JSON.parse(readFileSync(path.join(desktopRoot, 'package.json'), 'utf8')) as {
  version: string;
  dependencies: Record<string, string>;
};

const workspacePackages = Object.keys(packageJson.dependencies).filter((dependency) =>
  dependency.startsWith('@cortex/'),
);

export default defineConfig({
  // Local workspace packages change during desktop development. Serving their
  // source avoids stale optimized-dependency export maps after an API changes.
  optimizeDeps: { exclude: workspacePackages },
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    // Resolve @cortex/* to real package paths (not node_modules junctions).
    // Junction URLs keep a separate Vite module id; file watchers invalidate the
    // @fs id while /node_modules/@cortex/... stays stale — missing named exports.
    alias: [
      {
        find: /^@cortex\/([^/]+)\/(.+)$/,
        replacement: `${packagesRoot}/$1/src/$2.ts`,
      },
      {
        find: /^@cortex\/([^/]+)$/,
        replacement: `${packagesRoot}/$1/src/index.ts`,
      },
    ],
    dedupe: ['react', 'react-dom'],
  },
  define: {
    __CORTEX_RELEASE_CHANNEL__: JSON.stringify(channel),
    __CORTEX_PRODUCT_NAME__: JSON.stringify(brand.productName),
    __CORTEX_IS_BETA__: JSON.stringify(brand.isBeta),
    __CORTEX_APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: { sourcemap: true },
});
