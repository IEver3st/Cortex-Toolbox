import type { HandlingSetup, HandlingValues } from '@cortex/vehicle-meta';
import type { HandlingWorkbenchCategory } from './types';

type VectorPatch = Partial<HandlingSetup['centreOfMass']>;

export interface HandlingSetupPatch {
  centreOfMass?: VectorPatch;
  inertiaMultiplier?: VectorPatch;
  seatOffset?: VectorPatch;
  monetaryValue?: number;
  modelFlags?: string;
  handlingFlags?: string;
  damageFlags?: string;
  aiHandling?: string;
  subHandling?: HandlingSetup['subHandling'];
  subHandlingType?: string;
}

export interface CategoryPreset {
  id: string;
  label: string;
  description: string;
  values: Partial<HandlingValues>;
  setup?: HandlingSetupPatch;
}

export const CATEGORY_PRESETS: Record<HandlingWorkbenchCategory, CategoryPreset[]> = {
  physical: [
    {
      id: 'road-car',
      label: 'Road car',
      description:
        'A neutral mid-weight chassis with moderate drag, a slightly lowered centre of mass, and predictable rotational response.',
      values: { fMass: 1500, fInitialDragCoeff: 8, fDownforceModifier: 1 },
      setup: {
        centreOfMass: { x: 0, y: 0, z: -0.05 },
        inertiaMultiplier: { x: 1, y: 1.4, z: 1.6 },
      },
    },
    {
      id: 'lightweight',
      label: 'Lightweight',
      description:
        'Reduces mass and rotational inertia for a more immediate chassis that changes direction quickly.',
      values: { fMass: 1150, fInitialDragCoeff: 7, fDownforceModifier: 1.2 },
      setup: {
        centreOfMass: { x: 0, y: 0, z: -0.12 },
        inertiaMultiplier: { x: 0.9, y: 1.2, z: 1.35 },
      },
    },
    {
      id: 'heavy-duty',
      label: 'Heavy duty',
      description:
        'Adds mass and inertia for trucks or equipped vehicles that should feel planted and deliberate.',
      values: { fMass: 2800, fInitialDragCoeff: 10, fDownforceModifier: 0.8 },
      setup: {
        centreOfMass: { x: 0, y: 0, z: -0.18 },
        inertiaMultiplier: { x: 1.25, y: 1.75, z: 2 },
      },
    },
  ],
  powertrain: [
    {
      id: 'rwd-street',
      label: 'RWD street',
      description:
        'Rear-wheel drive with progressive power delivery, six gears, and relaxed road-car shift speeds.',
      values: {
        fDriveBiasFront: 0,
        nInitialDriveGears: 6,
        fInitialDriveForce: 0.3,
        fDriveInertia: 1,
        fClutchChangeRateScaleUpShift: 2.4,
        fClutchChangeRateScaleDownShift: 2.2,
        fInitialDriveMaxFlatVel: 165,
      },
    },
    {
      id: 'awd-launch',
      label: 'AWD launch',
      description:
        'Even torque split, stronger drive force, and fast shifts for confident launches with less wheelspin.',
      values: {
        fDriveBiasFront: 0.5,
        nInitialDriveGears: 7,
        fInitialDriveForce: 0.38,
        fDriveInertia: 1.15,
        fClutchChangeRateScaleUpShift: 4.5,
        fClutchChangeRateScaleDownShift: 4,
        fInitialDriveMaxFlatVel: 195,
      },
    },
    {
      id: 'high-speed',
      label: 'High speed',
      description:
        'A long eight-speed powertrain with quick shifts and a higher transmission speed target.',
      values: {
        fDriveBiasFront: 0.25,
        nInitialDriveGears: 8,
        fInitialDriveForce: 0.36,
        fDriveInertia: 1.2,
        fClutchChangeRateScaleUpShift: 5.5,
        fClutchChangeRateScaleDownShift: 5,
        fInitialDriveMaxFlatVel: 240,
      },
    },
  ],
  braking: [
    {
      id: 'progressive',
      label: 'Progressive',
      description:
        'Moderate service brakes with a stable front bias and a forgiving street handbrake.',
      values: { fBrakeForce: 0.85, fBrakeBiasFront: 0.58, fHandBrakeForce: 0.65 },
    },
    {
      id: 'performance',
      label: 'Performance',
      description: 'Stronger braking with additional front bias for high-speed road and track use.',
      values: { fBrakeForce: 1.2, fBrakeBiasFront: 0.6, fHandBrakeForce: 0.8 },
    },
    {
      id: 'rotation',
      label: 'Rotation',
      description:
        'A neutral service-brake balance and strong handbrake for initiating low-speed rotation or drift.',
      values: { fBrakeForce: 0.9, fBrakeBiasFront: 0.52, fHandBrakeForce: 1.35 },
    },
  ],
  traction: [
    {
      id: 'road-grip',
      label: 'Road grip',
      description:
        'Progressive road-tire grip with neutral axle balance and predictable breakaway.',
      values: {
        fSteeringLock: 36,
        fTractionCurveMax: 2.45,
        fTractionCurveMin: 2.2,
        fTractionCurveLateral: 22.5,
        fTractionSpringDeltaMax: 0.15,
        fLowSpeedTractionLossMult: 1,
        fCamberStiffnesss: 0,
        fTractionBiasFront: 0.49,
        fTractionLossMult: 1,
      },
    },
    {
      id: 'track-grip',
      label: 'Track grip',
      description:
        'Higher peak and sliding grip with restrained steering lock for precise high-speed cornering.',
      values: {
        fSteeringLock: 34,
        fTractionCurveMax: 2.95,
        fTractionCurveMin: 2.7,
        fTractionCurveLateral: 21.5,
        fTractionSpringDeltaMax: 0.12,
        fLowSpeedTractionLossMult: 0.65,
        fCamberStiffnesss: 0.1,
        fTractionBiasFront: 0.5,
        fTractionLossMult: 0.9,
      },
    },
    {
      id: 'drift',
      label: 'Drift',
      description:
        'Wide steering lock and a deliberate peak-to-slide grip gap for controllable sustained oversteer.',
      values: {
        fSteeringLock: 50,
        fTractionCurveMax: 2.25,
        fTractionCurveMin: 1.72,
        fTractionCurveLateral: 25,
        fTractionSpringDeltaMax: 0.18,
        fLowSpeedTractionLossMult: 1.35,
        fCamberStiffnesss: 0,
        fTractionBiasFront: 0.46,
        fTractionLossMult: 1.05,
      },
    },
    {
      id: 'loose-surface',
      label: 'Loose surface',
      description:
        'Moderates surface traction loss and adds compliance for dirt, gravel, and uneven terrain.',
      values: {
        fSteeringLock: 38,
        fTractionCurveMax: 2.35,
        fTractionCurveMin: 2.15,
        fTractionCurveLateral: 23,
        fTractionSpringDeltaMax: 0.28,
        fLowSpeedTractionLossMult: 0.8,
        fCamberStiffnesss: 0,
        fTractionBiasFront: 0.5,
        fTractionLossMult: 0.72,
      },
    },
  ],
  suspension: [
    {
      id: 'comfort',
      label: 'Comfort',
      description:
        'Softer springs, moderate damping, and extra travel for a compliant everyday ride.',
      values: {
        fSuspensionForce: 2,
        fSuspensionCompDamp: 1.3,
        fSuspensionReboundDamp: 1.9,
        fSuspensionUpperLimit: 0.14,
        fSuspensionLowerLimit: -0.17,
        fSuspensionRaise: 0,
        fSuspensionBiasFront: 0.52,
        fAntiRollBarForce: 0.55,
        fAntiRollBarBiasFront: 0.55,
        fRollCentreHeightFront: 0.3,
        fRollCentreHeightRear: 0.31,
      },
    },
    {
      id: 'sport',
      label: 'Sport',
      description:
        'Firmer springs and rebound, shorter travel, and stronger roll control for responsive road handling.',
      values: {
        fSuspensionForce: 3,
        fSuspensionCompDamp: 1.8,
        fSuspensionReboundDamp: 2.8,
        fSuspensionUpperLimit: 0.08,
        fSuspensionLowerLimit: -0.1,
        fSuspensionRaise: -0.02,
        fSuspensionBiasFront: 0.52,
        fAntiRollBarForce: 1.2,
        fAntiRollBarBiasFront: 0.56,
        fRollCentreHeightFront: 0.28,
        fRollCentreHeightRear: 0.29,
      },
    },
    {
      id: 'off-road',
      label: 'Off-road',
      description:
        'Long travel, compliant damping, and raised roll centres for rough terrain and larger impacts.',
      values: {
        fSuspensionForce: 2.15,
        fSuspensionCompDamp: 1.4,
        fSuspensionReboundDamp: 2.1,
        fSuspensionUpperLimit: 0.22,
        fSuspensionLowerLimit: -0.24,
        fSuspensionRaise: 0.06,
        fSuspensionBiasFront: 0.52,
        fAntiRollBarForce: 0.65,
        fAntiRollBarBiasFront: 0.52,
        fRollCentreHeightFront: 0.42,
        fRollCentreHeightRear: 0.44,
      },
    },
    {
      id: 'load-bearing',
      label: 'Load bearing',
      description:
        'Higher spring and anti-roll force with useful travel for heavy vehicles carrying permanent equipment.',
      values: {
        fSuspensionForce: 2.8,
        fSuspensionCompDamp: 1.8,
        fSuspensionReboundDamp: 2.6,
        fSuspensionUpperLimit: 0.15,
        fSuspensionLowerLimit: -0.18,
        fSuspensionRaise: 0.03,
        fSuspensionBiasFront: 0.53,
        fAntiRollBarForce: 1.1,
        fAntiRollBarBiasFront: 0.57,
        fRollCentreHeightFront: 0.38,
        fRollCentreHeightRear: 0.4,
      },
    },
  ],
  damage: [
    {
      id: 'realistic',
      label: 'Realistic',
      description:
        'Baseline collision and weapon damage with visible deformation and a moderately sensitive engine.',
      values: {
        fCollisionDamageMult: 1,
        fWeaponDamageMult: 1,
        fDeformationDamageMult: 0.8,
        fEngineDamageMult: 1.5,
      },
    },
    {
      id: 'durable',
      label: 'Durable',
      description:
        'Reduces incoming damage and deformation for work, fleet, or emergency vehicles.',
      values: {
        fCollisionDamageMult: 0.55,
        fWeaponDamageMult: 0.65,
        fDeformationDamageMult: 0.45,
        fEngineDamageMult: 0.75,
      },
    },
    {
      id: 'armoured',
      label: 'Armoured',
      description:
        'Strongly resists collision, weapon, body, and engine damage for deliberately reinforced vehicles.',
      values: {
        fCollisionDamageMult: 0.25,
        fWeaponDamageMult: 0.35,
        fDeformationDamageMult: 0.2,
        fEngineDamageMult: 0.45,
      },
    },
  ],
  advanced: [
    {
      id: 'standard-service',
      label: 'Standard service',
      description:
        'Typical road-car fuel and oil capacities without changing flags or AI handling.',
      values: { fPetrolTankVolume: 65, fOilVolume: 5 },
    },
    {
      id: 'long-range',
      label: 'Long range',
      description:
        'Larger service capacities for utility, expedition, or long-range roleplay vehicles.',
      values: { fPetrolTankVolume: 100, fOilVolume: 8 },
    },
    {
      id: 'competition',
      label: 'Competition',
      description:
        'Compact race-oriented service capacities; identity, flags, and sub-handling remain untouched.',
      values: { fPetrolTankVolume: 45, fOilVolume: 6 },
    },
  ],
};

function setupPatchMatches(setup: HandlingSetup, patch: HandlingSetupPatch | undefined): boolean {
  if (!patch) return true;
  for (const [key, value] of Object.entries(patch) as [keyof HandlingSetupPatch, unknown][]) {
    if (key === 'centreOfMass' || key === 'inertiaMultiplier' || key === 'seatOffset') {
      const vector = value as VectorPatch;
      if (
        Object.entries(vector).some(
          ([axis, axisValue]) => setup[key][axis as keyof VectorPatch] !== axisValue,
        )
      ) {
        return false;
      }
    } else if (setup[key as keyof HandlingSetup] !== value) {
      return false;
    }
  }
  return true;
}

export function categoryPresetMatches(
  handling: HandlingValues,
  setup: HandlingSetup,
  preset: CategoryPreset,
): boolean {
  return (
    Object.entries(preset.values).every(
      ([key, value]) => handling[key as keyof HandlingValues] === value,
    ) && setupPatchMatches(setup, preset.setup)
  );
}

export function applyCategoryPreset(
  handling: HandlingValues,
  setup: HandlingSetup,
  preset: CategoryPreset,
): { handling: HandlingValues; setup: HandlingSetup } {
  const setupPatch = preset.setup;
  return {
    handling: { ...handling, ...preset.values },
    setup: {
      ...setup,
      ...setupPatch,
      centreOfMass: { ...setup.centreOfMass, ...setupPatch?.centreOfMass },
      inertiaMultiplier: { ...setup.inertiaMultiplier, ...setupPatch?.inertiaMultiplier },
      seatOffset: { ...setup.seatOffset, ...setupPatch?.seatOffset },
    },
  };
}

export function categoryPresetFieldKeys(preset: CategoryPreset): string[] {
  const keys = Object.keys(preset.values);
  for (const vector of ['centreOfMass', 'inertiaMultiplier', 'seatOffset'] as const) {
    for (const axis of Object.keys(preset.setup?.[vector] ?? {})) keys.push(`${vector}.${axis}`);
  }
  for (const key of Object.keys(preset.setup ?? {})) {
    if (key !== 'centreOfMass' && key !== 'inertiaMultiplier' && key !== 'seatOffset')
      keys.push(key);
  }
  return keys;
}
