import {
  diagnoseMetaBundle,
  generateVehicleMetaBundle,
  HANDLING_FIELDS,
  HANDLING_PRESETS,
  type HandlingFieldDefinition,
  type HandlingPresetId,
  type HandlingValues,
  type HandlingSetup,
  type MetaFileInput,
} from '@cortex/vehicle-meta';
import type { AiChangeProposal } from '@cortex/ai';
import type {
  BehaviorProfile,
  FieldChange,
  FileChangeSummary,
  HandlingWorkbenchCategory,
  PresetId,
  RelationshipLink,
  VehicleConfig,
  VehicleIdentity,
} from './types';

export const SECTION_LABELS = {
  overview: 'Overview',
  handling: 'Handling',
  'vehicle-setup': 'Vehicle setup',
  appearance: 'Appearance',
  relationships: 'Relationships',
  source: 'Source',
} as const;

export const HANDLING_CATEGORY_LABELS: Record<HandlingWorkbenchCategory, string> = {
  physical: 'Physical',
  powertrain: 'Powertrain',
  braking: 'Braking',
  traction: 'Traction',
  suspension: 'Suspension',
  damage: 'Damage',
  advanced: 'Advanced',
};

const FIELD_WORKBENCH_CATEGORY: Partial<
  Record<HandlingFieldDefinition['key'], HandlingWorkbenchCategory>
> = {
  fDriveBiasFront: 'powertrain',
  nInitialDriveGears: 'powertrain',
  fInitialDriveForce: 'powertrain',
  fDriveInertia: 'powertrain',
  fClutchChangeRateScaleUpShift: 'powertrain',
  fClutchChangeRateScaleDownShift: 'powertrain',
  fInitialDriveMaxFlatVel: 'powertrain',
  fSteeringLock: 'traction',
  fTractionCurveMax: 'traction',
  fTractionCurveMin: 'traction',
  fTractionCurveLateral: 'traction',
  fTractionSpringDeltaMax: 'traction',
  fLowSpeedTractionLossMult: 'traction',
  fCamberStiffnesss: 'traction',
  fTractionBiasFront: 'traction',
  fTractionLossMult: 'traction',
  fBrakeForce: 'braking',
  fBrakeBiasFront: 'braking',
  fHandBrakeForce: 'braking',
  fSuspensionForce: 'suspension',
  fSuspensionCompDamp: 'suspension',
  fSuspensionReboundDamp: 'suspension',
  fSuspensionUpperLimit: 'suspension',
  fSuspensionLowerLimit: 'suspension',
  fSuspensionRaise: 'suspension',
  fSuspensionBiasFront: 'suspension',
  fAntiRollBarForce: 'suspension',
  fAntiRollBarBiasFront: 'suspension',
  fRollCentreHeightFront: 'suspension',
  fRollCentreHeightRear: 'suspension',
  fInitialDragCoeff: 'physical',
  fDownforceModifier: 'physical',
  fMass: 'physical',
  fCollisionDamageMult: 'damage',
  fWeaponDamageMult: 'damage',
  fDeformationDamageMult: 'damage',
  fEngineDamageMult: 'damage',
  fPetrolTankVolume: 'advanced',
  fOilVolume: 'advanced',
};

const BALANCE_FIELDS = new Set<HandlingFieldDefinition['key']>([
  'fDriveBiasFront',
  'fBrakeBiasFront',
  'fTractionBiasFront',
  'fSuspensionBiasFront',
  'fAntiRollBarBiasFront',
]);

export function workbenchCategoryForField(
  key: HandlingFieldDefinition['key'],
): HandlingWorkbenchCategory {
  return FIELD_WORKBENCH_CATEGORY[key] ?? 'advanced';
}

export function fieldsForWorkbenchCategory(
  category: HandlingWorkbenchCategory,
  showAdvanced: boolean,
): HandlingFieldDefinition[] {
  return HANDLING_FIELDS.filter((field) => {
    const mapped = workbenchCategoryForField(field.key);
    if (mapped === 'advanced' && !showAdvanced) return false;
    return mapped === category;
  });
}

export function isBalanceField(key: HandlingFieldDefinition['key']): boolean {
  return BALANCE_FIELDS.has(key);
}

export function applyAiHandlingPatch(input: {
  proposal: AiChangeProposal;
  activePath: string;
  handlingName: string;
  handling: HandlingValues;
  setup: HandlingSetup;
}): { handling: HandlingValues; setup: HandlingSetup; attributed: Set<string> } | null {
  const patch = input.proposal.handlingPatch;
  if (!patch) return null;
  if (
    patch.relativePath.replaceAll('\\', '/') !== input.activePath.replaceAll('\\', '/') ||
    patch.handlingName.toLowerCase() !== input.handlingName.toLowerCase()
  ) {
    return null;
  }
  const handling = { ...input.handling };
  const setup: HandlingSetup = {
    ...input.setup,
    centreOfMass: { ...input.setup.centreOfMass },
    inertiaMultiplier: { ...input.setup.inertiaMultiplier },
    seatOffset: { ...input.setup.seatOffset },
  };
  const attributed = new Set<string>();
  for (const [key, value] of Object.entries(patch.values)) {
    if (!Number.isFinite(value)) return null;
    if (key in handling) {
      handling[key as keyof HandlingValues] = value;
      attributed.add(key);
      continue;
    }
    const vectorMatch = /^(centreOfMass|inertiaMultiplier|seatOffset)\.(x|y|z)$/.exec(key);
    if (vectorMatch) {
      const vector = vectorMatch[1] as 'centreOfMass' | 'inertiaMultiplier' | 'seatOffset';
      const axis = vectorMatch[2] as 'x' | 'y' | 'z';
      setup[vector][axis] = value;
      attributed.add(key);
      continue;
    }
    if (key === 'monetaryValue') {
      setup.monetaryValue = Math.round(value);
      attributed.add(key);
      continue;
    }
    return null;
  }
  return { handling, setup, attributed };
}

export function formatDrive(bias: number): string {
  const front = Math.round(bias * 100);
  if (front === 0) return 'RWD';
  if (front === 100) return 'FWD';
  return `${front}/${100 - front} AWD`;
}

export function formatFieldValue(field: HandlingFieldDefinition, value: number): string {
  if (field.nativeType === 'int') return String(Math.round(value));
  return value.toFixed(field.step < 0.01 ? 3 : 2);
}

export function buildBehaviorProfile(handling: HandlingValues): BehaviorProfile {
  const powerBand =
    handling.fInitialDriveForce >= 0.42
      ? 'Very high'
      : handling.fInitialDriveForce >= 0.34
        ? 'High'
        : handling.fInitialDriveForce >= 0.25
          ? 'Balanced'
          : 'Low';
  const tractionWindow = Math.max(0, handling.fTractionCurveMax - handling.fTractionCurveMin);
  const travel = handling.fSuspensionUpperLimit - handling.fSuspensionLowerLimit;
  const compliance =
    handling.fSuspensionForce >= 2.8
      ? 'Firm'
      : handling.fSuspensionForce >= 2.2
        ? 'Balanced'
        : 'Compliant';
  const damageAvg =
    (handling.fCollisionDamageMult + handling.fDeformationDamageMult + handling.fEngineDamageMult) /
    3;

  return {
    driveLayout: formatDrive(handling.fDriveBiasFront),
    driveSplit: `${Math.round(handling.fDriveBiasFront * 100)}% front`,
    acceleration: powerBand,
    topSpeedTendency:
      handling.fInitialDriveMaxFlatVel >= 200
        ? 'High'
        : handling.fInitialDriveMaxFlatVel >= 160
          ? 'Moderate'
          : 'Conservative',
    gripWindow: tractionWindow.toFixed(2),
    steeringResponse:
      handling.fSteeringLock >= 45 ? 'Quick' : handling.fSteeringLock >= 36 ? 'Neutral' : 'Slow',
    brakeBalance: `${Math.round(handling.fBrakeBiasFront * 100)}% front`,
    suspensionCompliance: `${compliance} · ${travel.toFixed(2)} travel`,
    damageResistance: damageAvg <= 0.7 ? 'Durable' : damageAvg >= 1.2 ? 'Fragile' : 'Standard',
  };
}

export function buildBundleConfig(
  config: VehicleConfig,
  pulsePattern?: {
    name: string;
    bpm: number;
    sirenId?: number;
    colors: string[];
    channels: boolean[][];
  },
): MetaFileInput[] {
  const linkedPattern =
    config.emergency && config.includePulse && pulsePattern ? { sirenPattern: pulsePattern } : {};
  return generateVehicleMetaBundle({
    modelName: config.modelName,
    handlingId: config.handlingId,
    displayName: config.displayName,
    makeName: config.makeName,
    audioNameHash: config.audioNameHash,
    layout: config.layout,
    vehicleClass: config.vehicleClass,
    handling: config.handling,
    handlingSetup: config.handlingSetup,
    emergency: config.emergency,
    sirenId: config.sirenId,
    lightId: config.lightId,
    modkitId: config.modkitId,
    ...linkedPattern,
  });
}

function identityChanges(before: VehicleConfig, after: VehicleConfig): FieldChange[] {
  const rows: FieldChange[] = [];
  const pairs: [keyof VehicleIdentity, string, string][] = [
    ['modelName', 'Model name', 'vehicles.meta'],
    ['handlingId', 'Handling ID', 'handling.meta'],
    ['displayName', 'Game name', 'vehicles.meta'],
    ['makeName', 'Manufacturer', 'vehicles.meta'],
    ['audioNameHash', 'Audio profile', 'vehicles.meta'],
    ['layout', 'Layout', 'vehicles.meta'],
    ['vehicleClass', 'Vehicle class', 'vehicles.meta'],
  ] as const;

  for (const [key, label, file] of pairs) {
    if (before[key] !== after[key]) {
      rows.push({
        id: `identity-${key}`,
        label,
        technicalName: key,
        sourceFile: file,
        section: 'identity',
        before: before[key],
        after: after[key],
        beforeValue: before[key],
        afterValue: after[key],
      });
    }
  }
  return rows;
}

function appearanceChanges(before: VehicleConfig, after: VehicleConfig): FieldChange[] {
  const rows: FieldChange[] = [];
  if (before.modkitId !== after.modkitId) {
    rows.push({
      id: 'appearance-modkit',
      label: 'Mod kit',
      technicalName: 'modKit',
      sourceFile: 'carvariations.meta',
      section: 'appearance',
      before: String(before.modkitId),
      after: String(after.modkitId),
      beforeValue: before.modkitId,
      afterValue: after.modkitId,
    });
  }
  if (before.lightId !== after.lightId) {
    rows.push({
      id: 'appearance-light',
      label: 'Light settings',
      technicalName: 'lightSettings',
      sourceFile: 'carvariations.meta',
      section: 'appearance',
      before: String(before.lightId),
      after: String(after.lightId),
      beforeValue: before.lightId,
      afterValue: after.lightId,
    });
  }
  if (before.sirenId !== after.sirenId) {
    rows.push({
      id: 'appearance-siren',
      label: 'Siren settings',
      technicalName: 'sirenSettings',
      sourceFile: 'carvariations.meta',
      section: 'appearance',
      before: String(before.sirenId),
      after: String(after.sirenId),
      beforeValue: before.sirenId,
      afterValue: after.sirenId,
    });
  }
  return rows;
}

export function computeFieldChanges(before: VehicleConfig, after: VehicleConfig): FieldChange[] {
  const handlingChanges: FieldChange[] = [];
  for (const field of HANDLING_FIELDS) {
    const prev = before.handling[field.key];
    const next = after.handling[field.key];
    if (prev === next) continue;
    handlingChanges.push({
      id: `handling-${field.key}`,
      label: field.label,
      technicalName: field.key,
      sourceFile: 'handling.meta',
      section: 'handling',
      category: workbenchCategoryForField(field.key),
      before: formatFieldValue(field, prev),
      after: formatFieldValue(field, next),
      beforeValue: prev,
      afterValue: next,
    });
  }

  const setupKeys = [
    ['centreOfMass', 'Centre of mass', 'vecCentreOfMassOffset'],
    ['inertiaMultiplier', 'Inertia multiplier', 'vecInertiaMultiplier'],
    ['seatOffset', 'Seat offset', 'fSeatOffsetDist'],
    ['monetaryValue', 'Monetary value', 'nMonetaryValue'],
    ['modelFlags', 'Model flags', 'strModelFlags'],
    ['handlingFlags', 'Handling flags', 'strHandlingFlags'],
    ['damageFlags', 'Damage flags', 'strDamageFlags'],
    ['aiHandling', 'AI handling', 'AIHandling'],
    ['subHandling', 'Sub-handling', 'SubHandlingData'],
  ] as const;

  const setupChanges: FieldChange[] = [];
  for (const [key, label, technical] of setupKeys) {
    const prev = before.handlingSetup[key];
    const next = after.handlingSetup[key];
    const prevText = typeof prev === 'object' ? JSON.stringify(prev) : String(prev);
    const nextText = typeof next === 'object' ? JSON.stringify(next) : String(next);
    if (prevText === nextText) continue;
    setupChanges.push({
      id: `setup-${key}`,
      label,
      technicalName: technical,
      sourceFile: 'handling.meta',
      section: 'vehicle-setup',
      before: prevText,
      after: nextText,
      beforeValue: prevText,
      afterValue: nextText,
    });
  }

  return [
    ...identityChanges(before, after),
    ...handlingChanges,
    ...setupChanges,
    ...appearanceChanges(before, after),
  ];
}

export function summarizeFileChanges(
  beforeFiles: MetaFileInput[],
  afterFiles: MetaFileInput[],
): FileChangeSummary[] {
  const beforeMap = new Map(beforeFiles.map((file) => [file.name, file.content]));
  return afterFiles.map((file) => {
    const previous = beforeMap.get(file.name) ?? '';
    const changeCount =
      previous === file.content
        ? 0
        : Math.max(
            0,
            new Set([...previous.split('\n'), ...file.content.split('\n')]).size -
              Math.min(previous.split('\n').length, file.content.split('\n').length),
          );
    return {
      file: file.name.split('/').at(-1) ?? file.name,
      changeCount: previous === file.content ? 0 : Math.max(1, changeCount),
      unchanged: previous === file.content,
    };
  });
}

export function presetPreviewChanges(
  current: HandlingValues,
  presetValues: HandlingValues,
): FieldChange[] {
  const rows: FieldChange[] = [];
  for (const field of HANDLING_FIELDS) {
    const prev = current[field.key];
    const next = presetValues[field.key];
    if (prev === next) continue;
    rows.push({
      id: `preset-${field.key}`,
      label: field.label,
      technicalName: field.key,
      sourceFile: 'handling.meta',
      section: 'handling',
      category: workbenchCategoryForField(field.key),
      before: formatFieldValue(field, prev),
      after: formatFieldValue(field, next),
      beforeValue: prev,
      afterValue: next,
    });
  }
  return rows;
}

export function affectedCategories(changes: FieldChange[]): HandlingWorkbenchCategory[] {
  const categories = new Set<HandlingWorkbenchCategory>();
  for (const change of changes) {
    if (change.category) categories.add(change.category);
  }
  return [...categories];
}

export function buildRelationshipLinks(
  config: VehicleConfig,
  files: MetaFileInput[],
): RelationshipLink[] {
  const diagnosis = diagnoseMetaBundle(files);
  const links: RelationshipLink[] = [
    {
      id: 'model',
      label: 'Vehicle model',
      value: config.modelName,
      targetFile: 'vehicles.meta',
      status: config.modelName ? 'ok' : 'missing',
    },
    {
      id: 'handling',
      label: 'Handling identifier',
      value: config.handlingId,
      targetFile: 'handling.meta',
      status: config.handlingId ? 'ok' : 'missing',
    },
    {
      id: 'texture',
      label: 'Texture dictionary',
      value: config.modelName,
      targetFile: 'vehicles.meta',
      status: config.modelName ? 'ok' : 'missing',
    },
    {
      id: 'game-name',
      label: 'Game name',
      value: config.displayName,
      targetFile: 'vehicles.meta',
      status: config.displayName ? 'ok' : 'warning',
    },
    {
      id: 'modkit',
      label: 'Mod kit',
      value: `${config.modkitId}_${config.modelName}_modkit`,
      targetFile: 'modkits.meta',
      status: config.modkitId > 0 ? 'ok' : 'missing',
    },
    {
      id: 'layout',
      label: 'Layout',
      value: config.layout,
      targetFile: 'vehiclelayouts.meta',
      status: config.layout ? 'ok' : 'missing',
      ...(config.layout
        ? { detail: 'Layout reference is declared; populate vehiclelayouts.meta when needed.' }
        : {}),
    },
    {
      id: 'audio',
      label: 'Audio profile',
      value: config.audioNameHash,
      targetFile: 'vehicles.meta',
      status: config.audioNameHash ? 'ok' : 'missing',
    },
    {
      id: 'variation',
      label: 'Variation entry',
      value: config.modelName,
      targetFile: 'carvariations.meta',
      status: config.modelName ? 'ok' : 'missing',
    },
    {
      id: 'carcols',
      label: 'Carcols bindings',
      value: config.emergency ? `siren ${config.sirenId} · light ${config.lightId}` : 'Standard',
      targetFile: 'carcols.meta',
      status: config.emergency ? 'ok' : 'warning',
      ...(config.emergency ? {} : { detail: 'Emergency bindings inactive.' }),
    },
  ];

  for (const issue of diagnosis.issues) {
    if (issue.severity === 'error') {
      const match = links.find((link) => issue.file.includes(link.targetFile.replace('.meta', '')));
      if (match) {
        match.status = 'conflict';
        match.detail = issue.message;
      }
    }
  }

  return links;
}

export function documentStatusLabel(
  unsavedCount: number,
  blockingErrors: number,
): 'Valid' | 'Unsaved' | 'Invalid' {
  if (blockingErrors > 0) return 'Invalid';
  if (unsavedCount > 0) return 'Unsaved';
  return 'Valid';
}

export function presetLabel(presetId: PresetId, presetBase: HandlingPresetId): string {
  if (presetId === 'custom') {
    return `Custom · based on ${HANDLING_PRESETS[presetBase].label}`;
  }
  return HANDLING_PRESETS[presetId].label;
}
