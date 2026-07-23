import { z } from 'zod';

/** Installable workbench modules — maps to editor tab kinds except core chrome. */
export const moduleIdSchema = z.enum([
  'index',
  'sentinel',
  'probe',
  'wire',
  'bundle',
  'chassis',
  'align',
  'pulse',
  'chevron',
  'extensions',
]);

export type ModuleId = z.infer<typeof moduleIdSchema>;

export const moduleCategorySchema = z.enum(['workflow', 'creative', 'system']);

export type ModuleCategory = z.infer<typeof moduleCategorySchema>;

export interface ModuleDefinition {
  id: ModuleId;
  /** Editor tab kind opened by this module. */
  kind: ModuleId | 'extensions';
  name: string;
  shortName: string;
  description: string;
  category: ModuleCategory;
  required: boolean;
  defaultInstalled: boolean;
  workspaceRequired: boolean;
  navLabel: string;
  tabLabel: string;
  subtitle?: string;
  tags: string[];
}

export const MODULE_CATALOG: ModuleDefinition[] = [
  {
    id: 'index',
    kind: 'index',
    name: 'Index',
    shortName: 'Index',
    description: 'Edit fxmanifest.lua with safe, reviewed writes and declaration helpers.',
    category: 'workflow',
    required: false,
    defaultInstalled: true,
    workspaceRequired: true,
    navLabel: 'Index',
    tabLabel: 'Index',
    tags: ['declarations', 'fxmanifest'],
  },
  {
    id: 'sentinel',
    kind: 'sentinel',
    name: 'Sentinel',
    shortName: 'Sentinel',
    description: 'Validate paths, manifests, hygiene, and release risks without executing code.',
    category: 'workflow',
    required: false,
    defaultInstalled: true,
    workspaceRequired: true,
    navLabel: 'Sentinel',
    tabLabel: 'Sentinel',
    tags: ['audit', 'validation', 'hygiene'],
  },
  {
    id: 'probe',
    kind: 'probe',
    name: 'Probe',
    shortName: 'Probe',
    description: 'Find loop abuse, missing waits, risky events, and potentially unused assets.',
    category: 'workflow',
    required: false,
    defaultInstalled: true,
    workspaceRequired: true,
    navLabel: 'Probe',
    tabLabel: 'Probe',
    tags: ['audit', 'lua', 'javascript', 'performance'],
  },
  {
    id: 'wire',
    kind: 'wire',
    name: 'Wire',
    shortName: 'Wire',
    description: 'Map functions, events, exports, commands, and callers with an embedded editor.',
    category: 'workflow',
    required: false,
    defaultInstalled: true,
    workspaceRequired: true,
    navLabel: 'Wire',
    tabLabel: 'Wire',
    tags: ['graph', 'editor', 'functions', 'contracts'],
  },
  {
    id: 'bundle',
    kind: 'bundle',
    name: 'Bundle',
    shortName: 'Bundle',
    description: 'Structure resource files, generate a manifest, preview, and export a clean ZIP.',
    category: 'workflow',
    required: false,
    defaultInstalled: true,
    workspaceRequired: true,
    navLabel: 'Bundle',
    tabLabel: 'Bundle',
    tags: ['yft', 'ytd', 'meta', 'lua', 'zip'],
  },
  {
    id: 'chassis',
    kind: 'chassis',
    name: 'Chassis',
    shortName: 'Chassis',
    description: 'Generate, import, validate, merge, and edit linked GTA V vehicle metadata.',
    category: 'creative',
    required: false,
    defaultInstalled: true,
    workspaceRequired: false,
    navLabel: 'Chassis',
    tabLabel: 'Chassis',
    tags: ['vehicles.meta', 'handling.meta', 'carcols', 'merge'],
  },
  {
    id: 'align',
    kind: 'align',
    name: 'Align',
    shortName: 'Align',
    description: 'Diagnose and repair renamed models, siren IDs, light IDs, and modkit bindings.',
    category: 'creative',
    required: false,
    defaultInstalled: true,
    workspaceRequired: false,
    navLabel: 'Align',
    tabLabel: 'Align metadata repair',
    tags: ['repair', 'carcols', 'carvariations', 'rename'],
  },
  {
    id: 'pulse',
    kind: 'pulse',
    name: 'Pulse',
    shortName: 'Pulse',
    description: 'Design 24-channel, 32-step light patterns with live playback and carcols export.',
    category: 'creative',
    required: false,
    defaultInstalled: true,
    workspaceRequired: false,
    navLabel: 'Pulse',
    tabLabel: 'Pulse siren patterns',
    tags: ['sirens', 'carcols', 'sequencer', 'xml'],
  },
  {
    id: 'chevron',
    kind: 'chevron',
    name: 'Chevron Builder',
    shortName: 'Chevron',
    description:
      'Build mirrored emergency, highway, and fleet warning panels with exact geometry and PNG export.',
    category: 'creative',
    required: false,
    defaultInstalled: true,
    workspaceRequired: false,
    navLabel: 'Chevron',
    tabLabel: 'Chevron Builder',
    tags: ['livery', 'chevrons', 'png', 'fleet'],
  },
  {
    id: 'extensions',
    kind: 'extensions',
    name: 'Extensions preview',
    shortName: 'Extensions',
    description:
      'Inspect workspace plugin manifests and requested permissions. Extension code does not run.',
    category: 'system',
    required: false,
    defaultInstalled: false,
    workspaceRequired: true,
    navLabel: 'Extensions preview',
    tabLabel: 'Extensions preview',
    tags: ['plugins', 'manifest', 'experimental'],
  },
];

export const MODULE_BY_ID = Object.fromEntries(
  MODULE_CATALOG.map((module) => [module.id, module]),
) as Record<ModuleId, ModuleDefinition>;

export function defaultInstalledModuleIds(): ModuleId[] {
  return MODULE_CATALOG.filter((module) => module.defaultInstalled).map((module) => module.id);
}

export function normalizeInstalledModules(raw: unknown): ModuleId[] {
  if (!Array.isArray(raw)) return defaultInstalledModuleIds();
  const migrations: Record<string, ModuleId[]> = {
    audit: ['sentinel'],
    analysis: ['probe', 'wire'],
    package: ['bundle'],
    vehicles: ['chassis', 'align', 'pulse'],
    manifest: ['index'],
    'code-smith': ['probe'],
    lattice: ['wire'],
    packbench: ['bundle'],
    metaforge: ['chassis'],
    concord: ['align'],
    blinklab: ['pulse'],
  };
  const seen = new Set<ModuleId>();
  const next: ModuleId[] = [];
  for (const entry of raw) {
    const candidates = typeof entry === 'string' ? (migrations[entry] ?? [entry]) : [];
    for (const candidate of candidates) {
      const parsed = moduleIdSchema.safeParse(candidate);
      if (!parsed.success || seen.has(parsed.data)) continue;
      seen.add(parsed.data);
      next.push(parsed.data);
    }
  }
  return next.length > 0 ? next : defaultInstalledModuleIds();
}

export function isModuleInstalled(installed: ModuleId[], id: ModuleId): boolean {
  return installed.includes(id);
}
