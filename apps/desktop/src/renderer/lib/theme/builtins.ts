import type {
  AdvancedTokens,
  BuiltinPaletteId,
  FoundationTokens,
  FullThemeTokens,
  PaletteModeSupport,
} from '../../../shared/theme-schema';

export interface BuiltinPaletteMeta {
  id: BuiltinPaletteId;
  name: string;
  description: string;
  source: 'builtin';
  modeSupport: PaletteModeSupport;
  swatches: [string, string, string, string];
}

interface BuiltinPaletteDefinition {
  meta: BuiltinPaletteMeta;
  dark: FoundationTokens;
  light: FoundationTokens;
}

const DARK_ADVANCED: AdvancedTokens = {
  success: '#a7c080',
  warning: '#dbbc7f',
  error: '#e67e80',
  informational: '#7fbbb3',
  diffAddition: '#83c092',
  diffRemoval: '#e67e80',
  syntaxSelection: '#475258',
};

const LIGHT_ADVANCED: AdvancedTokens = {
  success: '#5f8a42',
  warning: '#a97820',
  error: '#c45153',
  informational: '#3f817b',
  diffAddition: '#3f8057',
  diffRemoval: '#c45153',
  syntaxSelection: '#dfe6dd',
};

const DEFINITIONS: Record<BuiltinPaletteId, BuiltinPaletteDefinition> = {
  everforest: define(
    'everforest',
    'Everforest',
    'Warm graphite with calm green emphasis',
    {
      signal: '#a7c080',
      canvas: '#2d353b',
      surface: '#343f44',
      rail: '#232a2e',
      ink: '#d3c6aa',
      mutedInk: '#a1aca4',
      outline: '#4a5650',
      editorCanvas: '#2b3338',
    },
    {
      signal: '#6b8f4e',
      canvas: '#f7f8f5',
      surface: '#ffffff',
      rail: '#e7eae5',
      ink: '#202620',
      mutedInk: '#68736a',
      outline: '#c8d0c4',
      editorCanvas: '#f3f5f1',
    },
  ),
  graphite: define(
    'graphite',
    'Graphite',
    'Neutral surfaces with steel-blue focus',
    {
      signal: '#8ea9bc',
      canvas: '#2b2e30',
      surface: '#35393b',
      rail: '#222527',
      ink: '#e0e1dc',
      mutedInk: '#a7acae',
      outline: '#50575a',
      editorCanvas: '#272a2c',
    },
    {
      signal: '#5f7f96',
      canvas: '#f4f5f3',
      surface: '#ffffff',
      rail: '#e5e7e6',
      ink: '#25282a',
      mutedInk: '#687075',
      outline: '#c7ccce',
      editorCanvas: '#eff1f0',
    },
  ),
  cobalt: define(
    'cobalt',
    'Cobalt',
    'Deep ink with confident cobalt controls',
    {
      signal: '#74a7ff',
      canvas: '#29323d',
      surface: '#333e4a',
      rail: '#202833',
      ink: '#dde5eb',
      mutedInk: '#a4b0bc',
      outline: '#4a5867',
      editorCanvas: '#252d37',
    },
    {
      signal: '#3f74d8',
      canvas: '#f4f6f9',
      surface: '#ffffff',
      rail: '#e5eaf1',
      ink: '#202936',
      mutedInk: '#657386',
      outline: '#c5cfdb',
      editorCanvas: '#eef2f7',
    },
  ),
  ocean: define(
    'ocean',
    'Ocean',
    'Blue-green charcoal with aqua focus',
    {
      signal: '#69b7b1',
      canvas: '#29383a',
      surface: '#334446',
      rail: '#203033',
      ink: '#d5e1dc',
      mutedInk: '#9fb4af',
      outline: '#465d5d',
      editorCanvas: '#253335',
    },
    {
      signal: '#3f948d',
      canvas: '#f2f7f6',
      surface: '#ffffff',
      rail: '#e2ecea',
      ink: '#1f2d2c',
      mutedInk: '#607a76',
      outline: '#bfd1ce',
      editorCanvas: '#ebf3f1',
    },
  ),
  ember: define(
    'ember',
    'Ember',
    'Warm charcoal with restrained amber',
    {
      signal: '#e69a68',
      canvas: '#35302d',
      surface: '#413a35',
      rail: '#2a2523',
      ink: '#e5d9cc',
      mutedInk: '#b3a59a',
      outline: '#5b5049',
      editorCanvas: '#302b28',
    },
    {
      signal: '#b96532',
      canvas: '#faf6f2',
      surface: '#ffffff',
      rail: '#eee5de',
      ink: '#302720',
      mutedInk: '#786b61',
      outline: '#d6c8bd',
      editorCanvas: '#f5eee8',
    },
  ),
  rose: define(
    'rose',
    'Rose',
    'Plum graphite with dusty rose focus',
    {
      signal: '#d99aab',
      canvas: '#352f32',
      surface: '#41393d',
      rail: '#2b2528',
      ink: '#e4d8dc',
      mutedInk: '#b2a2a8',
      outline: '#5b4e53',
      editorCanvas: '#302a2d',
    },
    {
      signal: '#a95f75',
      canvas: '#faf5f7',
      surface: '#ffffff',
      rail: '#eee3e7',
      ink: '#30242a',
      mutedInk: '#796771',
      outline: '#d5c4ca',
      editorCanvas: '#f5ecef',
    },
  ),
  violet: define(
    'violet',
    'Violet ink',
    'Neutral ink with a quiet violet accent',
    {
      signal: '#b29ae1',
      canvas: '#313038',
      surface: '#3c3a45',
      rail: '#27262e',
      ink: '#dfdce6',
      mutedInk: '#aaa6b4',
      outline: '#53505d',
      editorCanvas: '#2c2b33',
    },
    {
      signal: '#8065bd',
      canvas: '#f7f5fa',
      surface: '#ffffff',
      rail: '#e9e5f0',
      ink: '#292532',
      mutedInk: '#6f687c',
      outline: '#ccc5d6',
      editorCanvas: '#f1eef6',
    },
  ),
  mono: define(
    'mono',
    'Monochrome',
    'Grayscale surfaces with pure tonal focus',
    {
      signal: '#d4d7d2',
      canvas: '#303232',
      surface: '#3a3d3c',
      rail: '#262828',
      ink: '#e0e0dc',
      mutedInk: '#aaadaa',
      outline: '#535756',
      editorCanvas: '#2b2d2d',
    },
    {
      signal: '#555b56',
      canvas: '#f6f7f5',
      surface: '#ffffff',
      rail: '#e7e9e7',
      ink: '#262927',
      mutedInk: '#6b706c',
      outline: '#c9cdca',
      editorCanvas: '#f0f2f0',
    },
  ),
  canopy: define(
    'canopy',
    'Canopy',
    'Deep forest surfaces with lichen focus',
    {
      signal: '#96ba74',
      canvas: '#27342e',
      surface: '#304039',
      rail: '#1e2924',
      ink: '#d8dfd2',
      mutedInk: '#a2b0a4',
      outline: '#465a4e',
      editorCanvas: '#223029',
    },
    {
      signal: '#5f873e',
      canvas: '#f5f8f2',
      surface: '#ffffff',
      rail: '#e3ebdf',
      ink: '#243022',
      mutedInk: '#687764',
      outline: '#c4d0be',
      editorCanvas: '#edf3e9',
    },
  ),
  redline: define(
    'redline',
    'Redline',
    'Asphalt neutrals with measured red controls',
    {
      signal: '#dc7c72',
      canvas: '#322f2f',
      surface: '#3e3939',
      rail: '#282525',
      ink: '#e4dcdc',
      mutedInk: '#ada3a3',
      outline: '#574f4f',
      editorCanvas: '#2c2929',
    },
    {
      signal: '#b94f48',
      canvas: '#faf6f5',
      surface: '#ffffff',
      rail: '#eee4e2',
      ink: '#302625',
      mutedInk: '#796967',
      outline: '#d4c5c2',
      editorCanvas: '#f5eeec',
    },
  ),
  blueprint: define(
    'blueprint',
    'Blueprint',
    'Drafting blue with precise cyan focus',
    {
      signal: '#72b9ca',
      canvas: '#26343c',
      surface: '#30414b',
      rail: '#1d2930',
      ink: '#d8e2e7',
      mutedInk: '#9fadb5',
      outline: '#435a66',
      editorCanvas: '#223039',
    },
    {
      signal: '#387f95',
      canvas: '#f2f7f9',
      surface: '#ffffff',
      rail: '#e0ebef',
      ink: '#213039',
      mutedInk: '#607680',
      outline: '#bdd0d7',
      editorCanvas: '#eaf2f5',
    },
  ),
};

function define(
  id: BuiltinPaletteId,
  name: string,
  description: string,
  dark: FoundationTokens,
  light: FoundationTokens,
): BuiltinPaletteDefinition {
  return {
    meta: {
      id,
      name,
      description,
      source: 'builtin',
      modeSupport: 'dual',
      swatches: [dark.rail, dark.canvas, dark.signal, dark.ink],
    },
    dark,
    light,
  };
}

export const BUILTIN_PALETTE_META: BuiltinPaletteMeta[] = Object.values(DEFINITIONS).map(
  (definition) => definition.meta,
);

export function resolveBuiltinTokens(
  paletteId: BuiltinPaletteId,
  mode: 'light' | 'dark',
): FullThemeTokens {
  const definition = DEFINITIONS[paletteId];
  return {
    ...definition[mode],
    ...(mode === 'light' ? LIGHT_ADVANCED : DARK_ADVANCED),
  };
}

export function builtinPaletteMeta(id: BuiltinPaletteId): BuiltinPaletteMeta {
  return DEFINITIONS[id].meta;
}
