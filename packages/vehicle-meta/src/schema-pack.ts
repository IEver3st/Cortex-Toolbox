/**
 * Versioned declarative schema pack for GTA/FiveM vehicle metadata.
 * Constraints are data; generic evaluators execute them.
 * Production analysis never reads fixture answer keys.
 */

export const SCHEMA_PACK_VERSION = '1.0.0';
export const ANALYZER_VERSION = '2.0.0';

export type DocumentType =
  'handling' | 'vehicles' | 'carvariations' | 'carcols' | 'vehiclelayouts' | 'modkits';

export type FieldValueType =
  | 'string'
  | 'nonEmptyString'
  | 'boolean'
  | 'integer'
  | 'unsignedInteger'
  | 'finiteFloat'
  | 'hex'
  | 'identifier'
  | 'enum'
  | 'spaceSeparatedArray'
  | 'vectorAttributes'
  | 'bitFlags';

export type Severity = 'error' | 'warning' | 'info';

export interface RangeConstraint {
  min?: number;
  max?: number;
  exclusiveMin?: number;
  exclusiveMax?: number;
  positive?: boolean;
  nonNegative?: boolean;
  severity?: Severity;
}

export interface FieldConstraint {
  id: string;
  documentType: DocumentType | DocumentType[];
  /** Element local name, or path-like "indicator/outerConeAngle". */
  element: string;
  target: 'attribute' | 'text' | 'attributeValue';
  attribute?: string;
  type: FieldValueType;
  required?: boolean;
  finite?: boolean;
  integerOnly?: boolean;
  range?: RangeConstraint;
  enums?: readonly string[];
  enumId?: string;
  arrayItemType?: 'float' | 'int' | 'string';
  arrayCardinality?: number | { min?: number; max?: number };
  referenceNamespace?: string;
  identifierNamespace?: string;
  uniquenessScope?: 'document' | 'parentCollection' | 'workspace' | 'owningVehicle';
  caseSensitive?: boolean;
  pattern?: string;
  repair?: {
    strategy: string;
    automaticClamp?: boolean;
  };
  severity?: Severity;
  documentation?: string;
}

export interface RelationalConstraint {
  id: string;
  documentType: DocumentType | DocumentType[];
  /** Element that scopes left/right (e.g. Item, indicator). */
  scope: string;
  assert: {
    left: string;
    operator: '>=' | '>' | '<=' | '<' | '!=' | '==';
    right: string;
  };
  severity?: Severity;
  documentation?: string;
}

/** Field-specific enum registries — never one global set. */
export const ENUM_REGISTRIES: Record<string, readonly string[]> = {
  vehicleClass: [
    'VC_COMPACT',
    'VC_SEDAN',
    'VC_SUV',
    'VC_COUPE',
    'VC_MUSCLE',
    'VC_SPORT_CLASSIC',
    'VC_SPORT',
    'VC_SUPER',
    'VC_MOTORCYCLE',
    'VC_OFF_ROAD',
    'VC_INDUSTRIAL',
    'VC_UTILITY',
    'VC_VAN',
    'VC_CYCLE',
    'VC_BOAT',
    'VC_HELICOPTER',
    'VC_PLANE',
    'VC_SERVICE',
    'VC_EMERGENCY',
    'VC_MILITARY',
    'VC_COMMERCIAL',
    'VC_RAIL',
    'VC_OPEN_WHEEL',
  ],
  plateType: ['VPT_FRONT_AND_BACK_PLATES', 'VPT_FRONT_PLATES', 'VPT_BACK_PLATES', 'VPT_NONE'],
  kitType: ['MKT_STANDARD', 'MKT_SPECIAL', 'MKT_SPORT'],
  wheelType: [
    'VWT_SPORT',
    'VWT_MUSCLE',
    'VWT_LOWRIDER',
    'VWT_SUV',
    'VWT_OFFROAD',
    'VWT_TUNER',
    'VWT_BIKE',
    'VWT_HIEND',
    // Common community aliases observed in real packs (accepted, not auto-rewritten)
    'VWT_HIGHEND',
    'VWT_TRUCK',
    'VWT_SUPERMOD1',
    'VWT_SUPERMOD2',
    'VWT_SUPERMOD3',
    'VWT_SUPERMOD4',
    'VWT_SUPERMOD5',
  ],
  vehicleType: [
    'VEHICLE_TYPE_CAR',
    'VEHICLE_TYPE_PLANE',
    'VEHICLE_TYPE_TRAILER',
    'VEHICLE_TYPE_QUADBIKE',
    'VEHICLE_TYPE_DRAFT',
    'VEHICLE_TYPE_SUBMARINECAR',
    'VEHICLE_TYPE_AMPHIBIOUS_AUTOMOBILE',
    'VEHICLE_TYPE_AMPHIBIOUS_QUADBIKE',
    'VEHICLE_TYPE_HELI',
    'VEHICLE_TYPE_BLIMP',
    'VEHICLE_TYPE_AUTOGYRO',
    'VEHICLE_TYPE_BIKE',
    'VEHICLE_TYPE_BICYCLE',
    'VEHICLE_TYPE_BOAT',
    'VEHICLE_TYPE_TRAIN',
    'VEHICLE_TYPE_SUBMARINE',
  ],
  AIHandling: ['AVERAGE', 'SPORTS_CAR', 'TRUCK', 'BIKE', 'CRATE'],
  DriveByInfo: [
    'DRIVEBY_STANDARD_FRONT_LEFT',
    'DRIVEBY_STANDARD_FRONT_RIGHT',
    'DRIVEBY_STANDARD_REAR_LEFT',
    'DRIVEBY_STANDARD_REAR_RIGHT',
  ],
};

export const HANDLING_NUMERIC: Record<string, RangeConstraint & { integerOnly?: boolean }> = {
  fMass: { min: 0, max: 100_000, positive: true },
  fInitialDragCoeff: { min: 0, max: 100 },
  fDownforceModifier: { min: 0, max: 50 },
  fDriveBiasFront: { min: 0, max: 1 },
  nInitialDriveGears: { min: 1, max: 10, integerOnly: true },
  fInitialDriveForce: { min: 0, max: 10 },
  fDriveInertia: { min: 0, max: 10 },
  fClutchChangeRateScaleUpShift: { min: 0, max: 50 },
  fClutchChangeRateScaleDownShift: { min: 0, max: 50 },
  fInitialDriveMaxFlatVel: { min: 0, max: 1000 },
  fBrakeForce: { min: 0, max: 20 },
  fBrakeBiasFront: { min: 0, max: 1 },
  fHandBrakeForce: { min: 0, max: 20 },
  fSteeringLock: { min: 0, max: 90 },
  fTractionCurveMax: { min: 0, max: 20 },
  fTractionCurveMin: { min: 0, max: 20 },
  fTractionCurveLateral: { min: 0, max: 90 },
  fTractionSpringDeltaMax: { min: 0, max: 5 },
  fLowSpeedTractionLossMult: { min: 0, max: 20 },
  fCamberStiffnesss: { min: -10, max: 10 },
  fTractionBiasFront: { min: 0, max: 1 },
  fTractionLossMult: { min: 0, max: 20 },
  fSuspensionForce: { min: 0, max: 20 },
  fSuspensionCompDamp: { min: 0, max: 20 },
  fSuspensionReboundDamp: { min: 0, max: 20 },
  fSuspensionUpperLimit: { min: -5, max: 5 },
  fSuspensionLowerLimit: { min: -5, max: 5 },
  fSuspensionRaise: { min: -5, max: 5 },
  fSuspensionBiasFront: { min: 0, max: 1 },
  fAntiRollBarForce: { min: 0, max: 20 },
  fAntiRollBarBiasFront: { min: 0, max: 1 },
  fRollCentreHeightFront: { min: -5, max: 5 },
  fRollCentreHeightRear: { min: -5, max: 5 },
  fCollisionDamageMult: { min: 0, max: 20 },
  fWeaponDamageMult: { min: 0, max: 20 },
  fDeformationDamageMult: { min: 0, max: 20 },
  fEngineDamageMult: { min: 0, max: 20 },
  fPetrolTankVolume: { min: 0, max: 500, nonNegative: true },
  fOilVolume: { min: 0, max: 50, nonNegative: true },
  fPercentSubmerged: { min: 0, max: 100 },
  nMonetaryValue: { min: 0, max: 10_000_000, integerOnly: true },
};

export const FIELD_CONSTRAINTS: FieldConstraint[] = [
  // --- carcols kit identifiers ---
  {
    id: 'carcols.kit.id',
    documentType: 'carcols',
    element: 'id',
    target: 'attributeValue',
    attribute: 'value',
    type: 'unsignedInteger',
    identifierNamespace: 'modkit.numericId',
    uniquenessScope: 'document',
    range: { min: 0, max: 1023 },
    repair: { strategy: 'requestManualInput', automaticClamp: false },
    documentation: 'Kit numeric ID must be an unsigned integer.',
  },
  {
    id: 'carcols.kitName',
    documentType: 'carcols',
    element: 'kitName',
    target: 'text',
    type: 'identifier',
    identifierNamespace: 'modkit.name',
    uniquenessScope: 'document',
    required: true,
  },
  {
    id: 'carcols.kitType',
    documentType: 'carcols',
    element: 'kitType',
    target: 'text',
    type: 'enum',
    enumId: 'kitType',
    repair: { strategy: 'replaceInvalidEnum' },
  },
  {
    id: 'carcols.color.hex',
    documentType: 'carcols',
    element: 'color',
    target: 'attributeValue',
    attribute: 'value',
    type: 'hex',
    repair: { strategy: 'requestManualInput' },
  },
  {
    id: 'carcols.intensity',
    documentType: ['carcols', 'vehicles'],
    element: 'intensity',
    target: 'attributeValue',
    attribute: 'value',
    type: 'finiteFloat',
    range: { min: 0, max: 100, nonNegative: true },
    repair: { strategy: 'requestManualInput', automaticClamp: false },
  },
  // --- handling ---
  ...Object.entries(HANDLING_NUMERIC).map(([name, range]): FieldConstraint => {
    const rangeOut: RangeConstraint = {};
    if (range.min !== undefined) rangeOut.min = range.min;
    if (range.max !== undefined) rangeOut.max = range.max;
    if (range.positive !== undefined) rangeOut.positive = range.positive;
    if (range.nonNegative !== undefined) rangeOut.nonNegative = range.nonNegative;
    return {
      id: `handling.${name}`,
      documentType: 'handling',
      element: name,
      target: 'attributeValue',
      attribute: 'value',
      type: range.integerOnly || name.startsWith('n') ? 'integer' : 'finiteFloat',
      finite: true,
      integerOnly: range.integerOnly || name.startsWith('n'),
      range: rangeOut,
      repair: { strategy: 'nearestValidReferenceOrClamp', automaticClamp: false },
    };
  }),
  {
    id: 'handling.AIHandling',
    documentType: 'handling',
    element: 'AIHandling',
    target: 'text',
    type: 'enum',
    enumId: 'AIHandling',
    repair: { strategy: 'replaceInvalidEnum' },
  },
  // --- vehicles enums & values ---
  {
    id: 'vehicles.vehicleClass',
    documentType: 'vehicles',
    element: 'vehicleClass',
    target: 'text',
    type: 'enum',
    enumId: 'vehicleClass',
    repair: { strategy: 'replaceInvalidEnum' },
  },
  {
    id: 'vehicles.plateType',
    documentType: 'vehicles',
    element: 'plateType',
    target: 'text',
    type: 'enum',
    enumId: 'plateType',
    repair: { strategy: 'replaceInvalidEnum' },
  },
  {
    id: 'vehicles.wheelType',
    documentType: 'vehicles',
    element: 'wheelType',
    target: 'text',
    type: 'enum',
    enumId: 'wheelType',
    repair: { strategy: 'replaceInvalidEnum' },
  },
  {
    id: 'vehicles.type',
    documentType: 'vehicles',
    element: 'type',
    target: 'text',
    type: 'enum',
    enumId: 'vehicleType',
    repair: { strategy: 'replaceInvalidEnum' },
  },
  {
    id: 'vehicles.frequency',
    documentType: 'vehicles',
    element: 'frequency',
    target: 'attributeValue',
    attribute: 'value',
    type: 'integer',
    range: { min: 0, max: 1000, nonNegative: true },
    repair: { strategy: 'requestManualInput', automaticClamp: false },
  },
  {
    id: 'vehicles.wheelScale',
    documentType: 'vehicles',
    element: 'wheelScale',
    target: 'attributeValue',
    attribute: 'value',
    type: 'finiteFloat',
    range: { positive: true, min: 0, exclusiveMin: 0, max: 10 },
    repair: { strategy: 'requestManualInput', automaticClamp: false },
  },
  {
    id: 'vehicles.wheelScaleRear',
    documentType: 'vehicles',
    element: 'wheelScaleRear',
    target: 'attributeValue',
    attribute: 'value',
    type: 'finiteFloat',
    range: { positive: true, exclusiveMin: 0, max: 10 },
    repair: { strategy: 'requestManualInput', automaticClamp: false },
  },
  {
    id: 'vehicles.lodDistances',
    documentType: 'vehicles',
    element: 'lodDistances',
    target: 'text',
    type: 'spaceSeparatedArray',
    arrayItemType: 'float',
    arrayCardinality: 6,
    repair: { strategy: 'requestManualInput' },
  },
  {
    id: 'vehicles.handlingId',
    documentType: 'vehicles',
    element: 'handlingId',
    target: 'text',
    type: 'identifier',
    referenceNamespace: 'handling.name',
    required: true,
    caseSensitive: true,
  },
  {
    id: 'vehicles.layout',
    documentType: 'vehicles',
    element: 'layout',
    target: 'text',
    type: 'identifier',
    referenceNamespace: 'layout.name',
    caseSensitive: true,
  },
  // --- layouts ---
  {
    id: 'layouts.DriveByInfo',
    documentType: 'vehiclelayouts',
    element: 'DriveByInfo',
    target: 'text',
    type: 'enum',
    enumId: 'DriveByInfo',
    repair: { strategy: 'replaceInvalidEnum' },
  },
  {
    id: 'layouts.SeatBoneName',
    documentType: 'vehiclelayouts',
    element: 'SeatBoneName',
    target: 'text',
    type: 'nonEmptyString',
    required: true,
    repair: { strategy: 'requestManualInput' },
  },
  // --- booleans ---
  {
    id: 'meta.boolean.attribute',
    documentType: ['carvariations', 'carcols', 'vehicles', 'handling'],
    element: '*',
    target: 'attributeValue',
    attribute: 'value',
    type: 'boolean',
    documentation: 'Applied only to known boolean attribute tags.',
  },
];

export const RELATIONAL_CONSTRAINTS: RelationalConstraint[] = [
  {
    id: 'handling.tractionCurveOrder',
    documentType: 'handling',
    scope: 'Item',
    assert: {
      left: 'fTractionCurveMax/@value',
      operator: '>=',
      right: 'fTractionCurveMin/@value',
    },
    documentation: 'Traction curve maximum must be at least the minimum.',
  },
  {
    id: 'handling.suspensionLimitOrder',
    documentType: 'handling',
    scope: 'Item',
    assert: {
      left: 'fSuspensionUpperLimit/@value',
      operator: '>',
      right: 'fSuspensionLowerLimit/@value',
    },
    documentation: 'Suspension upper limit must exceed lower limit.',
  },
  {
    id: 'carcols.coneAngleOrder',
    documentType: 'carcols',
    scope: 'indicator',
    assert: {
      left: 'outerConeAngle/@value',
      operator: '>=',
      right: 'innerConeAngle/@value',
    },
    documentation: 'Outer cone angle must be at least the inner cone angle.',
  },
  {
    id: 'carcols.coneAngleOrder.tail',
    documentType: 'carcols',
    scope: 'tailLight',
    assert: {
      left: 'outerConeAngle/@value',
      operator: '>=',
      right: 'innerConeAngle/@value',
    },
  },
  {
    id: 'carcols.coneAngleOrder.head',
    documentType: 'carcols',
    scope: 'headLight',
    assert: {
      left: 'outerConeAngle/@value',
      operator: '>=',
      right: 'innerConeAngle/@value',
    },
  },
  {
    id: 'carcols.coneAngleOrder.reversing',
    documentType: 'carcols',
    scope: 'reversingLight',
    assert: {
      left: 'outerConeAngle/@value',
      operator: '>=',
      right: 'innerConeAngle/@value',
    },
  },
];

export function enumsFor(
  enumId: string | undefined,
  inline?: readonly string[],
): readonly string[] {
  if (inline && inline.length > 0) return inline;
  if (enumId && enumId in ENUM_REGISTRIES) return ENUM_REGISTRIES[enumId]!;
  return [];
}

export function documentTypesMatch(
  constraint: { documentType: DocumentType | DocumentType[] },
  kind: string,
): boolean {
  const normalized = kind === 'modkits' ? 'carcols' : kind;
  const types = Array.isArray(constraint.documentType)
    ? constraint.documentType
    : [constraint.documentType];
  return types.includes(normalized as DocumentType);
}
