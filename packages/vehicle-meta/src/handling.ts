export type HandlingCategory = 'mass' | 'powertrain' | 'brakes' | 'grip' | 'suspension' | 'damage';
export type HandlingNativeType = 'float' | 'int';

export interface HandlingFieldDefinition {
  key: keyof HandlingValues;
  label: string;
  category: HandlingCategory;
  nativeType: HandlingNativeType;
  min: number;
  max: number;
  step: number;
  unit?: string;
  description: string;
}

export interface HandlingValues {
  fMass: number;
  fInitialDragCoeff: number;
  fDownforceModifier: number;
  fDriveBiasFront: number;
  nInitialDriveGears: number;
  fInitialDriveForce: number;
  fDriveInertia: number;
  fClutchChangeRateScaleUpShift: number;
  fClutchChangeRateScaleDownShift: number;
  fInitialDriveMaxFlatVel: number;
  fBrakeForce: number;
  fBrakeBiasFront: number;
  fHandBrakeForce: number;
  fSteeringLock: number;
  fTractionCurveMax: number;
  fTractionCurveMin: number;
  fTractionCurveLateral: number;
  fTractionSpringDeltaMax: number;
  fLowSpeedTractionLossMult: number;
  fCamberStiffnesss: number;
  fTractionBiasFront: number;
  fTractionLossMult: number;
  fSuspensionForce: number;
  fSuspensionCompDamp: number;
  fSuspensionReboundDamp: number;
  fSuspensionUpperLimit: number;
  fSuspensionLowerLimit: number;
  fSuspensionRaise: number;
  fSuspensionBiasFront: number;
  fAntiRollBarForce: number;
  fAntiRollBarBiasFront: number;
  fRollCentreHeightFront: number;
  fRollCentreHeightRear: number;
  fCollisionDamageMult: number;
  fWeaponDamageMult: number;
  fDeformationDamageMult: number;
  fEngineDamageMult: number;
  fPetrolTankVolume: number;
  fOilVolume: number;
}

/**
 * The non-scalar portion of CHandlingData. These values used to be emitted as
 * fixed defaults, which made a generated handling.meta look editable while
 * still hiding important chassis behaviour behind the source editor.
 */
export interface HandlingSetup {
  centreOfMass: { x: number; y: number; z: number };
  inertiaMultiplier: { x: number; y: number; z: number };
  seatOffset: { x: number; y: number; z: number };
  monetaryValue: number;
  modelFlags: string;
  handlingFlags: string;
  damageFlags: string;
  aiHandling: 'AVERAGE' | 'SPORTS_CAR' | 'TRUCK' | 'OFF_ROAD' | 'NONE';
  subHandling: 'none' | 'bike' | 'boat' | 'trailer';
}

export const DEFAULT_HANDLING_SETUP: HandlingSetup = {
  centreOfMass: { x: 0, y: 0, z: 0 },
  inertiaMultiplier: { x: 1, y: 1.4, z: 1.6 },
  seatOffset: { x: 0, y: 0, z: 0 },
  monetaryValue: 35_000,
  modelFlags: '440010',
  handlingFlags: '0',
  damageFlags: '0',
  aiHandling: 'AVERAGE',
  subHandling: 'none',
};

export const HANDLING_FIELDS: HandlingFieldDefinition[] = [
  {
    key: 'fMass',
    label: 'Mass',
    category: 'mass',
    nativeType: 'float',
    min: 100,
    max: 12000,
    step: 25,
    unit: 'kg',
    description: 'Vehicle mass used by collision and acceleration calculations.',
  },
  {
    key: 'fInitialDragCoeff',
    label: 'Aerodynamic drag',
    category: 'mass',
    nativeType: 'float',
    min: 0,
    max: 20,
    step: 0.1,
    description: 'Air resistance. Higher values reduce speed more aggressively.',
  },
  {
    key: 'fDownforceModifier',
    label: 'Downforce modifier',
    category: 'mass',
    nativeType: 'float',
    min: 0,
    max: 5,
    step: 0.05,
    description: 'Additional speed-sensitive grip for vehicles that use downforce.',
  },
  {
    key: 'fDriveBiasFront',
    label: 'Front drive bias',
    category: 'powertrain',
    nativeType: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    description: '0 is rear-wheel drive, 1 is front-wheel drive, values between split torque.',
  },
  {
    key: 'nInitialDriveGears',
    label: 'Forward gears',
    category: 'powertrain',
    nativeType: 'int',
    min: 1,
    max: 10,
    step: 1,
    description: 'Number of forward transmission gears.',
  },
  {
    key: 'fInitialDriveForce',
    label: 'Drive force',
    category: 'powertrain',
    nativeType: 'float',
    min: 0.05,
    max: 1.5,
    step: 0.01,
    description: 'Primary acceleration force delivered through the drivetrain.',
  },
  {
    key: 'fDriveInertia',
    label: 'Drive inertia',
    category: 'powertrain',
    nativeType: 'float',
    min: 0.1,
    max: 3,
    step: 0.05,
    description: 'How quickly engine speed reacts to throttle changes.',
  },
  {
    key: 'fClutchChangeRateScaleUpShift',
    label: 'Upshift rate',
    category: 'powertrain',
    nativeType: 'float',
    min: 0.1,
    max: 20,
    step: 0.1,
    description: 'Clutch engagement speed when shifting up.',
  },
  {
    key: 'fClutchChangeRateScaleDownShift',
    label: 'Downshift rate',
    category: 'powertrain',
    nativeType: 'float',
    min: 0.1,
    max: 20,
    step: 0.1,
    description: 'Clutch engagement speed when shifting down.',
  },
  {
    key: 'fInitialDriveMaxFlatVel',
    label: 'Drive max flat velocity',
    category: 'powertrain',
    nativeType: 'float',
    min: 20,
    max: 400,
    step: 1,
    description:
      'Transmission speed target in GTA handling units; in-game top speed is affected by drag and power.',
  },
  {
    key: 'fBrakeForce',
    label: 'Brake force',
    category: 'brakes',
    nativeType: 'float',
    min: 0.05,
    max: 5,
    step: 0.01,
    description: 'Overall service-brake strength.',
  },
  {
    key: 'fBrakeBiasFront',
    label: 'Front brake bias',
    category: 'brakes',
    nativeType: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Share of brake force applied to the front axle.',
  },
  {
    key: 'fHandBrakeForce',
    label: 'Handbrake force',
    category: 'brakes',
    nativeType: 'float',
    min: 0,
    max: 5,
    step: 0.01,
    description: 'Rear handbrake strength.',
  },
  {
    key: 'fSteeringLock',
    label: 'Steering lock',
    category: 'grip',
    nativeType: 'float',
    min: 5,
    max: 60,
    step: 0.5,
    unit: 'deg',
    description: 'Maximum front-wheel steering angle.',
  },
  {
    key: 'fTractionCurveMax',
    label: 'Peak traction',
    category: 'grip',
    nativeType: 'float',
    min: 0.2,
    max: 5,
    step: 0.01,
    description: 'Peak lateral grip before the tire begins to slide.',
  },
  {
    key: 'fTractionCurveMin',
    label: 'Sliding traction',
    category: 'grip',
    nativeType: 'float',
    min: 0.1,
    max: 5,
    step: 0.01,
    description: 'Grip retained while the tire is sliding.',
  },
  {
    key: 'fTractionCurveLateral',
    label: 'Lateral curve angle',
    category: 'grip',
    nativeType: 'float',
    min: 5,
    max: 40,
    step: 0.1,
    unit: 'deg',
    description: 'Slip angle where peak lateral grip occurs.',
  },
  {
    key: 'fTractionSpringDeltaMax',
    label: 'Traction spring delta',
    category: 'grip',
    nativeType: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Maximum suspension movement contribution to traction.',
  },
  {
    key: 'fLowSpeedTractionLossMult',
    label: 'Low-speed traction loss',
    category: 'grip',
    nativeType: 'float',
    min: 0,
    max: 5,
    step: 0.01,
    description: 'Grip reduction at low speed; useful for burnouts and drift behavior.',
  },
  {
    key: 'fCamberStiffnesss',
    label: 'Camber stiffness',
    category: 'grip',
    nativeType: 'float',
    min: 0,
    max: 5,
    step: 0.01,
    description:
      'Grip response to camber. The GTA field name intentionally contains three s characters.',
  },
  {
    key: 'fTractionBiasFront',
    label: 'Front traction bias',
    category: 'grip',
    nativeType: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Share of available lateral traction assigned to the front axle.',
  },
  {
    key: 'fTractionLossMult',
    label: 'Surface traction loss',
    category: 'grip',
    nativeType: 'float',
    min: 0,
    max: 5,
    step: 0.01,
    description: 'How strongly loose or low-grip surfaces reduce traction.',
  },
  {
    key: 'fSuspensionForce',
    label: 'Spring force',
    category: 'suspension',
    nativeType: 'float',
    min: 0.1,
    max: 10,
    step: 0.05,
    description: 'Suspension spring stiffness.',
  },
  {
    key: 'fSuspensionCompDamp',
    label: 'Compression damping',
    category: 'suspension',
    nativeType: 'float',
    min: 0.1,
    max: 10,
    step: 0.05,
    description: 'Damping while the suspension compresses.',
  },
  {
    key: 'fSuspensionReboundDamp',
    label: 'Rebound damping',
    category: 'suspension',
    nativeType: 'float',
    min: 0.1,
    max: 10,
    step: 0.05,
    description: 'Damping while the suspension extends.',
  },
  {
    key: 'fSuspensionUpperLimit',
    label: 'Upper travel',
    category: 'suspension',
    nativeType: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Maximum upward suspension travel.',
  },
  {
    key: 'fSuspensionLowerLimit',
    label: 'Lower travel',
    category: 'suspension',
    nativeType: 'float',
    min: -1,
    max: 0,
    step: 0.01,
    description: 'Maximum downward suspension travel.',
  },
  {
    key: 'fSuspensionRaise',
    label: 'Ride-height offset',
    category: 'suspension',
    nativeType: 'float',
    min: -0.5,
    max: 0.5,
    step: 0.01,
    description: 'Raises or lowers the chassis relative to the wheels.',
  },
  {
    key: 'fSuspensionBiasFront',
    label: 'Front spring bias',
    category: 'suspension',
    nativeType: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Share of suspension force assigned to the front axle.',
  },
  {
    key: 'fAntiRollBarForce',
    label: 'Anti-roll force',
    category: 'suspension',
    nativeType: 'float',
    min: 0,
    max: 5,
    step: 0.01,
    description: 'Resistance to body roll between left and right suspension.',
  },
  {
    key: 'fAntiRollBarBiasFront',
    label: 'Front anti-roll bias',
    category: 'suspension',
    nativeType: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    description: 'Share of anti-roll effect assigned to the front axle.',
  },
  {
    key: 'fRollCentreHeightFront',
    label: 'Front roll centre',
    category: 'suspension',
    nativeType: 'float',
    min: -1,
    max: 1,
    step: 0.01,
    description: 'Front axle roll-centre height.',
  },
  {
    key: 'fRollCentreHeightRear',
    label: 'Rear roll centre',
    category: 'suspension',
    nativeType: 'float',
    min: -1,
    max: 1,
    step: 0.01,
    description: 'Rear axle roll-centre height.',
  },
  {
    key: 'fCollisionDamageMult',
    label: 'Collision damage',
    category: 'damage',
    nativeType: 'float',
    min: 0,
    max: 10,
    step: 0.05,
    description: 'Damage received from collisions.',
  },
  {
    key: 'fWeaponDamageMult',
    label: 'Weapon damage',
    category: 'damage',
    nativeType: 'float',
    min: 0,
    max: 10,
    step: 0.05,
    description: 'Damage received from weapons.',
  },
  {
    key: 'fDeformationDamageMult',
    label: 'Body deformation',
    category: 'damage',
    nativeType: 'float',
    min: 0,
    max: 10,
    step: 0.05,
    description: 'Visual and physical deformation multiplier.',
  },
  {
    key: 'fEngineDamageMult',
    label: 'Engine damage',
    category: 'damage',
    nativeType: 'float',
    min: 0,
    max: 10,
    step: 0.05,
    description: 'Engine damage sensitivity.',
  },
  {
    key: 'fPetrolTankVolume',
    label: 'Fuel tank',
    category: 'damage',
    nativeType: 'float',
    min: 0,
    max: 500,
    step: 1,
    unit: 'L',
    description: 'Fuel capacity used by FiveM fuel consumption support.',
  },
  {
    key: 'fOilVolume',
    label: 'Oil volume',
    category: 'damage',
    nativeType: 'float',
    min: 0,
    max: 50,
    step: 0.1,
    unit: 'L',
    description: 'Oil capacity stored in handling data.',
  },
];

const STREET: HandlingValues = {
  fMass: 1550,
  fInitialDragCoeff: 8,
  fDownforceModifier: 1,
  fDriveBiasFront: 0.2,
  nInitialDriveGears: 6,
  fInitialDriveForce: 0.3,
  fDriveInertia: 1,
  fClutchChangeRateScaleUpShift: 2.4,
  fClutchChangeRateScaleDownShift: 2.2,
  fInitialDriveMaxFlatVel: 165,
  fBrakeForce: 0.85,
  fBrakeBiasFront: 0.58,
  fHandBrakeForce: 0.65,
  fSteeringLock: 36,
  fTractionCurveMax: 2.45,
  fTractionCurveMin: 2.2,
  fTractionCurveLateral: 22.5,
  fTractionSpringDeltaMax: 0.15,
  fLowSpeedTractionLossMult: 1,
  fCamberStiffnesss: 0,
  fTractionBiasFront: 0.49,
  fTractionLossMult: 1,
  fSuspensionForce: 2.4,
  fSuspensionCompDamp: 1.5,
  fSuspensionReboundDamp: 2.3,
  fSuspensionUpperLimit: 0.1,
  fSuspensionLowerLimit: -0.12,
  fSuspensionRaise: 0,
  fSuspensionBiasFront: 0.52,
  fAntiRollBarForce: 0.75,
  fAntiRollBarBiasFront: 0.55,
  fRollCentreHeightFront: 0.33,
  fRollCentreHeightRear: 0.34,
  fCollisionDamageMult: 1,
  fWeaponDamageMult: 1,
  fDeformationDamageMult: 0.8,
  fEngineDamageMult: 1.5,
  fPetrolTankVolume: 65,
  fOilVolume: 5,
};

export type HandlingPresetId = 'street' | 'sport' | 'drift' | 'emergency' | 'utility' | 'offroad';

export const HANDLING_PRESETS: Record<
  HandlingPresetId,
  { label: string; description: string; values: HandlingValues }
> = {
  street: {
    label: 'Balanced street',
    description: 'Predictable road car with neutral grip and progressive braking.',
    values: STREET,
  },
  sport: {
    label: 'Track sport',
    description: 'Quicker shifts, stronger brakes, tighter roll control, and higher peak grip.',
    values: {
      ...STREET,
      fMass: 1380,
      fDownforceModifier: 1.35,
      fDriveBiasFront: 0.35,
      fInitialDriveForce: 0.38,
      fDriveInertia: 1.15,
      fClutchChangeRateScaleUpShift: 4.5,
      fClutchChangeRateScaleDownShift: 4,
      fInitialDriveMaxFlatVel: 205,
      fBrakeForce: 1.05,
      fTractionCurveMax: 2.85,
      fTractionCurveMin: 2.58,
      fSuspensionForce: 2.9,
      fAntiRollBarForce: 1.1,
    },
  },
  drift: {
    label: 'Controlled drift',
    description:
      'Rear drive, wider steering lock, and a deliberate gap between peak and sliding grip.',
    values: {
      ...STREET,
      fDriveBiasFront: 0,
      fInitialDriveForce: 0.36,
      fSteeringLock: 50,
      fTractionCurveMax: 2.25,
      fTractionCurveMin: 1.72,
      fTractionCurveLateral: 25,
      fLowSpeedTractionLossMult: 1.35,
      fTractionBiasFront: 0.46,
      fHandBrakeForce: 1.1,
    },
  },
  emergency: {
    label: 'Emergency response',
    description: 'Stable high-speed response for a heavier fully equipped emergency vehicle.',
    values: {
      ...STREET,
      fMass: 2200,
      fDriveBiasFront: 0.5,
      fInitialDriveForce: 0.34,
      fInitialDriveMaxFlatVel: 185,
      fBrakeForce: 1.1,
      fTractionCurveMax: 2.7,
      fTractionCurveMin: 2.5,
      fSuspensionForce: 2.8,
      fAntiRollBarForce: 1.2,
      fDeformationDamageMult: 0.55,
    },
  },
  utility: {
    label: 'Heavy utility',
    description: 'Slower, durable setup with long suspension travel and conservative steering.',
    values: {
      ...STREET,
      fMass: 3200,
      fInitialDragCoeff: 10,
      fDriveBiasFront: 0.5,
      nInitialDriveGears: 5,
      fInitialDriveForce: 0.24,
      fInitialDriveMaxFlatVel: 125,
      fBrakeForce: 0.75,
      fSteeringLock: 32,
      fTractionCurveMax: 2.2,
      fTractionCurveMin: 2,
      fSuspensionForce: 2,
      fSuspensionUpperLimit: 0.18,
      fSuspensionLowerLimit: -0.2,
      fCollisionDamageMult: 0.7,
      fDeformationDamageMult: 0.5,
    },
  },
  offroad: {
    label: 'Off-road',
    description: 'Long travel, four-wheel drive, and moderated surface traction loss.',
    values: {
      ...STREET,
      fMass: 1950,
      fDriveBiasFront: 0.5,
      fInitialDriveForce: 0.32,
      fInitialDriveMaxFlatVel: 155,
      fTractionCurveMax: 2.35,
      fTractionCurveMin: 2.15,
      fTractionLossMult: 0.72,
      fSuspensionForce: 2.15,
      fSuspensionUpperLimit: 0.22,
      fSuspensionLowerLimit: -0.24,
      fRollCentreHeightFront: 0.42,
      fRollCentreHeightRear: 0.44,
    },
  },
};

function xmlNumber(value: number, integer = false): string {
  return integer ? String(Math.round(value)) : value.toFixed(6);
}

export function buildHandlingXml(
  handlingName: string,
  values: HandlingValues,
  setup: HandlingSetup = DEFAULT_HANDLING_SETUP,
): string {
  const fields = HANDLING_FIELDS.map(
    (field) =>
      `      <${field.key} value="${xmlNumber(values[field.key], field.nativeType === 'int')}" />`,
  ).join('\n');
  const subHandlingType =
    setup.subHandling === 'none'
      ? 'NULL'
      : setup.subHandling === 'bike'
        ? 'CBikeHandlingData'
        : setup.subHandling === 'boat'
          ? 'CBoatHandlingData'
          : 'CTrailerHandlingData';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<CHandlingDataMgr>\n  <HandlingData>\n    <Item type="CHandlingData">\n      <handlingName>${handlingName}</handlingName>\n${fields}\n      <vecCentreOfMassOffset x="${xmlNumber(setup.centreOfMass.x)}" y="${xmlNumber(setup.centreOfMass.y)}" z="${xmlNumber(setup.centreOfMass.z)}" />\n      <vecInertiaMultiplier x="${xmlNumber(setup.inertiaMultiplier.x)}" y="${xmlNumber(setup.inertiaMultiplier.y)}" z="${xmlNumber(setup.inertiaMultiplier.z)}" />\n      <fSeatOffsetDistX value="${xmlNumber(setup.seatOffset.x)}" />\n      <fSeatOffsetDistY value="${xmlNumber(setup.seatOffset.y)}" />\n      <fSeatOffsetDistZ value="${xmlNumber(setup.seatOffset.z)}" />\n      <nMonetaryValue value="${xmlNumber(setup.monetaryValue, true)}" />\n      <strModelFlags>${setup.modelFlags}</strModelFlags>\n      <strHandlingFlags>${setup.handlingFlags}</strHandlingFlags>\n      <strDamageFlags>${setup.damageFlags}</strDamageFlags>\n      <AIHandling>${setup.aiHandling}</AIHandling>\n      <SubHandlingData>\n        <Item type="${subHandlingType}" />\n        <Item type="NULL" />\n        <Item type="NULL" />\n      </SubHandlingData>\n    </Item>\n  </HandlingData>\n</CHandlingDataMgr>\n`;
}

export function handlingNativeCall(field: HandlingFieldDefinition, value: number): string {
  const native = field.nativeType === 'int' ? 'SetVehicleHandlingInt' : 'SetVehicleHandlingFloat';
  return `${native}(vehicle, 'CHandlingData', '${field.key}', ${xmlNumber(value, field.nativeType === 'int')})`;
}
