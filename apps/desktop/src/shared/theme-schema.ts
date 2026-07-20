import { z } from 'zod';

export const THEME_SCHEMA_VERSION = 1;

export const FOUNDATION_TOKEN_KEYS = [
  'signal',
  'canvas',
  'surface',
  'rail',
  'ink',
  'mutedInk',
  'outline',
  'editorCanvas',
] as const;

export const ADVANCED_TOKEN_KEYS = [
  'success',
  'warning',
  'error',
  'informational',
  'diffAddition',
  'diffRemoval',
  'syntaxSelection',
] as const;

export type FoundationTokenKey = (typeof FOUNDATION_TOKEN_KEYS)[number];
export type AdvancedTokenKey = (typeof ADVANCED_TOKEN_KEYS)[number];
export type ThemeTokenKey = FoundationTokenKey | AdvancedTokenKey;

export type InterfaceContrast = 'soft' | 'balanced' | 'crisp' | 'maximum';
export type PaletteSource = 'builtin' | 'custom' | 'imported';
export type PaletteModeSupport = 'light' | 'dark' | 'dual';

const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Invalid hex color');

const foundationTokensSchema = z.object({
  signal: hexColorSchema,
  canvas: hexColorSchema,
  surface: hexColorSchema,
  rail: hexColorSchema,
  ink: hexColorSchema,
  mutedInk: hexColorSchema,
  outline: hexColorSchema,
  editorCanvas: hexColorSchema,
});

const advancedTokensSchema = z.object({
  success: hexColorSchema,
  warning: hexColorSchema,
  error: hexColorSchema,
  informational: hexColorSchema,
  diffAddition: hexColorSchema,
  diffRemoval: hexColorSchema,
  syntaxSelection: hexColorSchema,
});

const tokenOverridesSchema = z
  .object({
    ...Object.fromEntries(FOUNDATION_TOKEN_KEYS.map((key) => [key, hexColorSchema.optional()])),
    ...Object.fromEntries(ADVANCED_TOKEN_KEYS.map((key) => [key, hexColorSchema.optional()])),
  })
  .strict();

export const wallpaperBlendSchema = z.object({
  enabled: z.boolean(),
  blurStrength: z.number().min(0).max(100),
  wallpaperInfluence: z.number().min(0).max(100),
  tintStrength: z.number().min(0).max(100),
  saturation: z.number().min(0).max(100),
  sidebarOpacity: z.number().min(0).max(100),
  noiseTexture: z.boolean(),
  reduceWhenInactive: z.boolean(),
});

export const DEFAULT_WALLPAPER_BLEND = {
  enabled: false,
  blurStrength: 48,
  wallpaperInfluence: 62,
  tintStrength: 28,
  saturation: 72,
  sidebarOpacity: 78,
  noiseTexture: true,
  reduceWhenInactive: true,
} as const;

export const storedPaletteSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(240).optional(),
  source: z.enum(['custom', 'imported']),
  modeSupport: z.enum(['light', 'dark', 'dual']),
  createdAt: z.string(),
  light: foundationTokensSchema.merge(advancedTokensSchema.partial()).optional(),
  dark: foundationTokensSchema.merge(advancedTokensSchema.partial()),
});

export const themeOverridesSchema = z.object({
  basePaletteId: z.string().min(1).max(64),
  light: tokenOverridesSchema.optional(),
  dark: tokenOverridesSchema.optional(),
});

export const themeExportSchema = z.object({
  schemaVersion: z.literal(THEME_SCHEMA_VERSION),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(240).optional(),
  modeSupport: z.enum(['light', 'dark', 'dual']),
  light: foundationTokensSchema.merge(advancedTokensSchema.partial()).optional(),
  dark: foundationTokensSchema.merge(advancedTokensSchema.partial()),
});

export type FoundationTokens = z.infer<typeof foundationTokensSchema>;
export type AdvancedTokens = z.infer<typeof advancedTokensSchema>;
export type FullThemeTokens = FoundationTokens & AdvancedTokens;
export type TokenOverrides = z.infer<typeof tokenOverridesSchema>;
export type WallpaperBlendSettings = z.infer<typeof wallpaperBlendSchema>;
export type StoredPalette = z.infer<typeof storedPaletteSchema>;
export type ThemeOverrides = z.infer<typeof themeOverridesSchema>;
export type ThemeExport = z.infer<typeof themeExportSchema>;

export const BUILTIN_PALETTE_IDS = [
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
] as const;

export type BuiltinPaletteId = (typeof BUILTIN_PALETTE_IDS)[number];

export function isBuiltinPaletteId(value: string): value is BuiltinPaletteId {
  return (BUILTIN_PALETTE_IDS as readonly string[]).includes(value);
}

export function normalizeHexColor(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const parsed = hexColorSchema.safeParse(withHash);
  if (!parsed.success) return null;
  if (withHash.length === 4) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return withHash.toLowerCase();
}

export function parseThemeImport(raw: unknown):
  | {
      ok: true;
      palette: ThemeExport;
    }
  | {
      ok: false;
      error: string;
    } {
  const parsed = themeExportSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid palette file.' };
  }
  if (parsed.data.modeSupport === 'light' && !parsed.data.light) {
    return { ok: false, error: 'Light-only palettes must include light tokens.' };
  }
  return { ok: true, palette: parsed.data };
}
