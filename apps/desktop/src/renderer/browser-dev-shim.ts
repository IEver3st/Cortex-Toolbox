/* eslint-disable @typescript-eslint/require-await -- The shim mirrors an asynchronous IPC API with immediate local results. */
import { fail, ok } from '@cortex/core/result';
import { DEFAULT_PREFERENCES } from '../shared/contracts';
import type { CortexApi, Preferences } from '../shared/contracts';

const browserOnly = () =>
  fail({
    code: 'BROWSER_DEV',
    message: 'This action needs the Electron desktop app.',
    recovery: 'Run pnpm dev and use the Cortex window for filesystem access.',
  });

function browserSystemColorMode(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const emptySummary = {
  files: 0,
  bytes: 0,
  scripts: 0,
  textures: 0,
  models: 0,
  metadata: 0,
  kind: 'empty' as const,
  roles: {
    client: 0,
    server: 0,
    shared: 0,
    stream: 0,
    data: 0,
    html: 0,
    root: 0,
    other: 0,
  },
  extensions: [],
  largest: [],
  manifest: null,
  detection: {
    scope: 'empty' as const,
    confidence: 'high' as const,
    projectType: 'Empty folder',
    message: null,
    candidates: [],
  },
  signals: [],
  git: { available: false, branch: null, changed: [] },
  indexedAt: new Date().toISOString(),
};

const emptyAnalysis = {
  generatedAt: new Date().toISOString(),
  files: [],
  nodes: [],
  edges: [],
  summary: { scripts: 0, lines: 0, events: 0, exports: 0, commands: 0, pieces: 0 },
};

let preferences: Preferences = {
  ...DEFAULT_PREFERENCES,
  installedModules: [...DEFAULT_PREFERENCES.installedModules],
};

export function installBrowserDevShim(): void {
  if (typeof window === 'undefined') return;
  if (!import.meta.env.DEV) return;
  // contextBridge exposes window.cortex without passing Object.hasOwn — probing the API avoids
  // clobbering the real preload bridge in the Electron dev window.
  if (Object.hasOwn(window, 'cortex') && typeof window.cortex.projects.open === 'function') return;

  const api: CortexApi = {
    projects: {
      create: async () => browserOnly(),
      open: async () => browserOnly(),
      openPath: async () => browserOnly(),
      current: async () => ok(null),
      recent: async () => ok([]),
      recentDetails: async () => ok([]),
      openFolder: async () => browserOnly(),
      openDropped: async () => browserOnly(),
      import: async () => browserOnly(),
      removeRecent: async () => ok(true),
      reveal: async () => ok(true),
      close: async () => ok(null),
    },
    files: {
      list: async () => ok([]),
      pickHandling: async () => browserOnly(),
      read: async () => browserOnly(),
      planWrite: async () => browserOnly(),
      planCreateHandling: async () => browserOnly(),
      applyWrite: async () => browserOnly(),
    },
    resources: {
      loadManifest: async () => browserOnly(),
      audit: async () => ok([]),
      previewPackage: async () =>
        ok({ entries: [], gate: { allowed: false, blockers: ['Open a project in Electron.'] } }),
      buildPackage: async () => browserOnly(),
      summary: async () => ok(emptySummary),
      analyze: async () => ok(emptyAnalysis),
      exportAnalysis: async () => ok(null),
      exportWorkbench: async () => browserOnly(),
    },
    plugins: {
      list: async () => ok([]),
      grant: async () => browserOnly(),
      openFolder: async () => browserOnly(),
    },
    changes: {
      planManifest: async () => browserOnly(),
      applyManifest: async () => browserOnly(),
    },
    jobs: {
      list: async () => ok([]),
      cancel: async () => ok(false),
    },
    settings: {
      get: async () => ok(preferences),
      set: async (input) => {
        preferences = {
          ...preferences,
          ...input,
          installedModules: [...input.installedModules],
        };
        return ok(preferences);
      },
    },
    ai: {
      startChat: async () => browserOnly(),
      cancelChat: async () => ok(true),
      planProposal: async () => browserOnly(),
      applyProposal: async () => browserOnly(),
      onStream: () => () => undefined,
    },
    account: {
      status: async () =>
        ok({
          configured: false,
          cloudConfigured: false,
          status: 'unconfigured' as const,
          identity: null,
          plan: null,
          billing: null,
          ai: null,
          message: null,
        }),
      signIn: async () => browserOnly(),
      signOut: async () => ok(true),
      checkout: async () => browserOnly(),
      portal: async () => browserOnly(),
      onChanged: () => () => undefined,
    },
    updates: {
      status: async () =>
        ok({
          phase: 'disabled',
          currentVersion: '0.0.0',
          availableVersion: null,
          progress: null,
          message: 'Updates are only available in the packaged desktop app.',
          releaseUrl: null,
        }),
      check: async () => browserOnly(),
      download: async () => browserOnly(),
      install: async () => browserOnly(),
      onStatusChanged: () => () => undefined,
    },
    reports: {
      status: async () =>
        ok({
          configured: false,
          repository: null,
          appVersion: '0.0.0',
          logCount: 0,
        }),
      submit: async () => browserOnly(),
      recordClientError: async () => ok(true),
    },
    system: {
      colorScheme: async () => ok(browserSystemColorMode()),
      onColorSchemeChanged: (listener) => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const sync = () => listener(media.matches ? 'dark' : 'light');
        media.addEventListener('change', sync);
        sync();
        return () => media.removeEventListener('change', sync);
      },
      window: async () => ok(true),
      openExternal: async ({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        return ok(true);
      },
    },
  };

  Object.defineProperty(window, 'cortex', { value: Object.freeze(api), configurable: true });
}
