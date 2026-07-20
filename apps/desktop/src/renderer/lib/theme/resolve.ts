import type { Preferences } from '../../../shared/contracts';
import {
  isBuiltinPaletteId,
  type FullThemeTokens,
  type StoredPalette,
  type ThemeOverrides,
  type TokenOverrides,
} from '../../../shared/theme-schema';
import { builtinPaletteMeta, resolveBuiltinTokens } from './builtins';
import { applyContrastProtection, applyInterfaceContrast } from './contrast';

export function resolvedColorMode(colorMode: Preferences['colorMode']): 'light' | 'dark' {
  if (colorMode !== 'system') return colorMode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function mergeTokens(base: FullThemeTokens, overrides?: TokenOverrides): FullThemeTokens {
  if (!overrides) return base;
  return { ...base, ...overrides };
}

function resolveStoredPaletteTokens(
  palette: StoredPalette,
  mode: 'light' | 'dark',
): FullThemeTokens | null {
  const variant = mode === 'light' ? palette.light : palette.dark;
  if (!variant) return null;
  const base = resolveBuiltinTokens('everforest', mode);
  return mergeTokens(base, variant as TokenOverrides);
}

export function resolveActivePaletteId(preferences: Preferences): string {
  return preferences.selectedPaletteId ?? preferences.themePreset;
}

export function resolveBasePaletteId(preferences: Preferences): string {
  if (preferences.themeOverrides?.basePaletteId) {
    return preferences.themeOverrides.basePaletteId;
  }
  const active = resolveActivePaletteId(preferences);
  if (isBuiltinPaletteId(active)) return active;
  const custom = preferences.customPalettes.find((palette) => palette.id === active);
  return custom ? preferences.themePreset : preferences.themePreset;
}

export function resolveThemeTokens(
  preferences: Preferences,
  mode: 'light' | 'dark',
): FullThemeTokens {
  const activeId = resolveActivePaletteId(preferences);
  let tokens: FullThemeTokens;

  if (isBuiltinPaletteId(activeId)) {
    tokens = resolveBuiltinTokens(activeId, mode);
  } else {
    const custom = preferences.customPalettes.find((palette) => palette.id === activeId);
    tokens =
      custom && resolveStoredPaletteTokens(custom, mode)
        ? resolveStoredPaletteTokens(custom, mode)!
        : resolveBuiltinTokens(preferences.themePreset, mode);
  }

  const overrides =
    mode === 'light' ? preferences.themeOverrides?.light : preferences.themeOverrides?.dark;
  tokens = mergeTokens(tokens, overrides);

  const contrastAdjusted = applyInterfaceContrast(
    { ink: tokens.ink, mutedInk: tokens.mutedInk, outline: tokens.outline },
    preferences.interfaceContrast,
    preferences.interfaceContrastFine,
  );
  tokens = { ...tokens, ...contrastAdjusted };

  const protectedInk = applyContrastProtection(
    tokens.ink,
    tokens.mutedInk,
    tokens.canvas,
    preferences.protectTextContrast,
  );
  tokens = { ...tokens, ...protectedInk };

  return tokens;
}

export function isCustomizedPalette(preferences: Preferences): boolean {
  if (preferences.themeOverrides) {
    const { light, dark } = preferences.themeOverrides;
    if (light && Object.keys(light).length > 0) return true;
    if (dark && Object.keys(dark).length > 0) return true;
  }
  const active = resolveActivePaletteId(preferences);
  return !isBuiltinPaletteId(active);
}

export function paletteDisplayName(preferences: Preferences): string {
  if (isCustomizedPalette(preferences)) {
    const base = builtinPaletteMeta(
      isBuiltinPaletteId(resolveBasePaletteId(preferences))
        ? (resolveBasePaletteId(
            preferences,
          ) as import('../../../shared/theme-schema').BuiltinPaletteId)
        : 'everforest',
    );
    return `Custom · based on ${base.name}`;
  }
  const active = resolveActivePaletteId(preferences);
  if (isBuiltinPaletteId(active)) return builtinPaletteMeta(active).name;
  return preferences.customPalettes.find((palette) => palette.id === active)?.name ?? 'Custom';
}

export function createOverridesFromPreferences(preferences: Preferences): ThemeOverrides | null {
  return preferences.themeOverrides;
}
