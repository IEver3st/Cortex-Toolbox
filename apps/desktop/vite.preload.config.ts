import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export default defineConfig(({ mode }) => ({
  build: {
    sourcemap: mode !== 'production',
    // Preload runs in Electron's sandbox — never ship Node-only code into it.
    rollupOptions: {
      external: ['electron', ...nodeBuiltins],
      output: { entryFileNames: 'preload.cjs', format: 'cjs' },
    },
  },
}));
