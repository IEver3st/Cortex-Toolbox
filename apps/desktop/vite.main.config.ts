import { defineConfig, loadEnv } from 'vite';
import { resolveChannel } from './src/shared/branding';

export default defineConfig(({ mode }) => {
  const buildEnv = loadEnv(mode, import.meta.dirname, 'CORTEX_');
  const githubOwner = process.env.CORTEX_GITHUB_OWNER ?? buildEnv.CORTEX_GITHUB_OWNER ?? 'IEver3st';
  const githubRepository =
    process.env.CORTEX_GITHUB_REPOSITORY ?? buildEnv.CORTEX_GITHUB_REPOSITORY ?? 'CRT';
  const channel = resolveChannel(
    process.env.CORTEX_RELEASE_CHANNEL ?? buildEnv.CORTEX_RELEASE_CHANNEL,
    'development',
  );
  const enableAutoUpdate =
    process.env.CORTEX_ENABLE_AUTO_UPDATE ??
    buildEnv.CORTEX_ENABLE_AUTO_UPDATE ??
    (channel === 'development' ? 'false' : 'true');
  return {
    define: {
      __CORTEX_RELEASE_CHANNEL__: JSON.stringify(channel),
      __CORTEX_GITHUB_OWNER__: JSON.stringify(githubOwner),
      __CORTEX_GITHUB_REPOSITORY__: JSON.stringify(githubRepository),
      __CORTEX_ENABLE_AUTO_UPDATE__: JSON.stringify(enableAutoUpdate),
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        external: ['electron'],
        output: { entryFileNames: 'main.cjs', format: 'cjs' },
      },
    },
  };
});
