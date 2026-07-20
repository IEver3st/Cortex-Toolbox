import type {
  MetaFileKind,
  MetaFinding,
  ParserDiagnostic,
  RepairCandidate,
  SourceLocation,
} from './diagnose';

export type StageState = 'pending' | 'ok' | 'partial' | 'failed' | 'skipped' | 'blocked';

export type ParseConfidence = 'full' | 'partial' | 'none';

export type ReferenceOutcome = 'resolved' | 'missing' | 'unverifiable';

export type SymbolKind =
  | 'handlingName'
  | 'handlingId'
  | 'modelName'
  | 'kitName'
  | 'modkitId'
  | 'layoutName'
  | 'seatName'
  | 'shuffleLink'
  | 'variationModel'
  | 'txdName';

export interface MetaSymbol {
  kind: SymbolKind;
  value: string;
  normalized: string;
  originalCasing: string;
  sourceFileId: string;
  sourceFile: string;
  sourceFileName: string;
  location: SourceLocation;
  metadataType: MetaFileKind;
  /** Owning vehicle identity when determinable (model stem / handling family). */
  ownerVehicle?: string;
  parseConfidence: ParseConfidence;
}

export interface FileInventoryRecord {
  /** Stable file id: zero-padded sort order of normalized path. */
  id: string;
  name: string;
  fileName: string;
  kind: MetaFileKind;
  content: string;
  parseState: StageState;
  semanticState: StageState;
  symbolState: StageState;
  crossFileState: StageState;
  parseConfidence: ParseConfidence;
  rawDiagnostics: ParserDiagnostic[];
  findings: MetaFinding[];
  blockedChecks: string[];
  repairCandidates: RepairCandidate[];
  /** True when the file was never processed (must stay false for complete scans). */
  silentlySkipped: boolean;
}

export interface ScanCoverage {
  filesInventoried: number;
  parsedNormally: number;
  parsedWithStructuralFailures: number;
  unrecoverableParseFailures: number;
  semanticValidationsCompleted: number;
  filesInSymbolIndex: number;
  filesExcludedFromIndexes: number;
  crossFileChecksCompleted: number;
  crossFileChecksBlocked: number;
  vehicleGraphsBuilt: number;
  rulesExecuted: string[];
  unsupportedFieldsEncountered: string[];
  silentlySkipped: number;
}

export interface VehicleGraphNode {
  vehicleKey: string;
  modelNames: string[];
  handlingIds: string[];
  variationModels: string[];
  kitRefs: string[];
  layoutRefs: string[];
  seats: string[];
  shuffleLinks: string[];
  sourceFileIds: string[];
}

export interface AnalysisPipelineResult {
  files: FileInventoryRecord[];
  symbols: MetaSymbol[];
  graphs: VehicleGraphNode[];
  findings: MetaFinding[];
  coverage: ScanCoverage;
  rawParserDiagnostics: number;
}
