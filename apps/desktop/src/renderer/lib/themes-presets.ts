import type { Preferences } from '../../shared/contracts';

export interface ThemePreset {
  id: Preferences['themePreset'];
  name: string;
  description: string;
  swatches: [string, string, string];
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'everforest',
    name: 'Everforest',
    description: 'Warm graphite with calm green emphasis',
    swatches: ['#2d353b', '#d3c6aa', '#a7c080'],
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Neutral surfaces with steel-blue focus',
    swatches: ['#252728', '#e0e1dc', '#8ea9bc'],
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    description: 'Deep ink with confident cobalt controls',
    swatches: ['#222b35', '#dde5eb', '#74a5d8'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Blue-green charcoal with aqua focus',
    swatches: ['#223033', '#d5e1dc', '#7fb7ad'],
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Warm charcoal with restrained amber',
    swatches: ['#302b28', '#e5d9cc', '#d6a264'],
  },
  {
    id: 'rose',
    name: 'Rose',
    description: 'Plum graphite with dusty rose focus',
    swatches: ['#30292d', '#e4d8dc', '#c493a7'],
  },
  {
    id: 'violet',
    name: 'Violet ink',
    description: 'Neutral ink with a quiet violet accent',
    swatches: ['#292830', '#dfdce6', '#a8a0cb'],
  },
  {
    id: 'mono',
    name: 'Monochrome',
    description: 'Grayscale surfaces with pure tonal focus',
    swatches: ['#282a2a', '#e0e0dc', '#b8bbb7'],
  },
  {
    id: 'canopy',
    name: 'Canopy',
    description: 'Deep forest surfaces with lichen focus',
    swatches: ['#27342e', '#d8dfd2', '#96ba74'],
  },
  {
    id: 'redline',
    name: 'Redline',
    description: 'Asphalt neutrals with measured red controls',
    swatches: ['#322f2f', '#e4dcdc', '#dc7c72'],
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Drafting blue with precise cyan focus',
    swatches: ['#26343c', '#d8e2e7', '#72b9ca'],
  },
];
