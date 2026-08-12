import { DEFAULT_HANDLING_SETUP, HANDLING_FIELDS, HANDLING_PRESETS } from '@cortex/vehicle-meta';
import { describe, expect, it } from 'vitest';
import { CATEGORY_PRESETS, applyCategoryPreset, categoryPresetMatches } from './category-presets';
import type { HandlingWorkbenchCategory } from './types';

const CATEGORIES: HandlingWorkbenchCategory[] = [
  'physical',
  'powertrain',
  'braking',
  'traction',
  'suspension',
  'damage',
  'advanced',
];

describe('Chassis category presets', () => {
  it('provides documented presets for every handling workbench category', () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_PRESETS[category].length).toBeGreaterThanOrEqual(3);
      for (const preset of CATEGORY_PRESETS[category]) {
        expect(preset.label.trim()).not.toBe('');
        expect(preset.description.length).toBeGreaterThan(30);
        expect(
          Object.keys(preset.values).length + Object.keys(preset.setup ?? {}).length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every scalar preset value inside its editor range', () => {
    const fields = new Map(HANDLING_FIELDS.map((field) => [field.key, field]));
    for (const presets of Object.values(CATEGORY_PRESETS)) {
      for (const preset of presets) {
        for (const [key, value] of Object.entries(preset.values)) {
          const field = fields.get(key as keyof typeof HANDLING_PRESETS.street.values);
          expect(field, `${preset.id}.${key}`).toBeDefined();
          expect(value, `${preset.id}.${key}`).toBeGreaterThanOrEqual(field?.min ?? 0);
          expect(value, `${preset.id}.${key}`).toBeLessThanOrEqual(field?.max ?? 0);
        }
      }
    }
  });

  it('merges only the selected subsystem and detects manual divergence', () => {
    const originalHandling = { ...HANDLING_PRESETS.street.values, fWeaponDamageMult: 7.25 };
    const originalSetup = {
      ...DEFAULT_HANDLING_SETUP,
      centreOfMass: { x: 0.35, y: -0.2, z: 0.1 },
      inertiaMultiplier: { ...DEFAULT_HANDLING_SETUP.inertiaMultiplier },
      seatOffset: { ...DEFAULT_HANDLING_SETUP.seatOffset },
    };
    const preset = CATEGORY_PRESETS.suspension.find((candidate) => candidate.id === 'sport');
    if (!preset) throw new Error('Sport suspension preset is missing.');

    const applied = applyCategoryPreset(originalHandling, originalSetup, preset);
    expect(applied.handling.fSuspensionForce).toBe(3);
    expect(applied.handling.fWeaponDamageMult).toBe(7.25);
    expect(applied.setup.centreOfMass).toEqual(originalSetup.centreOfMass);
    expect(categoryPresetMatches(applied.handling, applied.setup, preset)).toBe(true);

    applied.handling.fSuspensionForce = 3.05;
    expect(categoryPresetMatches(applied.handling, applied.setup, preset)).toBe(false);
  });

  it('deep-merges physical setup vectors without changing unrelated setup', () => {
    const setup = {
      ...DEFAULT_HANDLING_SETUP,
      centreOfMass: { x: 0.4, y: -0.3, z: 0.2 },
      inertiaMultiplier: { ...DEFAULT_HANDLING_SETUP.inertiaMultiplier },
      seatOffset: { x: 0.1, y: 0.2, z: 0.3 },
      aiHandling: 'SPORTS_CAR',
    };
    const preset = CATEGORY_PRESETS.physical.find((candidate) => candidate.id === 'lightweight');
    if (!preset) throw new Error('Lightweight physical preset is missing.');

    const applied = applyCategoryPreset(HANDLING_PRESETS.street.values, setup, preset);
    expect(applied.setup.centreOfMass).toEqual({ x: 0, y: 0, z: -0.12 });
    expect(applied.setup.seatOffset).toEqual(setup.seatOffset);
    expect(applied.setup.aiHandling).toBe('SPORTS_CAR');
    expect(categoryPresetMatches(applied.handling, applied.setup, preset)).toBe(true);
  });
});
