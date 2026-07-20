import { describe, expect, it } from 'vitest';
import {
  channels,
  DEFAULT_PREFERENCES,
  ipcDefinitions,
  normalizePreferences,
  preferenceSchema,
  preferenceValueSchema,
} from './contracts';

describe('IPC contracts', () => {
  it('rejects unknown renderer properties', () =>
    expect(
      ipcDefinitions[channels.projectsCreate].request.safeParse({
        name: 'x',
        type: 'script',
        command: 'calc.exe',
      }).success,
    ).toBe(false));
  it('bounds package rules', () =>
    expect(
      ipcDefinitions[channels.packagePreview].request.safeParse({
        includes: new Array(101).fill('*'),
        excludes: [],
      }).success,
    ).toBe(false));
});

describe('preference migration', () => {
  it('settings:set request normalizes legacy preference blobs', () => {
    const legacy = {
      interfaceScale: 1,
      reducedMotion: false,
      editorFontSize: 14,
    };
    const parsed = ipcDefinitions[channels.settingsSet].request.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        ...DEFAULT_PREFERENCES,
        ...legacy,
      });
    }
  });

  it('fills experimentalTools when older stores omit it', () => {
    const legacy = {
      interfaceScale: 1.1,
      reducedMotion: true,
      editorFontSize: 16,
    };
    expect(normalizePreferences(legacy)).toEqual({
      ...DEFAULT_PREFERENCES,
      ...legacy,
    });
    expect(preferenceSchema.safeParse(legacy).success).toBe(false);
    expect(preferenceValueSchema.safeParse(legacy)).toEqual({
      success: true,
      data: {
        ...DEFAULT_PREFERENCES,
        ...legacy,
      },
    });
  });

  it('settings:get response accepts legacy preference blobs', () => {
    const response = {
      ok: true as const,
      data: {
        interfaceScale: 1,
        reducedMotion: false,
        editorFontSize: 14,
      },
    };
    const parsed = ipcDefinitions[channels.settingsGet].response.safeParse(response);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.ok) {
      expect(parsed.data.data).toEqual(DEFAULT_PREFERENCES);
    }
  });

  it('recovers from invalid field types without throwing', () => {
    expect(
      normalizePreferences({
        interfaceScale: 'huge',
        reducedMotion: 'yes',
        editorFontSize: 99,
        experimentalTools: 'on',
      }),
    ).toEqual(DEFAULT_PREFERENCES);
  });

  it('falls back to defaults for null, arrays, and primitives', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences([])).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences('nope')).toEqual(DEFAULT_PREFERENCES);
  });

  it('accepts a legacy on-disk store when enabling chassis', () => {
    const legacy = {
      interfaceScale: 1,
      reducedMotion: false,
      editorFontSize: 13,
      experimentalTools: false,
      releaseBranch: 'developer',
      installedModules: [
        'sentinel',
        'extensions',
        'align',
        'pulse',
        'chevron',
        'textures',
        'chassis',
      ],
    };
    const normalized = normalizePreferences(legacy);
    expect(preferenceSchema.strict().safeParse(normalized).success).toBe(true);
  });

  it('preserves theme overrides and wallpaper material settings through normalization', () => {
    const themed = {
      ...DEFAULT_PREFERENCES,
      themePreset: 'blueprint' as const,
      selectedPaletteId: 'blueprint',
      themeOverrides: {
        basePaletteId: 'blueprint',
        dark: { canvas: '#101820', editorCanvas: '#0c131a' },
        light: { signal: '#28748a' },
      },
      wallpaperBlendDark: {
        ...DEFAULT_PREFERENCES.wallpaperBlendDark,
        enabled: true,
        blurStrength: 33,
        wallpaperInfluence: 81,
        tintStrength: 17,
        saturation: 64,
        sidebarOpacity: 73,
      },
    };

    expect(normalizePreferences(themed)).toEqual(themed);
    expect(ipcDefinitions[channels.settingsSet].request.safeParse(themed)).toEqual({
      success: true,
      data: themed,
    });
  });
});
