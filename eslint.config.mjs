import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/.vite/**',
      '**/coverage/**',
      '**/node_modules/**',
      'artifacts/**',
      'examples/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: ['./tsconfig.eslint.json'], tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: [
      'packages/script-analysis/src/probe-findings.ts',
      'packages/vehicle-meta/src/**/*.ts',
    ],
    rules: {
      // These parsers bounds-check captures and indexed tables before access. TypeScript cannot
      // preserve those control-flow guarantees through the parser helpers and nested loops.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['packages/vehicle-meta/src/analysis.ts', 'packages/vehicle-meta/src/diagnose.ts'],
    rules: {
      // Input-facing parsers deliberately retain fallbacks for malformed or partial metadata,
      // even where normalized public types make those branches look redundant to ESLint.
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
);
