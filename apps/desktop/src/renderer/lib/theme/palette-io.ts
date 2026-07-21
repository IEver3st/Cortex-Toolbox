import type { Preferences } from '../../../shared/contracts';
import {
  THEME_SCHEMA_VERSION,
  type StoredPalette,
  type ThemeExport,
  type TokenOverrides,
} from '../../../shared/theme-schema';
import { resolveThemeTokens } from './resolve';

export interface ThemeChange {
  id: string;
  label: string;
  field: string;
  before: string;
  after: string;
  sectionId?: string | undefined;
}

export function exportPaletteFromPreferences(
  preferences: Preferences,
  name: string,
  description?: string,
): ThemeExport {
  const dark = resolveThemeTokens(preferences, 'dark');
  const light = resolveThemeTokens(preferences, 'light');
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    name,
    description,
    modeSupport: 'dual',
    dark: {
      signal: dark.signal,
      canvas: dark.canvas,
      surface: dark.surface,
      rail: dark.rail,
      ink: dark.ink,
      mutedInk: dark.mutedInk,
      outline: dark.outline,
      editorCanvas: dark.editorCanvas,
      success: dark.success,
      warning: dark.warning,
      error: dark.error,
      informational: dark.informational,
      diffAddition: dark.diffAddition,
      diffRemoval: dark.diffRemoval,
      syntaxSelection: dark.syntaxSelection,
    },
    light: {
      signal: light.signal,
      canvas: light.canvas,
      surface: light.surface,
      rail: light.rail,
      ink: light.ink,
      mutedInk: light.mutedInk,
      outline: light.outline,
      editorCanvas: light.editorCanvas,
      success: light.success,
      warning: light.warning,
      error: light.error,
      informational: light.informational,
      diffAddition: light.diffAddition,
      diffRemoval: light.diffRemoval,
      syntaxSelection: light.syntaxSelection,
    },
  };
}

export function storedPaletteFromExport(
  palette: ThemeExport,
  source: StoredPalette['source'],
): StoredPalette {
  return {
    id: crypto.randomUUID(),
    name: palette.name,
    description: palette.description,
    source,
    modeSupport: palette.modeSupport,
    createdAt: new Date().toISOString(),
    light: palette.light,
    dark: palette.dark,
  };
}

export function diffPreferences(before: Preferences, after: Preferences): ThemeChange[] {
  const changes: ThemeChange[] = [];
  const push = (field: string, label: string, from: unknown, to: unknown, sectionId?: string) => {
    if (from === to) return;
    changes.push({
      id: field,
      label,
      field,
      before: String(from),
      after: String(to),
      sectionId,
    });
  };

  push('colorMode', 'Interface mode', before.colorMode, after.colorMode, 'interface-mode');
  push('themePreset', 'Palette', before.themePreset, after.themePreset, 'palette');
  push(
    'interfaceContrast',
    'Contrast',
    before.interfaceContrast,
    after.interfaceContrast,
    'readability',
  );
  push(
    'interfaceFont',
    'Interface typeface',
    before.interfaceFont,
    after.interfaceFont,
    'typography',
  );
  push('codeFont', 'Code typeface', before.codeFont, after.codeFont, 'typography');

  const mode = after.colorMode === 'dark' ? 'dark' : 'light';
  const tokenMode = mode === 'dark' ? 'dark' : 'light';
  const beforeOverrides = before.themeOverrides?.[tokenMode] ?? {};
  const afterOverrides = after.themeOverrides?.[tokenMode] ?? {};
  for (const key of Object.keys(afterOverrides) as (keyof TokenOverrides)[]) {
    const from = beforeOverrides[key];
    const to = afterOverrides[key];
    if (from !== to && to) {
      changes.push({
        id: `token-${key}`,
        label: key,
        field: key,
        before: from ?? 'default',
        after: to,
        sectionId: 'foundation',
      });
    }
  }

  return changes;
}
