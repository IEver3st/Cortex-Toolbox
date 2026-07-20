import type { HandlingSetup, HandlingValues, MetaFileInput, MetaIssue } from '@cortex/vehicle-meta';
import type { HandlingPresetId } from '@cortex/vehicle-meta';

export type ChassisSection =
  'overview' | 'handling' | 'vehicle-setup' | 'appearance' | 'relationships' | 'source';

export type HandlingWorkbenchCategory =
  'powertrain' | 'grip' | 'steering' | 'brakes' | 'suspension' | 'aero' | 'damage' | 'advanced';

export type PresetId = HandlingPresetId | 'custom';

export interface VehicleIdentity {
  modelName: string;
  handlingId: string;
  displayName: string;
  makeName: string;
  audioNameHash: string;
  layout: string;
  vehicleClass: string;
}

export interface AppearanceConfig {
  sirenId: number;
  lightId: number;
  modkitId: number;
  emergency: boolean;
  includePulse: boolean;
}

export interface VehicleConfig extends VehicleIdentity, AppearanceConfig {
  handling: HandlingValues;
  handlingSetup: HandlingSetup;
}

export interface FieldChange {
  id: string;
  label: string;
  technicalName: string;
  sourceFile: string;
  section: 'handling' | 'vehicle-setup' | 'appearance' | 'identity';
  category?: HandlingWorkbenchCategory;
  before: string;
  after: string;
  beforeValue: number | string;
  afterValue: number | string;
}

export interface FileChangeSummary {
  file: string;
  changeCount: number;
  unchanged: boolean;
}

export interface BehaviorProfile {
  driveLayout: string;
  driveSplit: string;
  acceleration: string;
  topSpeedTendency: string;
  gripWindow: string;
  steeringResponse: string;
  brakeBalance: string;
  suspensionCompliance: string;
  damageResistance: string;
}

export interface RelationshipLink {
  id: string;
  label: string;
  value: string;
  targetFile: string;
  status: 'ok' | 'missing' | 'conflict' | 'warning';
  detail?: string;
}

export interface ChassisDocumentState {
  config: VehicleConfig;
  files: MetaFileInput[];
  savedConfig: VehicleConfig;
  savedFiles: MetaFileInput[];
  presetId: PresetId;
  presetBase: HandlingPresetId;
  sourceEdited: boolean;
}

export interface ValidationSummary {
  errors: MetaIssue[];
  warnings: MetaIssue[];
  blockingCount: number;
}
