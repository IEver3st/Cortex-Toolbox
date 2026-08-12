/**
 * Data-driven metadata schema registry for supported GTA/FiveM vehicle meta types.
 * Field checks live here rather than scattered across UI or ad-hoc validators.
 */

export type MetaSchemaType =
  'handling' | 'vehicles' | 'carvariations' | 'carcols' | 'vehiclelayouts';

export type FieldValueType =
  'float' | 'int' | 'bool' | 'enum' | 'string' | 'identifier' | 'reference';

export type ReferenceTargetKind =
  'handlingName' | 'modelName' | 'kitName' | 'layoutName' | 'seatName' | 'modkitId';

export interface NumericConstraint {
  /** Absolute supported range (hard invalid outside). */
  min?: number;
  max?: number;
  /** Must be strictly greater than zero. */
  positive?: boolean;
  /** Must be finite (rejects NaN / Infinity). */
  finite?: boolean;
}

export interface FieldSchema {
  name: string;
  valueType: FieldValueType;
  /** Element uses value="..." attribute rather than text content. */
  attributeValue?: boolean;
  required?: boolean;
  enums?: readonly string[];
  numeric?: NumericConstraint;
  identifierKind?: ReferenceTargetKind;
  referenceTarget?: ReferenceTargetKind;
  uniquenessScope?: 'file' | 'collection';
  description?: string;
}

export interface MetaTypeSchema {
  type: MetaSchemaType;
  rootHints: readonly string[];
  fileNameSuffixes: readonly string[];
  fields: readonly FieldSchema[];
  identifierFields: readonly string[];
  referenceFields: readonly string[];
}

/** Known vehicleClass enum values (conservative GTA V set). */
export const VEHICLE_CLASS_ENUM = [
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
] as const;

export const PLATE_TYPE_ENUM = [
  'VPT_FRONT_AND_BACK_PLATES',
  'VPT_FRONT_PLATES',
  'VPT_BACK_PLATES',
  'VPT_NONE',
] as const;

export const KIT_TYPE_ENUM = ['MKT_STANDARD', 'MKT_SPECIAL', 'MKT_SPORT'] as const;

export const WHEEL_TYPE_ENUM = [
  'VWT_SPORT',
  'VWT_MUSCLE',
  'VWT_LOWRIDER',
  'VWT_SUV',
  'VWT_OFFROAD',
  'VWT_TUNER',
  'VWT_BIKE',
  'VWT_HIEND',
  'VWT_HIGHEND',
  'VWT_TRUCK',
  'VWT_SUPERMOD1',
  'VWT_SUPERMOD2',
  'VWT_SUPERMOD3',
  'VWT_SUPERMOD4',
  'VWT_SUPERMOD5',
] as const;

/** Handling numeric constraints used for absolute range validation. */
export const HANDLING_NUMERIC_FIELDS: Record<string, NumericConstraint> = {
  fMass: { min: 0, max: 100_000, positive: true, finite: true },
  fInitialDragCoeff: { min: 0, max: 100, finite: true },
  fDownforceModifier: { min: 0, max: 50, finite: true },
  fDriveBiasFront: { min: 0, max: 1, finite: true },
  nInitialDriveGears: { min: 1, max: 10, finite: true },
  fInitialDriveForce: { min: 0, max: 10, finite: true },
  fDriveInertia: { min: 0, max: 10, finite: true },
  fClutchChangeRateScaleUpShift: { min: 0, max: 50, finite: true },
  fClutchChangeRateScaleDownShift: { min: 0, max: 50, finite: true },
  fInitialDriveMaxFlatVel: { min: 0, max: 1000, finite: true },
  fBrakeForce: { min: 0, max: 20, finite: true },
  fBrakeBiasFront: { min: 0, max: 1, finite: true },
  fHandBrakeForce: { min: 0, max: 20, finite: true },
  fSteeringLock: { min: 0, max: 90, finite: true },
  fTractionCurveMax: { min: 0, max: 20, finite: true },
  fTractionCurveMin: { min: 0, max: 20, finite: true },
  fTractionCurveLateral: { min: 0, max: 90, finite: true },
  fTractionSpringDeltaMax: { min: 0, max: 5, finite: true },
  fLowSpeedTractionLossMult: { min: 0, max: 20, finite: true },
  fCamberStiffnesss: { min: -10, max: 10, finite: true },
  fTractionBiasFront: { min: 0, max: 1, finite: true },
  fTractionLossMult: { min: 0, max: 20, finite: true },
  fSuspensionForce: { min: 0, max: 20, finite: true },
  fSuspensionCompDamp: { min: 0, max: 20, finite: true },
  fSuspensionReboundDamp: { min: 0, max: 20, finite: true },
  fSuspensionUpperLimit: { min: -5, max: 5, finite: true },
  fSuspensionLowerLimit: { min: -5, max: 5, finite: true },
  fSuspensionRaise: { min: -5, max: 5, finite: true },
  fSuspensionBiasFront: { min: 0, max: 1, finite: true },
  fAntiRollBarForce: { min: 0, max: 20, finite: true },
  fAntiRollBarBiasFront: { min: 0, max: 1, finite: true },
  fRollCentreHeightFront: { min: -5, max: 5, finite: true },
  fRollCentreHeightRear: { min: -5, max: 5, finite: true },
  fCollisionDamageMult: { min: 0, max: 20, finite: true },
  fWeaponDamageMult: { min: 0, max: 20, finite: true },
  fDeformationDamageMult: { min: 0, max: 20, finite: true },
  fEngineDamageMult: { min: 0, max: 20, finite: true },
  fPetrolTankVolume: { min: 0, max: 500, finite: true },
  fOilVolume: { min: 0, max: 50, finite: true },
  fPercentSubmerged: { min: 0, max: 100, finite: true },
  nMonetaryValue: { min: 0, max: 10_000_000, finite: true },
};

export const META_SCHEMA_REGISTRY: Record<MetaSchemaType, MetaTypeSchema> = {
  handling: {
    type: 'handling',
    rootHints: ['CHandlingDataMgr'],
    fileNameSuffixes: ['handling.meta'],
    identifierFields: ['handlingName'],
    referenceFields: [],
    fields: [
      {
        name: 'handlingName',
        valueType: 'identifier',
        identifierKind: 'handlingName',
        uniquenessScope: 'file',
      },
      ...Object.entries(HANDLING_NUMERIC_FIELDS).map(([name, numeric]): FieldSchema => ({
        name,
        valueType: name.startsWith('n') ? 'int' : 'float',
        attributeValue: true,
        numeric,
      })),
    ],
  },
  vehicles: {
    type: 'vehicles',
    rootHints: ['CVehicleModelInfo__InitDataList'],
    fileNameSuffixes: ['vehicles.meta'],
    identifierFields: ['modelName'],
    referenceFields: ['handlingId', 'layout'],
    fields: [
      { name: 'modelName', valueType: 'identifier', identifierKind: 'modelName' },
      { name: 'handlingId', valueType: 'reference', referenceTarget: 'handlingName' },
      { name: 'layout', valueType: 'reference', referenceTarget: 'layoutName' },
      { name: 'vehicleClass', valueType: 'enum', enums: VEHICLE_CLASS_ENUM },
      { name: 'plateType', valueType: 'enum', enums: PLATE_TYPE_ENUM },
      { name: 'wheelType', valueType: 'enum', enums: WHEEL_TYPE_ENUM },
    ],
  },
  carvariations: {
    type: 'carvariations',
    rootHints: ['CVehicleModelInfoVariation'],
    fileNameSuffixes: ['carvariations.meta'],
    identifierFields: [],
    referenceFields: ['modelName', 'kits/Item'],
    fields: [
      { name: 'modelName', valueType: 'reference', referenceTarget: 'modelName' },
      { name: 'kits.Item', valueType: 'reference', referenceTarget: 'kitName' },
      {
        name: 'liveries.Item',
        valueType: 'bool',
        attributeValue: true,
        description: 'Boolean livery enable flags',
      },
    ],
  },
  carcols: {
    type: 'carcols',
    rootHints: ['CVehicleModelInfoVarGlobal'],
    fileNameSuffixes: ['carcols.meta', 'modkits.meta'],
    identifierFields: ['kitName', 'id'],
    referenceFields: [],
    fields: [
      {
        name: 'kitName',
        valueType: 'identifier',
        identifierKind: 'kitName',
        uniquenessScope: 'file',
      },
      { name: 'kitType', valueType: 'enum', enums: KIT_TYPE_ENUM },
      { name: 'id', valueType: 'int', attributeValue: true, identifierKind: 'modkitId' },
    ],
  },
  vehiclelayouts: {
    type: 'vehiclelayouts',
    rootHints: ['CVehicleMetadata', 'CVehicleMetadataMgr'],
    fileNameSuffixes: ['vehiclelayouts.meta'],
    identifierFields: ['Name'],
    referenceFields: ['ShuffleLink'],
    fields: [
      {
        name: 'SeatInfos.Name',
        valueType: 'identifier',
        identifierKind: 'seatName',
        uniquenessScope: 'collection',
      },
      {
        name: 'ShuffleLink',
        valueType: 'reference',
        referenceTarget: 'seatName',
      },
      {
        name: 'VehicleLayouts.Name',
        valueType: 'identifier',
        identifierKind: 'layoutName',
        uniquenessScope: 'file',
      },
    ],
  },
};

export function schemaForKind(kind: string): MetaTypeSchema | undefined {
  if (kind === 'modkits') return META_SCHEMA_REGISTRY.carcols;
  if (kind in META_SCHEMA_REGISTRY) {
    return META_SCHEMA_REGISTRY[kind as MetaSchemaType];
  }
  return undefined;
}
