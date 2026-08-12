import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/e2e/**'],
    environment: 'node',
    coverage: { reporter: ['text', 'html'], exclude: ['**/*.d.ts'] },
  },
});
