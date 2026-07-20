import { defineConfig } from 'vite';
import { resolveChannel } from './src/shared/branding';

const channel = resolveChannel(process.env.CORTEX_RELEASE_CHANNEL, 'development');

export default defineConfig({
  define: {
    __CORTEX_RELEASE_CHANNEL__: JSON.stringify(channel),
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ['electron'],
      output: { entryFileNames: 'main.cjs', format: 'cjs' },
    },
  },
});
