import { projectSchema, projectTypeSchema } from '@cortex/project-schema';
import {
  aiChangeProposalSchema,
  aiChatRequestSchema,
  aiWorkspaceAccessSchema,
  cortexReasoningModeSchema,
  type AiStreamEvent,
  type AiWorkspaceAccess,
  type CortexReasoningMode,
} from '@cortex/ai/contracts';
import { z } from 'zod';
import { pluginManifestSchema, pluginPermissionSchema } from '@cortex/plugin-sdk';
import { resourceAnalysisSchema } from '@cortex/script-analysis';
import { defaultInstalledModuleIds, moduleIdSchema, normalizeInstalledModules } from './modules';
import {
  storedPaletteSchema,
  themeOverridesSchema,
  type StoredPalette,
  type ThemeOverrides,
} from './theme-schema';

const errorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.string().optional(),
    path: z.string().optional(),
    recovery: z.string().optional(),
  })
  .strict();
const sourceRangeSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});
const manifestValueSchema = z.object({ value: z.string(), range: sourceRangeSchema });
const manifestSchema = z.object({
  fxVersion: manifestValueSchema.nullable(),
  game: manifestValueSchema.nullable(),
  author: manifestValueSchema.nullable(),
  description: manifestValueSchema.nullable(),
  version: manifestValueSchema.nullable(),
  clientScripts: z.array(manifestValueSchema),
  serverScripts: z.array(manifestValueSchema),
  sharedScripts: z.array(manifestValueSchema),
  files: z.array(manifestValueSchema),
  dependencies: z.array(manifestValueSchema),
  dataFiles: z.array(z.object({ type: manifestValueSchema, path: manifestValueSchema })),
  uiPage: manifestValueSchema.nullable(),
  unsupported: z.array(z.object({ line: z.number(), text: z.string(), reason: z.string() })),
});
const resourceFileSchema = z.object({
  relativePath: z.string(),
  name: z.string(),
  extension: z.string(),
  bytes: z.number().int().nonnegative(),
});
const findingSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  ruleId: z.string(),
  file: z.string(),
  line: z.number().int().positive().nullable(),
  explanation: z.string(),
  remediation: z.string(),
  documentation: z.string(),
  suppressed: z.boolean(),
});
const changeEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['create', 'modify', 'rename', 'move', 'delete', 'unchanged']),
  relativePath: z.string(),
  beforeBytes: z.number().int().nonnegative().nullable(),
  afterBytes: z.number().int().nonnegative().nullable(),
  beforeHash: z.string().nullable(),
  afterHash: z.string().nullable(),
  selected: z.boolean(),
});
const changePlanSchema = z.object({
  id: z.string(),
  root: z.string(),
  createdAt: z.string(),
  entries: z.array(changeEntrySchema).min(1),
});
const jobSchema = z.object({
  id: z.string(),
  type: z.string(),
  displayName: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  progress: z.number().min(0).max(1).nullable(),
  currentStep: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  logs: z.array(
    z.object({ at: z.string(), level: z.enum(['info', 'warn', 'error']), message: z.string() }),
  ),
  resultFiles: z.array(z.string()),
  failure: z.string().nullable(),
  cancellable: z.boolean(),
});

export const channels = {
  projectsCreate: 'projects:create',
  projectsOpen: 'projects:open',
  projectsOpenPath: 'projects:open-path',
  projectsCurrent: 'projects:current',
  projectsRecent: 'projects:recent',
  projectsRecentDetails: 'projects:recent-details',
  projectsOpenFolder: 'projects:open-folder',
  projectsOpenDropped: 'projects:open-dropped',
  projectsImport: 'projects:import',
  projectsRemoveRecent: 'projects:remove-recent',
  projectsReveal: 'projects:reveal',
  projectsClose: 'projects:close',
  filesList: 'files:list',
  filesPickHandling: 'files:pick-handling',
  filesRead: 'files:read',
  filesPlanWrite: 'files:plan-write',
  filesPlanCreateHandling: 'files:plan-create-handling',
  filesApplyWrite: 'files:apply-write',
  manifestLoad: 'manifest:load',
  manifestPlan: 'manifest:plan',
  manifestApply: 'manifest:apply',
  auditRun: 'audit:run',
  packagePreview: 'package:preview',
  packageBuild: 'package:build',
  workspaceSummary: 'workspace:summary',
  analysisRun: 'analysis:run',
  analysisExport: 'analysis:export',
  workbenchExport: 'workbench:export',
  pluginsList: 'plugins:list',
  pluginsGrant: 'plugins:grant',
  pluginsOpenFolder: 'plugins:open-folder',
  jobsList: 'jobs:list',
  jobsCancel: 'jobs:cancel',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  aiChatStart: 'ai:chat-start',
  aiChatCancel: 'ai:chat-cancel',
  aiPlanProposal: 'ai:plan-proposal',
  aiApplyProposal: 'ai:apply-proposal',
  accountStatus: 'account:status',
  accountSignIn: 'account:sign-in',
  accountSignOut: 'account:sign-out',
  accountCheckout: 'account:checkout',
  accountPortal: 'account:portal',
  updatesStatus: 'updates:status',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',
  updatesInstall: 'updates:install',
  reportsStatus: 'reports:status',
  reportsSubmit: 'reports:submit',
  reportsRecordClientError: 'reports:record-client-error',
  systemColorScheme: 'system:color-scheme',
  systemWindow: 'system:window',
  systemExternal: 'system:external',
} as const;

/** Main → renderer push when update status changes. */
export const updatesChangedEvent = 'updates:changed' as const;
export const aiStreamEvent = 'ai:stream' as const;
export const accountChangedEvent = 'account:changed' as const;
export const systemColorSchemeChanged = 'system:color-scheme-changed' as const;

export const systemColorModeSchema = z.enum(['light', 'dark']);
export type SystemColorMode = z.infer<typeof systemColorModeSchema>;

export const accountStatusSchema = z
  .object({
    configured: z.boolean(),
    cloudConfigured: z.boolean(),
    status: z.enum(['unconfigured', 'signed-out', 'signed-in', 'expired']),
    identity: z
      .object({
        id: z.string(),
        email: z.email(),
        displayName: z.string(),
        avatarUrl: z.url().nullable(),
      })
      .strict()
      .nullable(),
    plan: z.enum(['free', 'creator', 'pro']).nullable(),
    billing: z
      .object({
        interval: z.enum(['month', 'year']).nullable(),
        subscriptionStatus: z.enum([
          'none',
          'active',
          'trialing',
          'past_due',
          'unpaid',
          'canceled',
          'incomplete',
          'incomplete_expired',
          'paused',
        ]),
        cancelAtPeriodEnd: z.boolean(),
        renewsAt: z.iso.datetime().nullable(),
        stripeCustomerPresent: z.boolean(),
        paymentFailed: z.boolean(),
      })
      .strict()
      .nullable(),
    ai: z
      .object({
        entitled: z.boolean(),
        enabled: z.boolean(),
        usage: z
          .object({
            percent: z.number().int().min(0).max(100),
            state: z.enum(['plenty', 'normal', 'nearing', 'grace', 'used']),
            resetsAt: z.iso.datetime().nullable(),
          })
          .strict(),
        limits: z.object({ concurrentRuns: z.number().int().min(0).max(2) }).strict(),
      })
      .strict()
      .nullable(),
    message: z.string().nullable(),
  })
  .strict();
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const updateStatusSchema = z.object({
  phase: z.enum([
    'disabled',
    'idle',
    'checking',
    'available',
    'downloading',
    'ready',
    'uptodate',
    'error',
  ]),
  currentVersion: z.string(),
  availableVersion: z.string().nullable(),
  progress: z.number().min(0).max(1).nullable(),
  message: z.string().nullable(),
  releaseUrl: z.url().nullable(),
});

export type UpdateStatus = z.infer<typeof updateStatusSchema>;

export const reportTypeSchema = z.enum(['bug', 'feature', 'module']);
export type ReportType = z.infer<typeof reportTypeSchema>;

const empty = z.object({}).strict();
const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: errorSchema }),
  ]);
export const workspaceSchema = z.object({
  root: z.string(),
  temporary: z.boolean(),
  project: projectSchema.nullable(),
  manifestName: z.string().nullable(),
});
export const packageEntrySchema = z.object({
  relativePath: z.string(),
  bytes: z.number(),
  sha256: z.string(),
});
export const packageGateSchema = z.object({
  allowed: z.boolean(),
  blockers: z.array(z.string()),
});
export const packagePreviewSchema = z.object({
  entries: z.array(packageEntrySchema),
  gate: packageGateSchema,
});
export const recentWorkspaceSchema = z.object({
  root: z.string(),
  name: z.string(),
  openedAt: z.string(),
});
export const recentWorkspaceDetailSchema = recentWorkspaceSchema.extend({
  exists: z.boolean(),
  hasManifest: z.boolean(),
  projectType: z.string().nullable(),
  kind: z.enum(['script', 'asset', 'mixed', 'empty', 'unknown']),
});
export type RecentWorkspaceDetail = z.infer<typeof recentWorkspaceDetailSchema>;
/** Canonical defaults — also used when migrating older preference stores. */
export const CURRENT_ONBOARDING_VERSION = 1;

export const DEFAULT_PREFERENCES = {
  onboardingVersion: 0,
  interfaceScale: 1,
  uiFontSize: 16,
  reducedMotion: false,
  pointerCursor: true,
  editorFontSize: 14,
  colorMode: 'system',
  themePreset: 'everforest',
  selectedPaletteId: 'everforest',
  interfaceFont: 'aptos',
  codeFont: 'cascadia-code',
  codeLigatures: true,
  interfaceContrast: 'balanced',
  interfaceContrastFine: 0,
  protectTextContrast: true,
  themeOverrides: null,
  customPalettes: [] as StoredPalette[],
  sidebarDensity: 'comfortable',
  sidebarCategoryLabels: true,
  experimentalTools: false,
  autoDownloadUpdates: true,
  releaseBranch: 'stable',
  installedModules: defaultInstalledModuleIds(),
  aiEnabled: false,
  reasoningMode: 'fast',
  aiWorkspaceAccess: 'ask-before-changes',
  aiPanelWidth: 420,
} as const;

export interface Preferences {
  onboardingVersion: number;
  interfaceScale: number;
  uiFontSize: number;
  reducedMotion: boolean;
  pointerCursor: boolean;
  editorFontSize: number;
  colorMode: 'system' | 'light' | 'dark';
  themePreset:
    | 'everforest'
    | 'graphite'
    | 'cobalt'
    | 'ocean'
    | 'ember'
    | 'rose'
    | 'violet'
    | 'mono'
    | 'canopy'
    | 'redline'
    | 'blueprint';
  selectedPaletteId: string;
  interfaceFont: string;
  codeFont: string;
  codeLigatures: boolean;
  interfaceContrast: 'soft' | 'balanced' | 'crisp' | 'maximum';
  interfaceContrastFine: number;
  protectTextContrast: boolean;
  themeOverrides: ThemeOverrides | null;
  customPalettes: StoredPalette[];
  sidebarDensity: 'compact' | 'comfortable';
  sidebarCategoryLabels: boolean;
  experimentalTools: boolean;
  autoDownloadUpdates: boolean;
  releaseBranch: 'stable' | 'developer';
  installedModules: ReturnType<typeof defaultInstalledModuleIds>;
  aiEnabled: boolean;
  reasoningMode: CortexReasoningMode;
  aiWorkspaceAccess: AiWorkspaceAccess;
  aiPanelWidth: number;
}

/** Strict field contracts for well-formed preference values. */
export const preferenceSchema = z.object({
  onboardingVersion: z.number().int().min(0).max(CURRENT_ONBOARDING_VERSION),
  interfaceScale: z.number().min(0.8).max(1.5),
  uiFontSize: z.number().int().min(13).max(18),
  reducedMotion: z.boolean(),
  pointerCursor: z.boolean(),
  editorFontSize: z.number().int().min(11).max(24),
  colorMode: z.enum(['system', 'light', 'dark']),
  themePreset: z.enum([
    'everforest',
    'graphite',
    'cobalt',
    'ocean',
    'ember',
    'rose',
    'violet',
    'mono',
    'canopy',
    'redline',
    'blueprint',
  ]),
  selectedPaletteId: z.string().min(1).max(64),
  interfaceFont: z.string().min(1).max(64),
  codeFont: z.string().min(1).max(64),
  codeLigatures: z.boolean(),
  interfaceContrast: z.enum(['soft', 'balanced', 'crisp', 'maximum']),
  interfaceContrastFine: z.number().min(-20).max(20),
  protectTextContrast: z.boolean(),
  themeOverrides: themeOverridesSchema.nullable(),
  customPalettes: z.array(storedPaletteSchema).max(48),
  sidebarDensity: z.enum(['compact', 'comfortable']),
  sidebarCategoryLabels: z.boolean(),
  experimentalTools: z.boolean(),
  autoDownloadUpdates: z.boolean(),
  releaseBranch: z.enum(['stable', 'developer']),
  installedModules: z.array(moduleIdSchema),
  aiEnabled: z.boolean(),
  reasoningMode: cortexReasoningModeSchema,
  aiWorkspaceAccess: aiWorkspaceAccessSchema,
  aiPanelWidth: z.number().int().min(320).max(720),
});

/**
 * Coerce any stored / partially upgraded preference blob into a complete value.
 * Missing keys (e.g. pre-experimentalTools installs) and invalid types fall back
 * field-by-field so settings never brick the UI after a schema migration.
 */
export function normalizePreferences(raw: unknown): Preferences {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const onboardingVersion = preferenceSchema.shape.onboardingVersion.safeParse(
    source.onboardingVersion,
  );
  const scale = preferenceSchema.shape.interfaceScale.safeParse(source.interfaceScale);
  const uiFontSize = preferenceSchema.shape.uiFontSize.safeParse(source.uiFontSize);
  const motion = preferenceSchema.shape.reducedMotion.safeParse(source.reducedMotion);
  const pointerCursor = preferenceSchema.shape.pointerCursor.safeParse(source.pointerCursor);
  const font = preferenceSchema.shape.editorFontSize.safeParse(source.editorFontSize);
  const colorMode = preferenceSchema.shape.colorMode.safeParse(source.colorMode);
  const themePreset = preferenceSchema.shape.themePreset.safeParse(source.themePreset);
  const selectedPaletteId = preferenceSchema.shape.selectedPaletteId.safeParse(
    source.selectedPaletteId,
  );
  const interfaceFont = preferenceSchema.shape.interfaceFont.safeParse(source.interfaceFont);
  const codeFont = preferenceSchema.shape.codeFont.safeParse(source.codeFont);
  const codeLigatures = preferenceSchema.shape.codeLigatures.safeParse(source.codeLigatures);
  const interfaceContrast = preferenceSchema.shape.interfaceContrast.safeParse(
    source.interfaceContrast,
  );
  const interfaceContrastFine = preferenceSchema.shape.interfaceContrastFine.safeParse(
    source.interfaceContrastFine,
  );
  const protectTextContrast = preferenceSchema.shape.protectTextContrast.safeParse(
    source.protectTextContrast,
  );
  const themeOverrides = preferenceSchema.shape.themeOverrides.safeParse(source.themeOverrides);
  const customPalettes = preferenceSchema.shape.customPalettes.safeParse(source.customPalettes);
  const sidebarDensity = preferenceSchema.shape.sidebarDensity.safeParse(source.sidebarDensity);
  const sidebarCategoryLabels = preferenceSchema.shape.sidebarCategoryLabels.safeParse(
    source.sidebarCategoryLabels,
  );
  const experimental = preferenceSchema.shape.experimentalTools.safeParse(source.experimentalTools);
  const autoDownloadUpdates = preferenceSchema.shape.autoDownloadUpdates.safeParse(
    source.autoDownloadUpdates,
  );
  const releaseBranch = preferenceSchema.shape.releaseBranch.safeParse(source.releaseBranch);
  const aiEnabled = preferenceSchema.shape.aiEnabled.safeParse(source.aiEnabled);
  const reasoningMode = preferenceSchema.shape.reasoningMode.safeParse(source.reasoningMode);
  const aiWorkspaceAccess = preferenceSchema.shape.aiWorkspaceAccess.safeParse(
    source.aiWorkspaceAccess,
  );
  const aiPanelWidth = preferenceSchema.shape.aiPanelWidth.safeParse(source.aiPanelWidth);
  const migratedReasoningMode = reasoningMode.success
    ? reasoningMode.data
    : typeof source.aiModel === 'string' && /(?:v4-pro|advanced)/i.test(source.aiModel)
      ? ('advanced' as const)
      : ('fast' as const);
  const migratedWorkspaceAccess = aiWorkspaceAccess.success
    ? aiWorkspaceAccess.data
    : source.aiWorkspaceAccess === 'allow-session'
      ? ('approve-safe-edits' as const)
      : DEFAULT_PREFERENCES.aiWorkspaceAccess;
  return {
    onboardingVersion: onboardingVersion.success
      ? onboardingVersion.data
      : DEFAULT_PREFERENCES.onboardingVersion,
    interfaceScale: scale.success ? scale.data : DEFAULT_PREFERENCES.interfaceScale,
    uiFontSize: uiFontSize.success ? uiFontSize.data : DEFAULT_PREFERENCES.uiFontSize,
    reducedMotion: motion.success ? motion.data : DEFAULT_PREFERENCES.reducedMotion,
    pointerCursor: pointerCursor.success ? pointerCursor.data : DEFAULT_PREFERENCES.pointerCursor,
    editorFontSize: font.success ? font.data : DEFAULT_PREFERENCES.editorFontSize,
    colorMode: colorMode.success ? colorMode.data : DEFAULT_PREFERENCES.colorMode,
    themePreset: themePreset.success ? themePreset.data : DEFAULT_PREFERENCES.themePreset,
    selectedPaletteId: selectedPaletteId.success
      ? selectedPaletteId.data
      : themePreset.success
        ? themePreset.data
        : DEFAULT_PREFERENCES.selectedPaletteId,
    interfaceFont: interfaceFont.success ? interfaceFont.data : DEFAULT_PREFERENCES.interfaceFont,
    codeFont: codeFont.success ? codeFont.data : DEFAULT_PREFERENCES.codeFont,
    codeLigatures: codeLigatures.success ? codeLigatures.data : DEFAULT_PREFERENCES.codeLigatures,
    interfaceContrast: interfaceContrast.success
      ? interfaceContrast.data
      : DEFAULT_PREFERENCES.interfaceContrast,
    interfaceContrastFine: interfaceContrastFine.success
      ? interfaceContrastFine.data
      : DEFAULT_PREFERENCES.interfaceContrastFine,
    protectTextContrast: protectTextContrast.success
      ? protectTextContrast.data
      : DEFAULT_PREFERENCES.protectTextContrast,
    themeOverrides: themeOverrides.success
      ? themeOverrides.data
      : DEFAULT_PREFERENCES.themeOverrides,
    customPalettes: customPalettes.success
      ? customPalettes.data
      : DEFAULT_PREFERENCES.customPalettes,
    sidebarDensity: sidebarDensity.success
      ? sidebarDensity.data
      : DEFAULT_PREFERENCES.sidebarDensity,
    sidebarCategoryLabels: sidebarCategoryLabels.success
      ? sidebarCategoryLabels.data
      : DEFAULT_PREFERENCES.sidebarCategoryLabels,
    experimentalTools: experimental.success
      ? experimental.data
      : DEFAULT_PREFERENCES.experimentalTools,
    autoDownloadUpdates: autoDownloadUpdates.success
      ? autoDownloadUpdates.data
      : DEFAULT_PREFERENCES.autoDownloadUpdates,
    releaseBranch: releaseBranch.success ? releaseBranch.data : DEFAULT_PREFERENCES.releaseBranch,
    installedModules: normalizeInstalledModules(source.installedModules),
    aiEnabled: aiEnabled.success ? aiEnabled.data : DEFAULT_PREFERENCES.aiEnabled,
    reasoningMode: migratedReasoningMode,
    aiWorkspaceAccess: migratedWorkspaceAccess,
    aiPanelWidth: aiPanelWidth.success ? aiPanelWidth.data : DEFAULT_PREFERENCES.aiPanelWidth,
  };
}

/**
 * Wire schema for IPC responses and store reads. Always succeeds by normalizing
 * first, so a single missing/invalid field cannot take down Settings.
 */
export const preferenceValueSchema = z.preprocess(
  (raw) => normalizePreferences(raw),
  preferenceSchema,
);

/** IPC request path for settings writes — normalize before strict validation. */
export const preferenceRequestSchema = z.preprocess(
  (raw) => normalizePreferences(raw),
  preferenceSchema,
);
export const workspaceSummarySchema = z.object({
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  scripts: z.number().int().nonnegative(),
  textures: z.number().int().nonnegative(),
  models: z.number().int().nonnegative(),
  metadata: z.number().int().nonnegative(),
  kind: z.enum(['script', 'asset', 'mixed', 'empty']),
  roles: z.object({
    client: z.number().int().nonnegative(),
    server: z.number().int().nonnegative(),
    shared: z.number().int().nonnegative(),
    stream: z.number().int().nonnegative(),
    data: z.number().int().nonnegative(),
    html: z.number().int().nonnegative(),
    root: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
  extensions: z.array(
    z.object({
      ext: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  largest: z.array(
    z.object({
      path: z.string(),
      bytes: z.number().int().nonnegative(),
    }),
  ),
  manifest: z
    .object({
      relativePath: z.string(),
      fxVersion: z.string().nullable(),
      game: z.string().nullable(),
      author: z.string().nullable(),
      description: z.string().nullable(),
      version: z.string().nullable(),
      clientScripts: z.number().int().nonnegative(),
      serverScripts: z.number().int().nonnegative(),
      sharedScripts: z.number().int().nonnegative(),
      declaredFiles: z.number().int().nonnegative(),
      dependencies: z.array(z.string()),
      dataFiles: z.number().int().nonnegative(),
      hasUiPage: z.boolean(),
      uiPage: z.string().nullable(),
      missing: z.array(z.string()),
      missingCount: z.number().int().nonnegative(),
      unsupportedCount: z.number().int().nonnegative(),
      declaredScriptEntries: z.number().int().nonnegative(),
    })
    .nullable(),
  detection: z.object({
    scope: z.enum(['resolved', 'ambiguous', 'unsupported', 'empty']),
    confidence: z.enum(['high', 'medium', 'low']),
    projectType: z.string(),
    message: z.string().nullable(),
    candidates: z.array(
      z.object({
        relativePath: z.string(),
        directory: z.string(),
        manifestName: z.string(),
        label: z.string(),
      }),
    ),
  }),
  signals: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(['info', 'warning', 'error']),
      text: z.string(),
    }),
  ),
  git: z.object({
    available: z.boolean(),
    branch: z.string().nullable(),
    changed: z.array(z.object({ path: z.string(), status: z.string() })),
  }),
  indexedAt: z.string(),
});
export const pluginStateSchema = z.object({
  manifest: pluginManifestSchema,
  source: z.string(),
  valid: z.boolean(),
  error: z.string().nullable(),
  granted: z.array(pluginPermissionSchema),
});

export const ipcDefinitions = {
  [channels.projectsCreate]: {
    request: z
      .object({ name: z.string().trim().min(1).max(120), type: projectTypeSchema })
      .strict(),
    response: result(workspaceSchema),
  },
  [channels.projectsOpen]: { request: empty, response: result(workspaceSchema.nullable()) },
  [channels.projectsOpenPath]: {
    request: z.object({ root: z.string().min(1).max(4096) }).strict(),
    response: result(workspaceSchema),
  },
  [channels.projectsCurrent]: { request: empty, response: result(workspaceSchema.nullable()) },
  [channels.projectsRecent]: {
    request: empty,
    response: result(z.array(recentWorkspaceSchema).max(8)),
  },
  [channels.projectsRecentDetails]: {
    request: empty,
    response: result(z.array(recentWorkspaceDetailSchema).max(8)),
  },
  [channels.projectsOpenFolder]: {
    request: z.object({ root: z.string().min(1).max(4096) }).strict(),
    response: result(workspaceSchema),
  },
  [channels.projectsOpenDropped]: {
    request: z.object({ root: z.string().min(1).max(4096) }).strict(),
    response: result(workspaceSchema),
  },
  [channels.projectsImport]: { request: empty, response: result(workspaceSchema.nullable()) },
  [channels.projectsRemoveRecent]: {
    request: z.object({ root: z.string().min(1).max(4096) }).strict(),
    response: result(z.boolean()),
  },
  [channels.projectsReveal]: {
    request: z.object({ root: z.string().min(1).max(4096) }).strict(),
    response: result(z.boolean()),
  },
  [channels.projectsClose]: { request: empty, response: result(z.null()) },
  [channels.filesList]: { request: empty, response: result(z.array(resourceFileSchema)) },
  [channels.filesPickHandling]: {
    request: empty,
    response: result(
      z
        .object({ content: z.string(), relativePath: z.string(), readOnly: z.literal(false) })
        .nullable(),
    ),
  },
  [channels.filesRead]: {
    request: z.object({ relativePath: z.string().min(1).max(4096) }).strict(),
    response: result(
      z.object({ content: z.string(), relativePath: z.string(), readOnly: z.boolean() }),
    ),
  },
  [channels.filesPlanWrite]: {
    request: z
      .object({ relativePath: z.string().min(1).max(4096), source: z.string().max(2_000_000) })
      .strict(),
    response: result(changePlanSchema),
  },
  [channels.filesPlanCreateHandling]: {
    request: z
      .object({ relativePath: z.string().min(1).max(4096), source: z.string().max(2_000_000) })
      .strict(),
    response: result(changePlanSchema),
  },
  [channels.filesApplyWrite]: {
    request: z.object({ planId: z.uuid() }).strict(),
    response: result(
      z.object({ target: z.string(), backup: z.string().nullable(), bytes: z.number() }),
    ),
  },
  [channels.manifestLoad]: {
    request: empty,
    response: result(
      z.object({ source: z.string(), parsed: manifestSchema, relativePath: z.string() }).nullable(),
    ),
  },
  [channels.manifestPlan]: {
    request: z.object({ source: z.string().max(2_000_000) }).strict(),
    response: result(changePlanSchema),
  },
  [channels.manifestApply]: {
    request: z.object({ planId: z.uuid() }).strict(),
    response: result(
      z.object({ target: z.string(), backup: z.string().nullable(), bytes: z.number() }),
    ),
  },
  [channels.auditRun]: { request: empty, response: result(z.array(findingSchema)) },
  [channels.packagePreview]: {
    request: z
      .object({
        includes: z.array(z.string().max(256)).max(100),
        excludes: z.array(z.string().max(256)).max(100),
      })
      .strict(),
    response: result(packagePreviewSchema),
  },
  [channels.packageBuild]: {
    request: z
      .object({
        includes: z.array(z.string().max(256)).max(100),
        excludes: z.array(z.string().max(256)).max(100),
        archiveName: z
          .string()
          .regex(/^[a-zA-Z0-9._-]+$/)
          .max(128),
      })
      .strict(),
    response: result(jobSchema.nullable()),
  },
  [channels.workspaceSummary]: { request: empty, response: result(workspaceSummarySchema) },
  [channels.analysisRun]: { request: empty, response: result(resourceAnalysisSchema) },
  [channels.analysisExport]: {
    request: z.object({ analysis: resourceAnalysisSchema }).strict(),
    response: result(z.string().nullable()),
  },
  [channels.workbenchExport]: {
    request: z
      .object({
        kind: z.enum(['prop', 'clothing', 'weapon', 'vehicle', 'pulse']),
        name: z.string().min(1).max(120),
        data: z.record(z.string(), z.unknown()),
      })
      .strict(),
    response: result(z.string().nullable()),
  },
  [channels.pluginsList]: { request: empty, response: result(z.array(pluginStateSchema)) },
  [channels.pluginsGrant]: {
    request: z
      .object({ pluginId: z.string(), permissions: z.array(pluginPermissionSchema) })
      .strict(),
    response: result(z.array(pluginPermissionSchema)),
  },
  [channels.pluginsOpenFolder]: { request: empty, response: result(z.string()) },
  [channels.jobsList]: { request: empty, response: result(z.array(jobSchema)) },
  [channels.jobsCancel]: {
    request: z.object({ id: z.string() }).strict(),
    response: result(z.boolean()),
  },
  [channels.settingsGet]: { request: empty, response: result(preferenceValueSchema) },
  [channels.settingsSet]: {
    // Normalize legacy or partial preference blobs before validating the write.
    request: preferenceRequestSchema,
    response: result(preferenceValueSchema),
  },
  [channels.aiChatStart]: {
    request: aiChatRequestSchema,
    response: result(z.object({ runId: z.string().min(1).max(160) }).strict()),
  },
  [channels.aiChatCancel]: {
    request: z.object({ runId: z.string().min(1).max(160) }).strict(),
    response: result(z.boolean()),
  },
  [channels.aiPlanProposal]: {
    request: z.object({ proposal: aiChangeProposalSchema }).strict(),
    response: result(
      z
        .array(z.object({ relativePath: z.string(), planId: z.uuid() }).strict())
        .min(1)
        .max(20),
    ),
  },
  [channels.aiApplyProposal]: {
    request: z.object({ planIds: z.array(z.uuid()).min(1).max(20) }).strict(),
    response: result(
      z.array(
        z
          .object({
            target: z.string(),
            backup: z.string().nullable(),
            bytes: z.number(),
          })
          .strict(),
      ),
    ),
  },
  [channels.accountStatus]: { request: empty, response: result(accountStatusSchema) },
  [channels.accountSignIn]: { request: empty, response: result(z.boolean()) },
  [channels.accountSignOut]: { request: empty, response: result(z.boolean()) },
  [channels.accountCheckout]: {
    request: z
      .object({ plan: z.enum(['creator', 'pro']), interval: z.enum(['month', 'year']) })
      .strict(),
    response: result(z.boolean()),
  },
  [channels.accountPortal]: { request: empty, response: result(z.boolean()) },
  [channels.updatesStatus]: { request: empty, response: result(updateStatusSchema) },
  [channels.updatesCheck]: { request: empty, response: result(updateStatusSchema) },
  [channels.updatesDownload]: { request: empty, response: result(updateStatusSchema) },
  [channels.updatesInstall]: { request: empty, response: result(z.boolean()) },
  [channels.reportsStatus]: {
    request: empty,
    response: result(
      z.object({
        configured: z.boolean(),
        repository: z.string().nullable(),
        appVersion: z.string(),
        logCount: z.number().int().nonnegative(),
      }),
    ),
  },
  [channels.reportsSubmit]: {
    request: z
      .object({
        reportType: reportTypeSchema,
        title: z.string().trim().min(4).max(120),
        description: z.string().trim().min(10).max(8_000),
        steps: z.string().trim().max(8_000),
        includeDiagnostics: z.boolean(),
      })
      .strict(),
    response: result(z.object({ issueNumber: z.number().int().positive(), issueUrl: z.url() })),
  },
  [channels.reportsRecordClientError]: {
    request: z
      .object({
        message: z.string().trim().min(1).max(2_000),
        stack: z.string().max(8_000).nullable(),
      })
      .strict(),
    response: result(z.boolean()),
  },
  [channels.systemColorScheme]: { request: empty, response: result(systemColorModeSchema) },
  [channels.systemWindow]: {
    request: z.object({ action: z.enum(['minimize', 'maximize', 'close']) }).strict(),
    response: result(z.boolean()),
  },
  [channels.systemExternal]: {
    request: z.object({ url: z.url().max(2048) }).strict(),
    response: result(z.boolean()),
  },
} as const;
export type Channel = keyof typeof ipcDefinitions;
export type IpcRequest<C extends Channel> = z.infer<(typeof ipcDefinitions)[C]['request']>;
export type IpcResponse<C extends Channel> = z.infer<(typeof ipcDefinitions)[C]['response']>;

export interface CortexApi {
  projects: {
    create(input: IpcRequest<'projects:create'>): Promise<IpcResponse<'projects:create'>>;
    open(): Promise<IpcResponse<'projects:open'>>;
    openPath(input: IpcRequest<'projects:open-path'>): Promise<IpcResponse<'projects:open-path'>>;
    current(): Promise<IpcResponse<'projects:current'>>;
    recent(): Promise<IpcResponse<'projects:recent'>>;
    recentDetails(): Promise<IpcResponse<'projects:recent-details'>>;
    openFolder(
      input: IpcRequest<'projects:open-folder'>,
    ): Promise<IpcResponse<'projects:open-folder'>>;
    openDropped(file: File): Promise<IpcResponse<'projects:open-dropped'>>;
    import(): Promise<IpcResponse<'projects:import'>>;
    removeRecent(
      input: IpcRequest<'projects:remove-recent'>,
    ): Promise<IpcResponse<'projects:remove-recent'>>;
    reveal(input: IpcRequest<'projects:reveal'>): Promise<IpcResponse<'projects:reveal'>>;
    close(): Promise<IpcResponse<'projects:close'>>;
  };
  files: {
    list(): Promise<IpcResponse<'files:list'>>;
    pickHandling(): Promise<IpcResponse<'files:pick-handling'>>;
    read(input: IpcRequest<'files:read'>): Promise<IpcResponse<'files:read'>>;
    planWrite(input: IpcRequest<'files:plan-write'>): Promise<IpcResponse<'files:plan-write'>>;
    planCreateHandling(
      input: IpcRequest<'files:plan-create-handling'>,
    ): Promise<IpcResponse<'files:plan-create-handling'>>;
    applyWrite(input: IpcRequest<'files:apply-write'>): Promise<IpcResponse<'files:apply-write'>>;
  };
  resources: {
    loadManifest(): Promise<IpcResponse<'manifest:load'>>;
    audit(): Promise<IpcResponse<'audit:run'>>;
    previewPackage(input: IpcRequest<'package:preview'>): Promise<IpcResponse<'package:preview'>>;
    buildPackage(input: IpcRequest<'package:build'>): Promise<IpcResponse<'package:build'>>;
    summary(): Promise<IpcResponse<'workspace:summary'>>;
    analyze(): Promise<IpcResponse<'analysis:run'>>;
    exportAnalysis(input: IpcRequest<'analysis:export'>): Promise<IpcResponse<'analysis:export'>>;
    exportWorkbench(
      input: IpcRequest<'workbench:export'>,
    ): Promise<IpcResponse<'workbench:export'>>;
  };
  plugins: {
    list(): Promise<IpcResponse<'plugins:list'>>;
    grant(input: IpcRequest<'plugins:grant'>): Promise<IpcResponse<'plugins:grant'>>;
    openFolder(): Promise<IpcResponse<'plugins:open-folder'>>;
  };
  changes: {
    planManifest(input: IpcRequest<'manifest:plan'>): Promise<IpcResponse<'manifest:plan'>>;
    applyManifest(input: IpcRequest<'manifest:apply'>): Promise<IpcResponse<'manifest:apply'>>;
  };
  jobs: {
    list(): Promise<IpcResponse<'jobs:list'>>;
    cancel(input: IpcRequest<'jobs:cancel'>): Promise<IpcResponse<'jobs:cancel'>>;
  };
  settings: {
    get(): Promise<IpcResponse<'settings:get'>>;
    set(input: IpcRequest<'settings:set'>): Promise<IpcResponse<'settings:set'>>;
  };
  ai: {
    startChat(input: IpcRequest<'ai:chat-start'>): Promise<IpcResponse<'ai:chat-start'>>;
    cancelChat(input: IpcRequest<'ai:chat-cancel'>): Promise<IpcResponse<'ai:chat-cancel'>>;
    planProposal(input: IpcRequest<'ai:plan-proposal'>): Promise<IpcResponse<'ai:plan-proposal'>>;
    applyProposal(
      input: IpcRequest<'ai:apply-proposal'>,
    ): Promise<IpcResponse<'ai:apply-proposal'>>;
    onStream(listener: (event: AiStreamEvent) => void): () => void;
  };
  account: {
    status(): Promise<IpcResponse<'account:status'>>;
    signIn(): Promise<IpcResponse<'account:sign-in'>>;
    signOut(): Promise<IpcResponse<'account:sign-out'>>;
    checkout(input: IpcRequest<'account:checkout'>): Promise<IpcResponse<'account:checkout'>>;
    portal(): Promise<IpcResponse<'account:portal'>>;
    onChanged(listener: (status: AccountStatus) => void): () => void;
  };
  updates: {
    status(): Promise<IpcResponse<'updates:status'>>;
    check(): Promise<IpcResponse<'updates:check'>>;
    download(): Promise<IpcResponse<'updates:download'>>;
    install(): Promise<IpcResponse<'updates:install'>>;
    onStatusChanged(listener: (status: UpdateStatus) => void): () => void;
  };
  reports: {
    status(): Promise<IpcResponse<'reports:status'>>;
    submit(input: IpcRequest<'reports:submit'>): Promise<IpcResponse<'reports:submit'>>;
    recordClientError(
      input: IpcRequest<'reports:record-client-error'>,
    ): Promise<IpcResponse<'reports:record-client-error'>>;
  };
  system: {
    colorScheme(): Promise<IpcResponse<'system:color-scheme'>>;
    onColorSchemeChanged(listener: (mode: SystemColorMode) => void): () => void;
    window(input: IpcRequest<'system:window'>): Promise<IpcResponse<'system:window'>>;
    openExternal(input: IpcRequest<'system:external'>): Promise<IpcResponse<'system:external'>>;
  };
}
