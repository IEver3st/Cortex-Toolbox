/**
 * Staged Align analysis pipeline.
 *
 * Stages:
 * 1. File inventory
 * 2. Independent XML parsing
 * 3. Parser-diagnostic normalization
 * 4. Per-file schema / value validation
 * 5. Symbol extraction
 * 6. Cross-file graph construction
 * 7. Cross-file relationship validation
 * 8. Repair-candidate generation (with revalidation)
 * 9. Coverage reporting
 *
 * Never aborts the whole scan because one file fails.
 */

import { HANDLING_PRESETS } from './handling';
import {
  collectParserDiagnostics,
  constrainedNearMatch,
  detectMetaType,
  isWellFormedXml,
  locationAt,
  offsetToLocation,
  type MetaFileInput,
  type MetaFinding,
  type MetaFileKind,
  type ParserDiagnostic,
  type RepairAvailability,
  type RepairCandidate,
  type SourceLocation,
} from './diagnose';
import {
  HANDLING_NUMERIC_FIELDS,
  KIT_TYPE_ENUM,
  PLATE_TYPE_ENUM,
  VEHICLE_CLASS_ENUM,
  type NumericConstraint,
} from './schema';
import { RELATIONAL_CONSTRAINTS, documentTypesMatch, enumsFor } from './schema-pack';
import {
  checkRange,
  enumNearMatch,
  validateFiniteFloat,
  validateHex,
  validateInteger,
  validateNonEmptyString,
  validateSpaceSeparatedArray,
  validateUnsignedInteger,
} from './type-validators';
import type {
  AnalysisPipelineResult,
  FileInventoryRecord,
  MetaSymbol,
  ParseConfidence,
  ReferenceOutcome,
  ScanCoverage,
  StageState,
  SymbolKind,
  VehicleGraphNode,
} from './pipeline-types';

const REPAIR_CONFIDENCE_THRESHOLD = 0.75;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function fileNameOf(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || path;
}

function splitLines(source: string): string[] {
  return source.split(/\r?\n/);
}

function lineStartOffsets(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function excerptAroundLine(source: string, line: number, radius = 1): string {
  const lines = splitLines(source);
  const start = Math.max(0, line - 1 - radius);
  const end = Math.min(lines.length, line + radius);
  return lines
    .slice(start, end)
    .map((text, index) => `${String(start + index + 1).padStart(4, ' ')} | ${text}`)
    .join('\n');
}

function countChangedLines(before: string, after: string): number {
  const left = splitLines(before);
  const right = splitLines(after);
  const max = Math.max(left.length, right.length);
  let changed = 0;
  for (let index = 0; index < max; index += 1) {
    if ((left[index] ?? '') !== (right[index] ?? '')) changed += 1;
  }
  return changed;
}

function replaceLine(source: string, lineNumber: number, nextLine: string): string {
  const lines = splitLines(source);
  if (lineNumber < 1 || lineNumber > lines.length) return source;
  lines[lineNumber - 1] = nextLine;
  const usesCrLf = source.includes('\r\n');
  return lines.join(usesCrLf ? '\r\n' : '\n');
}

function normalizeSymbol(value: string): string {
  return value.trim().toLowerCase();
}

/** Extract a vehicle-family stem for affinity scoring (not a primary relationship key). */
function vehicleStem(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^(layout_|seat_|cortex_)/, '')
    .replace(/_(driver|passenger|copilot|modkit|modkt)$/g, '')
    .replace(/^\d+_/, '')
    .replace(/^cortex_/, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function stemFromFileName(fileName: string): string | undefined {
  const base = fileName.replace(/\.meta$/i, '');
  const match = /^(?:handling|vehicles|carcols|carvariations|vehiclelayouts|modkits)_(.+)$/i.exec(
    base,
  );
  return match?.[1]?.toLowerCase();
}

function editDistance(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
  for (let i = 0; i < rows; i += 1) grid[i]![0] = i;
  for (let j = 0; j < cols; j += 1) grid[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i]![j] = Math.min(
        (grid[i - 1]![j] ?? 0) + 1,
        (grid[i]![j - 1] ?? 0) + 1,
        (grid[i - 1]![j - 1] ?? 0) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        grid[i]![j] = Math.min(grid[i]![j]!, (grid[i - 2]![j - 2] ?? 0) + 1);
      }
    }
  }
  return grid[a.length]![b.length]!;
}

/**
 * Near-match that prefers same vehicle family and common prefix.
 * Does not suggest identifiers from unrelated vehicles merely because they are similar.
 */
export function affinityNearMatch(
  target: string,
  candidates: readonly { value: string; ownerVehicle?: string }[],
  ownerHint?: string,
): string | null {
  if (candidates.length === 0) return null;
  const targetStem = vehicleStem(target);
  const hintStem = ownerHint ? vehicleStem(ownerHint) : targetStem;

  const filtered = candidates.filter((candidate) => {
    if (!hintStem) return true;
    const candidateStem = candidate.ownerVehicle
      ? vehicleStem(candidate.ownerVehicle)
      : vehicleStem(candidate.value);
    // Same family, or shared long prefix token
    if (candidateStem === hintStem) return true;
    if (candidateStem.includes(hintStem) || hintStem.includes(candidateStem)) return true;
    // Common prefix of at least 4 chars on the raw values
    const a = candidate.value.toLowerCase();
    const b = target.toLowerCase();
    let shared = 0;
    while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared += 1;
    return shared >= Math.min(6, Math.floor(Math.min(a.length, b.length) * 0.5));
  });

  const pool = filtered.length > 0 ? filtered : [];
  if (pool.length === 0) return null;

  // Exact constrained match first among affinity pool
  const values = pool.map((item) => item.value);
  const constrained = constrainedNearMatch(target, values);
  if (constrained) return constrained;

  // Slightly looser distance for long identifiers (modkit names, seats)
  const scored = pool
    .map((item) => ({
      value: item.value,
      distance: editDistance(target, item.value),
    }))
    .filter((entry) => {
      const maxLen = Math.max(target.length, entry.value.length);
      if (entry.distance <= 2) return true;
      if (maxLen >= 12 && entry.distance <= 3) return true;
      return false;
    })
    .sort((a, b) => a.distance - b.distance || a.value.localeCompare(b.value));

  if (scored.length === 0) return null;
  const best = scored[0]!;
  if (scored.length > 1 && scored[1]!.distance === best.distance) return null;
  return best.value;
}

function parseFiniteNumber(raw: string): {
  ok: boolean;
  value: number;
  reason?: 'empty' | 'not-a-number' | 'infinity';
} {
  const result = validateFiniteFloat(raw);
  if (!result.ok) {
    if (/inf/i.test(raw) || /^[+-]?inf/i.test(raw.trim())) {
      return { ok: false, value: Number.NaN, reason: 'infinity' };
    }
    if (raw.trim() === '') return { ok: false, value: Number.NaN, reason: 'empty' };
    return { ok: false, value: Number.NaN, reason: 'not-a-number' };
  }
  return { ok: true, value: result.value as number };
}

function formatPresetSuggestion(fieldKey: string): string | undefined {
  const preset = HANDLING_PRESETS.street.values;
  if (fieldKey in preset) {
    const value = preset[fieldKey as keyof typeof preset];
    if (typeof value !== 'number') return undefined;
    if (Number.isInteger(value) && !fieldKey.startsWith('f')) return String(value);
    return value.toFixed(6);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Finding builders
// ---------------------------------------------------------------------------

interface FindingDraft {
  findingId: string;
  severity?: MetaFinding['severity'];
  category: MetaFinding['category'];
  title: string;
  explanation: string;
  file: string;
  content: string;
  line: number;
  column: number;
  offset: number;
  endOffset: number;
  confidence: number;
  supporting?: ParserDiagnostic[];
  before?: string;
  after?: string;
  repairedContent?: string;
  summary?: string;
  safetyRationale?: string;
  suggestedValue?: string;
  /** Force repair availability (e.g. unverifiable → none). */
  forceAvailability?: RepairAvailability;
}

function buildFinding(draft: FindingDraft): MetaFinding {
  const location: SourceLocation = {
    line: draft.line,
    column: draft.column,
    offset: draft.offset,
    endOffset: draft.endOffset,
  };
  const excerpt = excerptAroundLine(draft.content, draft.line);

  let repair: RepairCandidate | undefined;
  let availability: RepairAvailability = draft.forceAvailability ?? 'none';

  if (
    draft.before !== undefined &&
    draft.after !== undefined &&
    draft.repairedContent !== undefined &&
    draft.forceAvailability !== 'none'
  ) {
    const validated = isWellFormedXml(draft.repairedContent);
    const linesChanged =
      draft.before.includes('\n') || draft.after.includes('\n')
        ? Math.max(1, countChangedLines(draft.before, draft.after))
        : countChangedLines(draft.content, draft.repairedContent) || 1;
    // Prefer counting full-doc line delta when single-line edits
    const lineDelta = countChangedLines(draft.content, draft.repairedContent) || linesChanged;

    const confidence = validated ? draft.confidence : Math.min(draft.confidence, 0.4);
    repair = {
      id: `${draft.findingId}-repair`,
      before: draft.before,
      after: draft.after,
      repairedContent: draft.repairedContent,
      range: location,
      confidence,
      summary: draft.summary ?? draft.title,
      safetyRationale:
        draft.safetyRationale ??
        'Candidate was generated from a constrained schema match and revalidated in memory.',
      validated,
      linesChanged: lineDelta,
      ...(draft.suggestedValue !== undefined ? { suggestedValue: draft.suggestedValue } : {}),
    };

    // Candidate revalidation: repaired XML must parse and not reintroduce the same defect line text
    const revalidated =
      validated &&
      lineDelta <= 3 &&
      confidence >= REPAIR_CONFIDENCE_THRESHOLD &&
      draft.repairedContent !== draft.content;

    if (revalidated) {
      availability = 'candidate';
    } else if (validated && draft.suggestedValue) {
      availability = 'manual';
      repair.confidence = Math.min(repair.confidence, 0.7);
    } else {
      availability = 'manual';
    }
  } else if (draft.forceAvailability) {
    availability = draft.forceAvailability;
  } else if (draft.suggestedValue) {
    availability = 'manual';
  }

  return {
    id: draft.findingId,
    severity: draft.severity ?? 'error',
    category: draft.category,
    title: draft.title,
    explanation: draft.explanation,
    file: draft.file,
    fileName: fileNameOf(draft.file),
    location,
    excerpt,
    confidence: draft.confidence,
    repairAvailability: availability,
    ...(repair && availability !== 'none' ? { repair } : {}),
    supportingDiagnostics: draft.supporting ?? [],
    message: draft.title,
    evidence: `${fileNameOf(draft.file)}:${draft.line}`,
    fixable: availability === 'candidate',
  };
}

function lineValueRepair(
  content: string,
  lineNumber: number,
  beforeSnippet: string,
  afterSnippet: string,
): { before: string; after: string; repairedContent: string } | null {
  const lines = splitLines(content);
  const line = lines[lineNumber - 1];
  if (line === undefined) return null;
  if (!line.includes(beforeSnippet)) return null;
  const fixedLine = line.replace(beforeSnippet, afterSnippet);
  if (fixedLine === line) return null;
  const repairedContent = replaceLine(content, lineNumber, fixedLine);
  return {
    before: line.trimEnd(),
    after: fixedLine.trimEnd(),
    repairedContent,
  };
}

// ---------------------------------------------------------------------------
// Stage 1–3: inventory + independent parse + normalize (XML root handled by caller)
// ---------------------------------------------------------------------------

export function inventoriFiles(inputs: MetaFileInput[]): FileInventoryRecord[] {
  // Stable order by normalized path so async / selection order cannot reshuffle ids.
  const sorted = [...inputs].sort((a, b) =>
    a.name
      .replaceAll('\\', '/')
      .toLowerCase()
      .localeCompare(b.name.replaceAll('\\', '/').toLowerCase()),
  );

  return sorted.map((input, index) => {
    const kind = detectMetaType(input);
    const rawDiagnostics = collectParserDiagnostics(input.content);
    const wellFormed = rawDiagnostics.length === 0 && input.content.trim().length > 0;
    let parseState: StageState = 'ok';
    let parseConfidence: ParseConfidence = 'full';
    if (!input.content.trim()) {
      parseState = 'failed';
      parseConfidence = 'none';
    } else if (!wellFormed) {
      parseState = 'partial';
      parseConfidence = 'partial';
    }

    return {
      id: `file-${String(index).padStart(4, '0')}`,
      name: input.name,
      fileName: fileNameOf(input.name),
      kind,
      content: input.content,
      parseState,
      semanticState: wellFormed ? 'pending' : 'skipped',
      symbolState: 'pending',
      crossFileState: 'pending',
      parseConfidence,
      rawDiagnostics,
      findings: [],
      blockedChecks: [],
      repairCandidates: [],
      silentlySkipped: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Stage 4: per-file schema / value / enum / boolean / uniqueness validation
// ---------------------------------------------------------------------------

/** Extra attribute-value numeric fields outside handling registry. */
const EXTRA_NUMERIC_FIELDS: Record<
  string,
  NumericConstraint & { integerOnly?: boolean; unsigned?: boolean }
> = {
  intensity: { min: 0, max: 100, finite: true },
  frequency: { min: 0, max: 1000, finite: true },
  wheelScale: { min: 0, max: 10, positive: true, finite: true },
  wheelScaleRear: { min: 0, max: 10, positive: true, finite: true },
  falloffMax: { min: 0, max: 1000, finite: true },
  falloffExponent: { min: 0, max: 100, finite: true },
  innerConeAngle: { min: 0, max: 180, finite: true },
  outerConeAngle: { min: 0, max: 180, finite: true },
};

function validateNumericFields(record: FileInventoryRecord): MetaFinding[] {
  const findings: MetaFinding[] = [];
  const pattern = /<([A-Za-z_][\w:.-]*)\b([^>]*?)\bvalue\s*=\s*"([^"]*)"([^>]*?)\/?\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(record.content)) !== null) {
    const tag = match[1] ?? '';
    const rawValue = match[3] ?? '';
    const offset = match.index;
    const loc = offsetToLocation(record.content, offset);

    // Kit / light numeric IDs: unsigned integer (strict)
    if (tag === 'id' && (record.kind === 'carcols' || record.kind === 'modkits')) {
      const parsed = validateUnsignedInteger(rawValue);
      if (!parsed.ok) {
        findings.push(
          buildFinding({
            findingId: `id-uint-${record.id}-${loc.line}`,
            category: 'value',
            title: parsed.title,
            explanation: `id ${parsed.reason}.`,
            file: record.name,
            content: record.content,
            line: loc.line,
            column: loc.column,
            offset,
            endOffset: offset + match[0].length,
            confidence: 0.99,
            forceAvailability: 'manual',
          }),
        );
      }
      continue;
    }

    const handlingConstraint: NumericConstraint | undefined = HANDLING_NUMERIC_FIELDS[tag];
    const extra = EXTRA_NUMERIC_FIELDS[tag];
    const isIntField =
      tag.startsWith('n') && handlingConstraint !== undefined
        ? true
        : tag === 'nInitialDriveGears' || tag === 'nMonetaryValue' || tag === 'frequency';

    if (!handlingConstraint && !extra) continue;

    const constraint = handlingConstraint ?? extra!;
    let problem: string | null = null;
    let title = 'Invalid numeric value';
    let parsedOk = false;
    let numericValue = Number.NaN;

    if (isIntField) {
      const intResult = validateInteger(rawValue);
      if (!intResult.ok) {
        problem = `${tag} ${intResult.reason}.`;
        title = intResult.title.includes('integer') ? 'Invalid integer value' : intResult.title;
      } else {
        parsedOk = true;
        numericValue = intResult.value as number;
      }
    } else {
      const parsed = parseFiniteNumber(rawValue);
      if (!parsed.ok) {
        if (parsed.reason === 'infinity') {
          problem = `${tag} must be a finite number, but received "${rawValue}" (infinity).`;
          title = 'Non-finite numeric value';
        } else {
          problem = `${tag} expects a finite numeric value, but received "${rawValue}".`;
        }
      } else {
        parsedOk = true;
        numericValue = parsed.value;
      }
    }

    if (parsedOk) {
      const rangeArgs: {
        min?: number;
        max?: number;
        positive?: boolean;
        nonNegative?: boolean;
      } = {};
      if (constraint.min !== undefined) rangeArgs.min = constraint.min;
      if (constraint.max !== undefined) rangeArgs.max = constraint.max;
      if (constraint.positive !== undefined) rangeArgs.positive = constraint.positive;
      if (extra?.min === 0 && !constraint.positive) rangeArgs.nonNegative = true;
      const rangeCheck = checkRange(numericValue, rangeArgs);
      // intensity / petrol etc. non-negative
      if (
        (tag === 'intensity' ||
          tag === 'fPetrolTankVolume' ||
          tag === 'fOilVolume' ||
          tag === 'frequency') &&
        numericValue < 0
      ) {
        problem = `${tag} must be greater than or equal to zero (received ${rawValue}).`;
        title = 'Numeric value out of range';
      } else if (!rangeCheck.ok) {
        problem = `${tag} ${rangeCheck.reason}.`;
        title = rangeCheck.title;
      }
    }

    if (!problem) continue;

    const suggested = formatPresetSuggestion(tag);
    let suggestedValue = suggested;
    if (parsedOk && constraint) {
      if (constraint.positive && numericValue <= 0) {
        suggestedValue =
          constraint.min !== undefined && constraint.min > 0
            ? isIntField
              ? String(constraint.min)
              : constraint.min.toFixed(6)
            : suggested;
      } else if (constraint.max !== undefined && numericValue > constraint.max) {
        suggestedValue = isIntField ? String(constraint.max) : constraint.max.toFixed(6);
      } else if (constraint.min !== undefined && numericValue < constraint.min) {
        suggestedValue = isIntField
          ? String(Math.max(constraint.min, 0))
          : Math.max(constraint.min, 0).toFixed(6);
      }
    }

    const explanation = `${problem}${
      suggestedValue ? `\n\nSuggested reference value:\n${suggestedValue}` : ''
    }`;

    let repairFields: Partial<FindingDraft> = { forceAvailability: 'manual' };
    if (suggestedValue !== undefined) {
      const repair = lineValueRepair(
        record.content,
        loc.line,
        `value="${rawValue}"`,
        `value="${suggestedValue}"`,
      );
      if (repair) {
        repairFields = {
          before: repair.before,
          after: repair.after,
          repairedContent: repair.repairedContent,
          summary: `Set ${tag} to ${suggestedValue}.`,
          safetyRationale: `The value "${rawValue}" is invalid for ${tag}. The suggested replacement is a schema-safe reference value. Review before applying.`,
          suggestedValue,
          confidence: parsedOk ? 0.88 : 0.82,
        };
      }
    }

    findings.push(
      buildFinding({
        findingId: `numeric-${record.id}-${tag}-${loc.line}`,
        category: 'value',
        title,
        explanation,
        file: record.name,
        content: record.content,
        line: loc.line,
        column: loc.column,
        offset,
        endOffset: offset + match[0].length,
        confidence: 0.99,
        ...repairFields,
      }),
    );
  }
  return findings;
}

function validateHexFields(record: FileInventoryRecord): MetaFinding[] {
  const findings: MetaFinding[] = [];
  const pattern = /<(color|diffuseTint)\b([^>]*?)\bvalue\s*=\s*"([^"]*)"([^>]*?)\/?\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(record.content)) !== null) {
    const raw = match[3] ?? '';
    // Only validate values that look like hex attempts (start with 0x) or non-empty
    if (!raw.startsWith('0x') && !raw.startsWith('0X')) continue;
    const result = validateHex(raw);
    if (result.ok) continue;
    const offset = match.index;
    const loc = offsetToLocation(record.content, offset);
    findings.push(
      buildFinding({
        findingId: `hex-${record.id}-${loc.line}`,
        category: 'value',
        title: 'Invalid hexadecimal value',
        explanation: `${match[1]} ${result.reason}.`,
        file: record.name,
        content: record.content,
        line: loc.line,
        column: loc.column,
        offset,
        endOffset: offset + match[0].length,
        confidence: 0.99,
        forceAvailability: 'manual',
      }),
    );
  }
  return findings;
}

function validateEnumFields(record: FileInventoryRecord): MetaFinding[] {
  const findings: MetaFinding[] = [];
  const checks: { tag: string; enums: readonly string[]; label: string }[] = [
    {
      tag: 'vehicleClass',
      enums: enumsFor('vehicleClass', VEHICLE_CLASS_ENUM),
      label: 'vehicle class',
    },
    { tag: 'plateType', enums: enumsFor('plateType', PLATE_TYPE_ENUM), label: 'plate type' },
    { tag: 'kitType', enums: enumsFor('kitType', KIT_TYPE_ENUM), label: 'kit type' },
    { tag: 'wheelType', enums: enumsFor('wheelType'), label: 'wheel type' },
    { tag: 'type', enums: enumsFor('vehicleType'), label: 'vehicle type' },
    { tag: 'AIHandling', enums: enumsFor('AIHandling'), label: 'AI handling' },
    { tag: 'DriveByInfo', enums: enumsFor('DriveByInfo'), label: 'DriveByInfo' },
  ];

  for (const check of checks) {
    // Avoid matching generic <type="..."> attributes — only element text content
    const pattern = new RegExp(`<${check.tag}(?:\\s[^>]*)?>\\s*([^<]+?)\\s*</${check.tag}>`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(record.content)) !== null) {
      const raw = match[1]?.trim() ?? '';
      if (!raw) continue;
      // vehicles.meta <type>VEHICLE_TYPE_*</type> only — skip Item type="CHandlingData"
      if (check.tag === 'type' && !raw.startsWith('VEHICLE_TYPE_')) continue;
      if (check.enums.includes(raw)) continue;

      const suggestion = enumNearMatch(raw, check.enums) ?? constrainedNearMatch(raw, check.enums);
      const offset = match.index;
      const loc = offsetToLocation(record.content, offset);
      const explanation = `"${raw}" is not a known ${check.label}.${
        suggestion
          ? `\n\nExpected likely value:\n${suggestion}`
          : `\n\nKnown values include: ${check.enums.slice(0, 8).join(', ')}…`
      }`;

      let repairFields: Partial<FindingDraft> = suggestion ? {} : { forceAvailability: 'manual' };
      if (suggestion) {
        const repair = lineValueRepair(record.content, loc.line, raw, suggestion);
        if (repair) {
          repairFields = {
            before: repair.before,
            after: repair.after,
            repairedContent: repair.repairedContent,
            summary: `Replace ${raw} with ${suggestion}.`,
            safetyRationale: `Only one known ${check.label} is within constrained edit distance of "${raw}".`,
            suggestedValue: suggestion,
            confidence: 0.93,
          };
        }
      }

      findings.push(
        buildFinding({
          findingId: `enum-${record.id}-${check.tag}-${loc.line}`,
          category: 'value',
          title: `Invalid ${check.label}`,
          explanation,
          file: record.name,
          content: record.content,
          line: loc.line,
          column: loc.column,
          offset,
          endOffset: offset + match[0].length,
          confidence: 0.97,
          ...repairFields,
        }),
      );
    }
  }
  return findings;
}

function validateArrayFields(record: FileInventoryRecord): MetaFinding[] {
  const findings: MetaFinding[] = [];
  const pattern = /<lodDistances\b[^>]*content\s*=\s*"float_array"[^>]*>([^<]*)<\/lodDistances>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(record.content)) !== null) {
    const raw = match[1]?.trim() ?? '';
    const result = validateSpaceSeparatedArray(raw, 'float', 6);
    if (result.ok) continue;
    const offset = match.index;
    const loc = offsetToLocation(record.content, offset);
    findings.push(
      buildFinding({
        findingId: `array-lod-${record.id}-${loc.line}`,
        category: 'value',
        title: 'Wrong array item count',
        explanation: `lodDistances ${result.reason}. GTA vehicle LOD distance arrays require exactly 6 float values.`,
        file: record.name,
        content: record.content,
        line: loc.line,
        column: loc.column,
        offset,
        endOffset: offset + match[0].length,
        confidence: 0.98,
        forceAvailability: 'manual',
      }),
    );
  }
  return findings;
}

function validateRequiredTextFields(record: FileInventoryRecord): MetaFinding[] {
  const findings: MetaFinding[] = [];
  if (record.kind !== 'vehiclelayouts') return findings;
  const pattern = /<SeatBoneName(?:\s[^>]*)?>([^<]*)<\/SeatBoneName>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(record.content)) !== null) {
    const raw = match[1] ?? '';
    const result = validateNonEmptyString(raw);
    if (result.ok) continue;
    const offset = match.index;
    const loc = offsetToLocation(record.content, offset);
    findings.push(
      buildFinding({
        findingId: `required-bone-${record.id}-${loc.line}`,
        category: 'value',
        title: 'Empty required value',
        explanation: `SeatBoneName is required and must be a non-empty bone name.`,
        file: record.name,
        content: record.content,
        line: loc.line,
        column: loc.column,
        offset,
        endOffset: offset + match[0].length,
        confidence: 0.99,
        forceAvailability: 'manual',
      }),
    );
  }
  return findings;
}

function readAttrValueInScope(
  scopeBody: string,
  relativePath: string,
): { raw: string; indexInScope: number } | null {
  // Paths like fTractionCurveMax/@value or outerConeAngle/@value
  const [element, attrPart] = relativePath.split('/');
  if (!element) return null;
  const attr = (attrPart ?? '@value').replace(/^@/, '');
  const pattern = new RegExp(
    `<${element}\\b([^>]*?)\\b${attr}\\s*=\\s*"([^"]*)"([^>]*?)\\/?>`,
    'i',
  );
  const match = pattern.exec(scopeBody);
  if (!match) return null;
  return { raw: match[2] ?? '', indexInScope: match.index ?? 0 };
}

function validateRelationalConstraints(record: FileInventoryRecord): MetaFinding[] {
  const findings: MetaFinding[] = [];
  for (const rule of RELATIONAL_CONSTRAINTS) {
    if (!documentTypesMatch(rule, record.kind)) continue;
    const scopeTag = rule.scope;
    const scopePattern = new RegExp(`<${scopeTag}\\b([^>]*)>([\\s\\S]*?)<\\/${scopeTag}>`, 'gi');
    let scopeMatch: RegExpExecArray | null;
    while ((scopeMatch = scopePattern.exec(record.content)) !== null) {
      const body = scopeMatch[2] ?? '';
      const bodyStart = (scopeMatch.index ?? 0) + scopeMatch[0].indexOf(body);
      const left = readAttrValueInScope(body, rule.assert.left);
      const right = readAttrValueInScope(body, rule.assert.right);
      if (!left || !right) continue;
      const leftNum = parseFiniteNumber(left.raw);
      const rightNum = parseFiniteNumber(right.raw);
      if (!leftNum.ok || !rightNum.ok) continue;

      let ok = true;
      switch (rule.assert.operator) {
        case '>=':
          ok = leftNum.value >= rightNum.value;
          break;
        case '>':
          ok = leftNum.value > rightNum.value;
          break;
        case '<=':
          ok = leftNum.value <= rightNum.value;
          break;
        case '<':
          ok = leftNum.value < rightNum.value;
          break;
        case '==':
          ok = leftNum.value === rightNum.value;
          break;
        case '!=':
          ok = leftNum.value !== rightNum.value;
          break;
      }
      if (ok) continue;

      const leftName = rule.assert.left.split('/')[0] ?? 'left';
      const absIndex = bodyStart + left.indexInScope;
      const loc = offsetToLocation(record.content, absIndex);
      findings.push(
        buildFinding({
          findingId: `rel-${rule.id}-${record.id}-${loc.line}`,
          category: 'value',
          title: 'Relational constraint violated',
          explanation: `${rule.documentation ?? rule.id}: ${leftName} (${left.raw}) must be ${rule.assert.operator} ${rule.assert.right.split('/')[0]} (${right.raw}).`,
          file: record.name,
          content: record.content,
          line: loc.line,
          column: loc.column,
          offset: absIndex,
          endOffset: absIndex + left.raw.length + 20,
          confidence: 0.97,
          forceAvailability: 'manual',
        }),
      );
    }
  }
  return findings;
}

function validateKitUniqueness(record: FileInventoryRecord): MetaFinding[] {
  if (record.kind !== 'carcols' && record.kind !== 'modkits') return [];
  const findings: MetaFinding[] = [];
  const kitsSection = /<Kits(?:\s[^>]*)?>([\s\S]*?)<\/Kits>/i.exec(record.content);
  if (!kitsSection) return [];
  const body = kitsSection[1] ?? '';
  const bodyStart = (kitsSection.index ?? 0) + kitsSection[0].indexOf(body);

  // kitName uniqueness
  const names: { value: string; index: number }[] = [];
  for (const match of body.matchAll(/<kitName>\s*([^<]+?)\s*<\/kitName>/gi)) {
    names.push({ value: match[1]?.trim() ?? '', index: bodyStart + (match.index ?? 0) });
  }
  const seenNames = new Map<string, number>();
  for (const entry of names) {
    const prior = seenNames.get(entry.value);
    if (prior !== undefined) {
      const loc = offsetToLocation(record.content, entry.index);
      const priorLoc = offsetToLocation(record.content, prior);
      findings.push(
        buildFinding({
          findingId: `dup-kitname-${record.id}-${loc.line}`,
          category: 'duplicate-id',
          title: 'Duplicate kit name',
          explanation: `kitName "${entry.value}" is declared more than once (also at line ${priorLoc.line}).`,
          file: record.name,
          content: record.content,
          line: loc.line,
          column: loc.column,
          offset: entry.index,
          endOffset: entry.index + entry.value.length + 20,
          confidence: 0.98,
          forceAvailability: 'manual',
        }),
      );
    } else {
      seenNames.set(entry.value, entry.index);
    }
  }

  // kit id uniqueness (inside Kits only)
  const ids: { value: string; index: number }[] = [];
  for (const match of body.matchAll(/<id\s+value="([^"]*)"\s*\/?\s*>/gi)) {
    ids.push({ value: match[1] ?? '', index: bodyStart + (match.index ?? 0) });
  }
  const seenIds = new Map<string, number>();
  for (const entry of ids) {
    const prior = seenIds.get(entry.value);
    if (prior !== undefined) {
      const loc = offsetToLocation(record.content, entry.index);
      const priorLoc = offsetToLocation(record.content, prior);
      findings.push(
        buildFinding({
          findingId: `dup-kitid-${record.id}-${loc.line}`,
          category: 'duplicate-id',
          title: 'Duplicate kit identifier',
          explanation: `Kit id "${entry.value}" is declared more than once (also at line ${priorLoc.line}).`,
          file: record.name,
          content: record.content,
          line: loc.line,
          column: loc.column,
          offset: entry.index,
          endOffset: entry.index + entry.value.length + 20,
          confidence: 0.98,
          forceAvailability: 'manual',
        }),
      );
    } else {
      seenIds.set(entry.value, entry.index);
    }
  }
  return findings;
}

function validateLayoutUniqueness(record: FileInventoryRecord): MetaFinding[] {
  if (record.kind !== 'vehiclelayouts') return [];
  const findings: MetaFinding[] = [];

  // Layout Name uniqueness under VehicleLayouts
  const layouts = /<VehicleLayouts(?:\s[^>]*)?>([\s\S]*?)<\/VehicleLayouts>/i.exec(record.content);
  if (layouts) {
    const body = layouts[1] ?? '';
    const bodyStart = (layouts.index ?? 0) + layouts[0].indexOf(body);
    const names: { value: string; index: number }[] = [];
    for (const match of body.matchAll(/<Name>\s*([^<]+?)\s*<\/Name>/gi)) {
      names.push({ value: match[1]?.trim() ?? '', index: bodyStart + (match.index ?? 0) });
    }
    const seen = new Map<string, number>();
    for (const entry of names) {
      const prior = seen.get(entry.value);
      if (prior !== undefined) {
        const loc = offsetToLocation(record.content, entry.index);
        const priorLoc = offsetToLocation(record.content, prior);
        findings.push(
          buildFinding({
            findingId: `dup-layout-${record.id}-${loc.line}`,
            category: 'duplicate-id',
            title: 'Duplicate layout name',
            explanation: `Layout name "${entry.value}" is declared more than once (also at line ${priorLoc.line}).`,
            file: record.name,
            content: record.content,
            line: loc.line,
            column: loc.column,
            offset: entry.index,
            endOffset: entry.index + entry.value.length + 14,
            confidence: 0.97,
            forceAvailability: 'manual',
          }),
        );
      } else {
        seen.set(entry.value, entry.index);
      }
    }

    // Duplicate seat entries inside each layout's <Seats> collection
    for (const seatsMatch of body.matchAll(/<Seats(?:\s[^>]*)?>([\s\S]*?)<\/Seats>/gi)) {
      const seatsBody = seatsMatch[1] ?? '';
      const seatsStart = bodyStart + (seatsMatch.index ?? 0) + seatsMatch[0].indexOf(seatsBody);
      const seatItems: { value: string; index: number }[] = [];
      for (const item of seatsBody.matchAll(/<Item>\s*([^<]+?)\s*<\/Item>/gi)) {
        seatItems.push({
          value: item[1]?.trim() ?? '',
          index: seatsStart + (item.index ?? 0),
        });
      }
      const seenSeats = new Map<string, number>();
      for (const entry of seatItems) {
        const prior = seenSeats.get(entry.value);
        if (prior !== undefined) {
          const loc = offsetToLocation(record.content, entry.index);
          const priorLoc = offsetToLocation(record.content, prior);
          findings.push(
            buildFinding({
              findingId: `dup-layout-seat-${record.id}-${loc.line}`,
              category: 'duplicate-id',
              title: 'Duplicate seat in layout collection',
              explanation: `Seat "${entry.value}" appears more than once in the same layout Seats collection (also at line ${priorLoc.line}).`,
              file: record.name,
              content: record.content,
              line: loc.line,
              column: loc.column,
              offset: entry.index,
              endOffset: entry.index + entry.value.length + 12,
              confidence: 0.97,
              forceAvailability: 'manual',
            }),
          );
        } else {
          seenSeats.set(entry.value, entry.index);
        }
      }
    }
  }
  return findings;
}

function seatNameDeclarationCounts(content: string): Map<string, number> {
  const seatInfos = /<SeatInfos(?:\s[^>]*)?>([\s\S]*?)<\/SeatInfos>/i.exec(content);
  const counts = new Map<string, number>();
  if (!seatInfos) return counts;
  for (const match of (seatInfos[1] ?? '').matchAll(/<Name>\s*([^<]+?)\s*<\/Name>/gi)) {
    const name = match[1]?.trim() ?? '';
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function validateShuffleSelfReference(record: FileInventoryRecord): MetaFinding[] {
  if (record.kind !== 'vehiclelayouts') return [];
  const findings: MetaFinding[] = [];
  const seatInfos = /<SeatInfos(?:\s[^>]*)?>([\s\S]*?)<\/SeatInfos>/i.exec(record.content);
  if (!seatInfos) return [];
  const body = seatInfos[1] ?? '';
  const bodyStart = (seatInfos.index ?? 0) + seatInfos[0].indexOf(body);
  // Duplicate seat renames are the root defect; self-links are often a symptom.
  const counts = seatNameDeclarationCounts(record.content);
  const hasDuplicateSeat = [...counts.values()].some((n) => n > 1);

  for (const itemMatch of body.matchAll(/<Item\b[^>]*>([\s\S]*?)<\/Item>/gi)) {
    const itemBody = itemMatch[1] ?? '';
    const itemStart = bodyStart + (itemMatch.index ?? 0) + itemMatch[0].indexOf(itemBody);
    const name = /<Name>\s*([^<]+?)\s*<\/Name>/i.exec(itemBody)?.[1]?.trim();
    const linkMatch = /<ShuffleLink>\s*([^<]+?)\s*<\/ShuffleLink>/i.exec(itemBody);
    if (!name || !linkMatch) continue;
    const link = linkMatch[1]?.trim() ?? '';
    if (link !== name) continue;
    if (hasDuplicateSeat) continue;
    const absIndex = itemStart + (linkMatch.index ?? 0);
    const loc = offsetToLocation(record.content, absIndex);
    findings.push(
      buildFinding({
        findingId: `shuffle-self-${record.id}-${loc.line}`,
        category: 'value',
        title: 'Self-referencing ShuffleLink',
        explanation: `Seat "${name}" ShuffleLink points to itself. Shuffle links must reference a different seat.`,
        file: record.name,
        content: record.content,
        line: loc.line,
        column: loc.column,
        offset: absIndex,
        endOffset: absIndex + link.length + 24,
        confidence: 0.96,
        forceAvailability: 'manual',
      }),
    );
  }
  return findings;
}

function validateLayoutSeatRefs(record: FileInventoryRecord): MetaFinding[] {
  if (record.kind !== 'vehiclelayouts') return [];
  const findings: MetaFinding[] = [];
  const seatInfos = /<SeatInfos(?:\s[^>]*)?>([\s\S]*?)<\/SeatInfos>/i.exec(record.content);
  const declared = new Set(
    [...(seatInfos?.[1] ?? '').matchAll(/<Name>\s*([^<]+?)\s*<\/Name>/gi)].map(
      (m) => m[1]?.trim() ?? '',
    ),
  );
  const counts = seatNameDeclarationCounts(record.content);
  const hasDuplicateSeat = [...counts.values()].some((n) => n > 1);
  const layouts = /<VehicleLayouts(?:\s[^>]*)?>([\s\S]*?)<\/VehicleLayouts>/i.exec(record.content);
  if (!layouts) return [];
  const body = layouts[1] ?? '';
  const bodyStart = (layouts.index ?? 0) + layouts[0].indexOf(body);
  for (const match of body.matchAll(/<Item>\s*([^<]+?)\s*<\/Item>/gi)) {
    const value = match[1]?.trim() ?? '';
    if (!value || declared.has(value)) continue;
    // Only flag seat-like tokens
    if (!/^SEAT_/i.test(value)) continue;
    // When a seat was duplicated under the wrong name, the missing intended seat
    // is a symptom of the uniqueness defect already reported.
    if (hasDuplicateSeat) continue;
    const absIndex = bodyStart + (match.index ?? 0);
    const loc = offsetToLocation(record.content, absIndex);
    const suggestion = affinityNearMatch(
      value,
      [...declared].map((v) => ({ value: v })),
      stemFromFileName(record.fileName),
    );
    let repairFields: Partial<FindingDraft> = { forceAvailability: 'manual' };
    if (suggestion) {
      const repair = lineValueRepair(record.content, loc.line, value, suggestion);
      if (repair) {
        repairFields = {
          before: repair.before,
          after: repair.after,
          repairedContent: repair.repairedContent,
          summary: `Point layout seat to ${suggestion}.`,
          safetyRationale: `Layout references seat "${value}" which is not declared in SeatInfos. Constrained near-match: "${suggestion}".`,
          suggestedValue: suggestion,
          confidence: 0.9,
        };
      }
    }
    findings.push(
      buildFinding({
        findingId: `layout-seat-missing-${record.id}-${loc.line}`,
        category: 'cross-file',
        title: 'Broken layout seat reference',
        explanation: `Layout Seats list references ${value}, but available SeatInfos names are: ${
          [...declared].join(', ') || '(none)'
        }.${suggestion ? `\n\nSuggested match: ${suggestion}` : ''}`,
        file: record.name,
        content: record.content,
        line: loc.line,
        column: loc.column,
        offset: absIndex,
        endOffset: absIndex + value.length + 12,
        confidence: 0.95,
        ...repairFields,
      }),
    );
  }
  return findings;
}

function validateBooleanAttributes(record: FileInventoryRecord): MetaFinding[] {
  const findings: MetaFinding[] = [];
  // Attribute-style booleans commonly used in vehicle meta
  const pattern =
    /<(Item|emmissiveBoost|faceCamera|direction|syncToBpm|rotate|scale|flash|light|spotLight|castShadows|pullCoronaIn|mirrorTexture)\b([^>]*?)\bvalue\s*=\s*"([^"]*)"([^>]*?)\/?\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(record.content)) !== null) {
    const raw = match[3] ?? '';
    if (raw === 'true' || raw === 'false') continue;
    // Only flag clearly boolean-ish mistakes (avoid numeric ids on Item value elsewhere)
    if (
      !/^(true|false)/i.test(raw) &&
      raw !== '1' &&
      raw !== '0' &&
      raw !== 'yes' &&
      raw !== 'no'
    ) {
      // Skip non-boolean looking values on generic Item tags that are kit refs etc.
      if (match[1] === 'Item' && !/true|false|yes|no/i.test(raw)) continue;
    }
    if (
      match[1] === 'Item' &&
      !/truee|falsee|TRUE|FALSE|yes|no|1|0/i.test(raw) &&
      raw !== 'true' &&
      raw !== 'false'
    ) {
      continue;
    }

    const offset = match.index;
    const loc = offsetToLocation(record.content, offset);
    const suggestion =
      /^true/i.test(raw) || raw === '1' || raw.toLowerCase() === 'yes'
        ? 'true'
        : /^false/i.test(raw) || raw === '0' || raw.toLowerCase() === 'no'
          ? 'false'
          : undefined;

    // Dominant match for typos like truee → true
    const fixedSuggestion =
      suggestion ??
      (constrainedNearMatch(raw.toLowerCase(), ['true', 'false']) as string | null) ??
      undefined;

    let repairFields: Partial<FindingDraft> = { forceAvailability: 'manual' };
    if (fixedSuggestion === 'true' || fixedSuggestion === 'false') {
      const repair = lineValueRepair(
        record.content,
        loc.line,
        `value="${raw}"`,
        `value="${fixedSuggestion}"`,
      );
      if (repair) {
        repairFields = {
          before: repair.before,
          after: repair.after,
          repairedContent: repair.repairedContent,
          summary: `Set boolean to ${fixedSuggestion}.`,
          safetyRationale: `Boolean attributes must be exactly "true" or "false". "${raw}" is not valid.`,
          suggestedValue: fixedSuggestion,
          confidence: 0.94,
        };
      }
    }

    findings.push(
      buildFinding({
        findingId: `bool-${record.id}-${loc.line}`,
        category: 'value',
        title: 'Invalid boolean value',
        explanation: `Expected "true" or "false", but received "${raw}". Arbitrary truthy strings are not accepted.`,
        file: record.name,
        content: record.content,
        line: loc.line,
        column: loc.column,
        offset,
        endOffset: offset + match[0].length,
        confidence: 0.98,
        ...repairFields,
      }),
    );
  }
  return findings;
}

function validateSeatUniqueness(record: FileInventoryRecord): MetaFinding[] {
  if (record.kind !== 'vehiclelayouts') return [];
  const findings: MetaFinding[] = [];

  // Collect seat Name declarations inside SeatInfos only
  const seatInfos = /<SeatInfos(?:\s[^>]*)?>([\s\S]*?)<\/SeatInfos>/i.exec(record.content);
  if (!seatInfos) return [];
  const body = seatInfos[1] ?? '';
  const bodyStart = (seatInfos.index ?? 0) + seatInfos[0].indexOf(body);

  const names: { value: string; index: number }[] = [];
  for (const match of body.matchAll(/<Name>\s*([^<]+?)\s*<\/Name>/gi)) {
    names.push({
      value: match[1]?.trim() ?? '',
      index: bodyStart + (match.index ?? 0),
    });
  }

  const seen = new Map<string, { value: string; index: number }>();
  for (const entry of names) {
    if (!entry.value) continue;
    const key = entry.value;
    const prior = seen.get(key);
    if (prior) {
      const loc = offsetToLocation(record.content, entry.index);
      const priorLoc = offsetToLocation(record.content, prior.index);

      // Suggest alternate from layout Seats list if unambiguous
      const seatsSection =
        /<Seats(?:\s[^>]*)?>([\s\S]*?)<\/Seats>/i.exec(record.content)?.[1] ?? '';
      const layoutSeats = [...seatsSection.matchAll(/<Item>\s*([^<]+?)\s*<\/Item>/gi)].map(
        (m) => m[1]?.trim() ?? '',
      );
      const missing = layoutSeats.filter(
        (seat) => seat && !names.some((n, idx) => n.value === seat && names.indexOf(n) === idx),
      );
      // Prefer a seat listed in Seats but not uniquely declared
      const declaredCounts = new Map<string, number>();
      for (const n of names) declaredCounts.set(n.value, (declaredCounts.get(n.value) ?? 0) + 1);
      const underDeclared = layoutSeats.filter((seat) => (declaredCounts.get(seat) ?? 0) < 1);
      const suggestion =
        underDeclared.length === 1
          ? underDeclared[0]
          : missing.length === 1
            ? missing[0]
            : undefined;

      let repairFields: Partial<FindingDraft> = { forceAvailability: 'manual' };
      if (suggestion) {
        const repair = lineValueRepair(record.content, loc.line, entry.value, suggestion);
        if (repair) {
          repairFields = {
            before: repair.before,
            after: repair.after,
            repairedContent: repair.repairedContent,
            summary: `Rename duplicate seat to ${suggestion}.`,
            safetyRationale: `Seat identifier "${entry.value}" is declared more than once. The layout seat list references "${suggestion}" which has no unique declaration.`,
            suggestedValue: suggestion,
            confidence: 0.9,
          };
        }
      }

      findings.push(
        buildFinding({
          findingId: `dup-seat-${record.id}-${loc.line}`,
          category: 'duplicate-id',
          title: 'Duplicate seat identifier',
          explanation: `Seat identifier "${entry.value}" is declared more than once (also at line ${priorLoc.line}).${
            suggestion ? `\n\nSuggested rename for this declaration:\n${suggestion}` : ''
          }`,
          file: record.name,
          content: record.content,
          line: loc.line,
          column: loc.column,
          offset: entry.index,
          endOffset: entry.index + entry.value.length + 14,
          confidence: 0.96,
          ...repairFields,
        }),
      );
    } else {
      seen.set(key, entry);
    }
  }
  return findings;
}

export function runSemanticValidation(record: FileInventoryRecord): MetaFinding[] {
  if (record.parseConfidence !== 'full') {
    record.semanticState = 'skipped';
    record.blockedChecks.push('semantic-validation-requires-well-formed-xml');
    return [];
  }
  const findings = [
    ...validateNumericFields(record),
    ...validateHexFields(record),
    ...validateEnumFields(record),
    ...validateBooleanAttributes(record),
    ...validateArrayFields(record),
    ...validateRequiredTextFields(record),
    ...validateRelationalConstraints(record),
    ...validateKitUniqueness(record),
    ...validateSeatUniqueness(record),
    ...validateLayoutUniqueness(record),
    ...validateShuffleSelfReference(record),
    ...validateLayoutSeatRefs(record),
  ];
  record.semanticState = findings.length > 0 ? 'partial' : 'ok';
  return findings;
}

// ---------------------------------------------------------------------------
// Stage 5: symbol extraction (trusted + bounded recovery)
// ---------------------------------------------------------------------------

function pushSymbol(
  symbols: MetaSymbol[],
  record: FileInventoryRecord,
  kind: SymbolKind,
  value: string,
  index: number,
  ownerVehicle?: string,
): void {
  if (!value) return;
  const loc = offsetToLocation(record.content, index);
  symbols.push({
    kind,
    value,
    normalized: normalizeSymbol(value),
    originalCasing: value,
    sourceFileId: record.id,
    sourceFile: record.name,
    sourceFileName: record.fileName,
    location: {
      ...locationAt(record.content, index, index + value.length),
      line: loc.line,
      column: loc.column,
    },
    metadataType: record.kind,
    ownerVehicle: ownerVehicle ?? stemFromFileName(record.fileName) ?? vehicleStem(value),
    parseConfidence: record.parseConfidence === 'full' ? 'full' : 'partial',
  });
}

function extractTextTags(content: string, tag: string): { value: string; index: number }[] {
  return [...content.matchAll(new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`, 'gi'))].map(
    (match) => ({
      value: match[1]?.trim() ?? '',
      index: match.index ?? 0,
    }),
  );
}

export function extractSymbols(record: FileInventoryRecord): MetaSymbol[] {
  const symbols: MetaSymbol[] = [];
  // Always attempt extraction — partial recovery for malformed files.
  // Symbols from partial parses are marked partial and never trusted as sole Resolved proof.

  const ownerHint = stemFromFileName(record.fileName);

  if (record.kind === 'handling' || /<handlingName>/i.test(record.content)) {
    for (const item of extractTextTags(record.content, 'handlingName')) {
      pushSymbol(symbols, record, 'handlingName', item.value, item.index, ownerHint);
    }
  }

  if (record.kind === 'vehicles' || /<CVehicleModelInfo__InitDataList\b/i.test(record.content)) {
    for (const item of extractTextTags(record.content, 'modelName')) {
      pushSymbol(
        symbols,
        record,
        'modelName',
        item.value,
        item.index,
        ownerHint ?? vehicleStem(item.value),
      );
    }
    for (const item of extractTextTags(record.content, 'handlingId')) {
      pushSymbol(symbols, record, 'handlingId', item.value, item.index, ownerHint);
    }
    // layout values in vehicles.meta are references, not declarations — collected at validation time
    for (const item of extractTextTags(record.content, 'txdName')) {
      pushSymbol(symbols, record, 'txdName', item.value, item.index, ownerHint);
    }
  }

  if (record.kind === 'carcols' || record.kind === 'modkits' || /<kitName>/i.test(record.content)) {
    for (const item of extractTextTags(record.content, 'kitName')) {
      pushSymbol(
        symbols,
        record,
        'kitName',
        item.value,
        item.index,
        ownerHint ?? vehicleStem(item.value),
      );
    }
  }

  if (record.kind === 'carvariations' || /<CVehicleModelInfoVariation\b/i.test(record.content)) {
    for (const item of extractTextTags(record.content, 'modelName')) {
      pushSymbol(
        symbols,
        record,
        'variationModel',
        item.value,
        item.index,
        ownerHint ?? vehicleStem(item.value),
      );
    }
    // kit refs are collected at validation time — do not index as kitName declarations
  }

  if (record.kind === 'vehiclelayouts' || /<CVehicleMetadata/i.test(record.content)) {
    // Seat names inside SeatInfos
    const seatInfos = /<SeatInfos(?:\s[^>]*)?>([\s\S]*?)<\/SeatInfos>/i.exec(record.content);
    if (seatInfos) {
      const body = seatInfos[1] ?? '';
      const bodyStart = (seatInfos.index ?? 0) + seatInfos[0].indexOf(body);
      for (const match of body.matchAll(/<Name>\s*([^<]+?)\s*<\/Name>/gi)) {
        pushSymbol(
          symbols,
          record,
          'seatName',
          match[1]?.trim() ?? '',
          bodyStart + (match.index ?? 0),
          ownerHint,
        );
      }
      for (const match of body.matchAll(/<ShuffleLink>\s*([^<]+?)\s*<\/ShuffleLink>/gi)) {
        pushSymbol(
          symbols,
          record,
          'shuffleLink',
          match[1]?.trim() ?? '',
          bodyStart + (match.index ?? 0),
          ownerHint,
        );
      }
    }
    // Layout names
    const layouts = /<VehicleLayouts(?:\s[^>]*)?>([\s\S]*?)<\/VehicleLayouts>/i.exec(
      record.content,
    );
    if (layouts) {
      const body = layouts[1] ?? '';
      const bodyStart = (layouts.index ?? 0) + layouts[0].indexOf(body);
      for (const match of body.matchAll(/<Name>\s*([^<]+?)\s*<\/Name>/gi)) {
        pushSymbol(
          symbols,
          record,
          'layoutName',
          match[1]?.trim() ?? '',
          bodyStart + (match.index ?? 0),
          ownerHint,
        );
      }
    }
  }

  record.symbolState =
    record.parseConfidence === 'full'
      ? symbols.length > 0
        ? 'ok'
        : 'ok'
      : symbols.length > 0
        ? 'partial'
        : 'failed';

  return symbols;
}

// ---------------------------------------------------------------------------
// Stage 6–7: graphs + cross-file validation (tri-state references)
// ---------------------------------------------------------------------------

function providerKindsFor(
  target: SymbolKind | 'handlingName' | 'kitName' | 'layoutName' | 'seatName' | 'modelName',
): MetaFileKind[] {
  switch (target) {
    case 'handlingName':
      return ['handling'];
    case 'kitName':
      return ['carcols', 'modkits'];
    case 'layoutName':
      return ['vehiclelayouts'];
    case 'seatName':
      return ['vehiclelayouts'];
    case 'modelName':
      return ['vehicles'];
    default:
      return [];
  }
}

function resolveReference(
  value: string,
  targetKind: 'handlingName' | 'kitName' | 'layoutName' | 'seatName' | 'modelName',
  symbols: MetaSymbol[],
  records: FileInventoryRecord[],
  ownerHint?: string,
): {
  outcome: ReferenceOutcome;
  suggestion: string | null;
  available: string[];
  failedProviders: FileInventoryRecord[];
  trustedProviders: FileInventoryRecord[];
} {
  const providerKinds = providerKindsFor(targetKind);
  const providers = records.filter((r) => providerKinds.includes(r.kind));
  const trustedProviders = providers.filter((r) => r.parseConfidence === 'full');
  const failedProviders = providers.filter((r) => r.parseConfidence !== 'full');

  const isDeclaration = (s: MetaSymbol): boolean => {
    if (s.kind !== targetKind) return false;
    // Declarations live on provider file kinds only
    const kinds = providerKindsFor(targetKind);
    return kinds.includes(s.metadataType);
  };

  const trustedSymbols = symbols.filter((s) => isDeclaration(s) && s.parseConfidence === 'full');
  const partialSymbols = symbols.filter((s) => isDeclaration(s) && s.parseConfidence === 'partial');

  const trustedValues = trustedSymbols.map((s) => s.value);
  const partialValues = partialSymbols.map((s) => s.value);

  // No provider files selected in this batch → cannot validate the relationship
  if (providers.length === 0) {
    return {
      outcome: 'unverifiable',
      suggestion: null,
      available: [],
      failedProviders: [],
      trustedProviders: [],
    };
  }

  if (trustedValues.some((v) => v === value)) {
    return {
      outcome: 'resolved',
      suggestion: null,
      available: trustedValues,
      failedProviders,
      trustedProviders,
    };
  }

  // Exact match only in partial (untrusted) index → unverifiable, not missing
  if (partialValues.some((v) => v === value)) {
    return {
      outcome: 'unverifiable',
      suggestion: null,
      available: [...trustedValues, ...partialValues],
      failedProviders,
      trustedProviders,
    };
  }

  const affinityPool = [...trustedSymbols, ...partialSymbols].map((s) => {
    const entry: { value: string; ownerVehicle?: string } = { value: s.value };
    if (s.ownerVehicle !== undefined) entry.ownerVehicle = s.ownerVehicle;
    return entry;
  });
  const suggestion = affinityNearMatch(value, affinityPool, ownerHint);

  if (failedProviders.length > 0 && trustedProviders.length === 0) {
    // No trusted providers — can still surface a typo if near-match against partial is clear
    if (suggestion) {
      return {
        outcome: 'missing', // intentional defect diagnosable via recovered symbols
        suggestion,
        available: partialValues,
        failedProviders,
        trustedProviders,
      };
    }
    return {
      outcome: 'unverifiable',
      suggestion: null,
      available: partialValues,
      failedProviders,
      trustedProviders,
    };
  }

  if (failedProviders.length > 0 && !suggestion) {
    // Some providers failed and we cannot prove absence
    return {
      outcome: 'unverifiable',
      suggestion: null,
      available: trustedValues,
      failedProviders,
      trustedProviders,
    };
  }

  // All relevant providers trusted (or we have a clear typo suggestion)
  return {
    outcome: 'missing',
    suggestion,
    available: trustedValues,
    failedProviders,
    trustedProviders,
  };
}

function collectRefs(content: string, tag: string): { value: string; index: number }[] {
  return extractTextTags(content, tag);
}

function collectKitRefs(content: string): { value: string; index: number }[] {
  const kits = /<kits(?:\s[^>]*)?>([\s\S]*?)<\/kits>/i.exec(content);
  if (!kits) return [];
  const body = kits[1] ?? '';
  const bodyStart = (kits.index ?? 0) + kits[0].indexOf(body);
  return [...body.matchAll(/<Item>\s*([^<]+?)\s*<\/Item>/gi)].map((match) => ({
    value: match[1]?.trim() ?? '',
    index: bodyStart + (match.index ?? 0),
  }));
}

function collectShuffleLinks(content: string): { value: string; index: number }[] {
  return extractTextTags(content, 'ShuffleLink');
}

export function buildVehicleGraphs(
  records: FileInventoryRecord[],
  symbols: MetaSymbol[],
): VehicleGraphNode[] {
  const graphs = new Map<string, VehicleGraphNode>();

  const ensure = (key: string): VehicleGraphNode => {
    let node = graphs.get(key);
    if (!node) {
      node = {
        vehicleKey: key,
        modelNames: [],
        handlingIds: [],
        variationModels: [],
        kitRefs: [],
        layoutRefs: [],
        seats: [],
        shuffleLinks: [],
        sourceFileIds: [],
      };
      graphs.set(key, node);
    }
    return node;
  };

  for (const symbol of symbols) {
    const key = symbol.ownerVehicle || vehicleStem(symbol.value) || symbol.sourceFileId;
    const node = ensure(key);
    if (!node.sourceFileIds.includes(symbol.sourceFileId)) {
      node.sourceFileIds.push(symbol.sourceFileId);
    }
    switch (symbol.kind) {
      case 'modelName':
        if (!node.modelNames.includes(symbol.value)) node.modelNames.push(symbol.value);
        break;
      case 'handlingId':
      case 'handlingName':
        if (!node.handlingIds.includes(symbol.value)) node.handlingIds.push(symbol.value);
        break;
      case 'variationModel':
        if (!node.variationModels.includes(symbol.value)) node.variationModels.push(symbol.value);
        break;
      case 'kitName':
        // Declarations only — refs are tracked during cross-file validation
        break;
      case 'layoutName':
        if (symbol.metadataType === 'vehiclelayouts') {
          if (!node.layoutRefs.includes(symbol.value)) node.layoutRefs.push(symbol.value);
        }
        break;
      case 'seatName':
        if (!node.seats.includes(symbol.value)) node.seats.push(symbol.value);
        break;
      case 'shuffleLink':
        if (!node.shuffleLinks.includes(symbol.value)) node.shuffleLinks.push(symbol.value);
        break;
      default:
        break;
    }
  }

  // Filename-hint linkage for files that only have partial symbols
  for (const record of records) {
    const stem = stemFromFileName(record.fileName);
    if (!stem) continue;
    const node = ensure(stem);
    if (!node.sourceFileIds.includes(record.id)) node.sourceFileIds.push(record.id);
  }

  return [...graphs.values()].sort((a, b) => a.vehicleKey.localeCompare(b.vehicleKey));
}

export function runCrossFileValidation(
  records: FileInventoryRecord[],
  symbols: MetaSymbol[],
): MetaFinding[] {
  const findings: MetaFinding[] = [];
  let checksCompleted = 0;
  let checksBlocked = 0;

  for (const record of records) {
    // Cross-file checks require the *consumer* to be well-formed enough to trust its refs
    if (record.parseConfidence !== 'full') {
      record.crossFileState = 'skipped';
      record.blockedChecks.push('cross-file-consumer-not-well-formed');
      continue;
    }

    const ownerHint = stemFromFileName(record.fileName);
    const fileFindings: MetaFinding[] = [];

    // vehicles.meta → handlingName
    if (record.kind === 'vehicles') {
      for (const ref of collectRefs(record.content, 'handlingId')) {
        checksCompleted += 1;
        const result = resolveReference(ref.value, 'handlingName', symbols, records, ownerHint);
        if (result.outcome === 'resolved') continue;
        if (result.outcome === 'unverifiable') {
          checksBlocked += 1;
          record.blockedChecks.push(`handling-ref-unverifiable:${ref.value}`);
          // Info-level disclosure only when no clear typo
          fileFindings.push(
            buildFinding({
              findingId: `handling-unverifiable-${record.id}-${ref.index}`,
              severity: 'info',
              category: 'cross-file',
              title: 'Handling reference could not be verified',
              explanation: `Handling reference "${ref.value}" could not be verified because one or more handling provider files could not be fully parsed.${
                result.failedProviders.length
                  ? `\n\nBlocked providers: ${result.failedProviders.map((p) => p.fileName).join(', ')}`
                  : ''
              }`,
              file: record.name,
              content: record.content,
              line: offsetToLocation(record.content, ref.index).line,
              column: offsetToLocation(record.content, ref.index).column,
              offset: ref.index,
              endOffset: ref.index + ref.value.length,
              confidence: 0.7,
              forceAvailability: 'none',
            }),
          );
          continue;
        }

        // missing
        const loc = offsetToLocation(record.content, ref.index);
        const suggestion = result.suggestion;
        let repairFields: Partial<FindingDraft> = { forceAvailability: 'manual' };
        if (suggestion) {
          const repair = lineValueRepair(record.content, loc.line, ref.value, suggestion);
          if (repair) {
            repairFields = {
              before: repair.before,
              after: repair.after,
              repairedContent: repair.repairedContent,
              summary: `Point handlingId to ${suggestion}.`,
              safetyRationale: `vehicles.meta references "${ref.value}", which is not defined. The only carefully constrained near-match is "${suggestion}".`,
              suggestedValue: suggestion,
              confidence: 0.92,
            };
          }
        }
        fileFindings.push(
          buildFinding({
            findingId: `handling-missing-${record.id}-${loc.line}`,
            category: 'cross-file',
            title: 'Broken handling reference',
            explanation: `vehicles.meta references ${ref.value}, but available handlingName values are: ${
              result.available.join(', ') || '(none)'
            }.${suggestion ? `\n\nSuggested match: ${suggestion}` : ''}`,
            file: record.name,
            content: record.content,
            line: loc.line,
            column: loc.column,
            offset: ref.index,
            endOffset: ref.index + ref.value.length,
            confidence: 0.95,
            ...repairFields,
          }),
        );
      }

      // vehicles.meta → layout
      for (const ref of collectRefs(record.content, 'layout')) {
        if (!ref.value || ref.value === 'null') continue;
        checksCompleted += 1;
        const result = resolveReference(ref.value, 'layoutName', symbols, records, ownerHint);
        if (result.outcome === 'resolved') continue;
        if (result.outcome === 'unverifiable') {
          checksBlocked += 1;
          record.blockedChecks.push(`layout-ref-unverifiable:${ref.value}`);
          // Only surface as info if no better local finding later; still count blocked
          continue;
        }
        const loc = offsetToLocation(record.content, ref.index);
        const suggestion = result.suggestion;
        let repairFields: Partial<FindingDraft> = { forceAvailability: 'manual' };
        if (suggestion) {
          const repair = lineValueRepair(record.content, loc.line, ref.value, suggestion);
          if (repair) {
            repairFields = {
              before: repair.before,
              after: repair.after,
              repairedContent: repair.repairedContent,
              summary: `Point layout to ${suggestion}.`,
              safetyRationale: `Layout "${ref.value}" is not defined. Constrained near-match: "${suggestion}".`,
              suggestedValue: suggestion,
              confidence: 0.92,
            };
          }
        }
        fileFindings.push(
          buildFinding({
            findingId: `layout-missing-${record.id}-${loc.line}`,
            category: 'cross-file',
            title: 'Broken layout reference',
            explanation: `vehicles.meta references layout ${ref.value}, but available layout names are: ${
              result.available.join(', ') || '(none)'
            }.${suggestion ? `\n\nSuggested match: ${suggestion}` : ''}`,
            file: record.name,
            content: record.content,
            line: loc.line,
            column: loc.column,
            offset: ref.index,
            endOffset: ref.index + ref.value.length,
            confidence: 0.95,
            ...repairFields,
          }),
        );
      }
    }

    // carvariations → kitName + modelName
    if (record.kind === 'carvariations') {
      for (const ref of collectKitRefs(record.content)) {
        checksCompleted += 1;
        const result = resolveReference(ref.value, 'kitName', symbols, records, ownerHint);
        if (result.outcome === 'resolved') continue;

        if (result.outcome === 'unverifiable') {
          checksBlocked += 1;
          record.blockedChecks.push(`modkit-ref-unverifiable:${ref.value}`);
          // Exact match in unparsed provider: do NOT report as broken.
          // Surface as info (not error) so it is not a false-positive root defect.
          const loc = offsetToLocation(record.content, ref.index);
          const providerNames = result.failedProviders.map((p) => p.fileName).join(', ');
          fileFindings.push(
            buildFinding({
              findingId: `modkit-unverifiable-${record.id}-${loc.line}`,
              severity: 'info',
              category: 'cross-file',
              title: 'Modkit reference could not be verified',
              explanation: `Modkit reference could not be verified because ${
                providerNames || 'one or more carcols provider files'
              } could not be fully parsed.\n\nReferenced kit: ${ref.value}${
                result.available.length
                  ? `\nRecovered (untrusted) declarations: ${result.available.join(', ')}`
                  : ''
              }`,
              file: record.name,
              content: record.content,
              line: loc.line,
              column: loc.column,
              offset: ref.index,
              endOffset: ref.index + ref.value.length,
              confidence: 0.75,
              forceAvailability: 'none',
            }),
          );
          continue;
        }

        const loc = offsetToLocation(record.content, ref.index);
        const suggestion = result.suggestion;
        let repairFields: Partial<FindingDraft> = { forceAvailability: 'manual' };
        if (suggestion) {
          const repair = lineValueRepair(record.content, loc.line, ref.value, suggestion);
          if (repair) {
            repairFields = {
              before: repair.before,
              after: repair.after,
              repairedContent: repair.repairedContent,
              summary: `Point kit reference to ${suggestion}.`,
              safetyRationale: `carvariations.meta references "${ref.value}", which is not defined. Constrained near-match: "${suggestion}".`,
              suggestedValue: suggestion,
              confidence: 0.92,
            };
          }
        }
        const providerNote =
          result.failedProviders.length > 0
            ? `\n\nNote: some carcols files could not be fully parsed (${result.failedProviders
                .map((p) => p.fileName)
                .join(', ')}); match uses recovered symbols where needed.`
            : '';
        fileFindings.push(
          buildFinding({
            findingId: `modkit-missing-${record.id}-${loc.line}`,
            category: 'cross-file',
            title: 'Broken modkit reference',
            explanation: `carvariations.meta references ${ref.value}, but available kitName values are: ${
              result.available.join(', ') || '(none)'
            }.${suggestion ? `\n\nSuggested match: ${suggestion}` : ''}${providerNote}`,
            file: record.name,
            content: record.content,
            line: loc.line,
            column: loc.column,
            offset: ref.index,
            endOffset: ref.index + ref.value.length,
            confidence: 0.95,
            ...repairFields,
          }),
        );
      }

      for (const ref of collectRefs(record.content, 'modelName')) {
        checksCompleted += 1;
        const result = resolveReference(ref.value, 'modelName', symbols, records, ownerHint);
        if (result.outcome === 'resolved') continue;
        if (result.outcome === 'unverifiable') {
          checksBlocked += 1;
          record.blockedChecks.push(`model-ref-unverifiable:${ref.value}`);
          // No vehicles providers in batch, or providers unparsed — do not emit a root error
          continue;
        }
        const loc = offsetToLocation(record.content, ref.index);
        const suggestion = result.suggestion;
        let repairFields: Partial<FindingDraft> = { forceAvailability: 'manual' };
        if (suggestion) {
          const repair = lineValueRepair(record.content, loc.line, ref.value, suggestion);
          if (repair) {
            repairFields = {
              before: repair.before,
              after: repair.after,
              repairedContent: repair.repairedContent,
              summary: `Point variation model to ${suggestion}.`,
              safetyRationale: `Variation model "${ref.value}" does not match a declared vehicle model. Constrained near-match: "${suggestion}".`,
              suggestedValue: suggestion,
              confidence: 0.93,
            };
          }
        }
        fileFindings.push(
          buildFinding({
            findingId: `model-missing-${record.id}-${loc.line}`,
            category: 'cross-file',
            title: 'Broken model reference',
            explanation: `carvariations.meta references model ${ref.value}, but available modelName values are: ${
              result.available.join(', ') || '(none)'
            }.${suggestion ? `\n\nSuggested match: ${suggestion}` : ''}`,
            file: record.name,
            content: record.content,
            line: loc.line,
            column: loc.column,
            offset: ref.index,
            endOffset: ref.index + ref.value.length,
            confidence: 0.95,
            ...repairFields,
          }),
        );
      }
    }

    // vehiclelayouts → ShuffleLink seats (same-file + batch seats)
    if (record.kind === 'vehiclelayouts') {
      // When seat identifiers are duplicated, that is the root structural defect.
      // ShuffleLink failures are often symptoms (e.g. passenger seat misnamed as driver).
      const hasDuplicateSeat = record.findings.some(
        (f) => f.category === 'duplicate-id' && /seat/i.test(f.title),
      );

      const localSeats = symbols.filter(
        (s) =>
          s.kind === 'seatName' && s.sourceFileId === record.id && s.parseConfidence === 'full',
      );
      // Unique seat names only — duplicates still count as present for link resolution
      const uniqueSeatValues = [...new Set(localSeats.map((s) => s.value))];

      // Also accept seats listed under <Seats> as intended identities when diagnosing
      const seatsSection =
        /<Seats(?:\s[^>]*)?>([\s\S]*?)<\/Seats>/i.exec(record.content)?.[1] ?? '';
      const layoutSeatList = [...seatsSection.matchAll(/<Item>\s*([^<]+?)\s*<\/Item>/gi)].map(
        (m) => m[1]?.trim() ?? '',
      );

      for (const ref of collectShuffleLinks(record.content)) {
        checksCompleted += 1;
        const localHit = uniqueSeatValues.includes(ref.value);
        if (localHit) continue;

        // If the link target is listed in the layout seat list but missing due to a
        // duplicate misname, suppress the shuffle finding when uniqueness already reported.
        if (hasDuplicateSeat && layoutSeatList.includes(ref.value)) {
          record.blockedChecks.push(`shuffle-suppressed-due-to-duplicate-seat:${ref.value}`);
          continue;
        }

        // Prefer local seats for suggestions
        const suggestion = affinityNearMatch(
          ref.value,
          localSeats.map((s) => {
            const entry: { value: string; ownerVehicle?: string } = { value: s.value };
            if (s.ownerVehicle !== undefined) entry.ownerVehicle = s.ownerVehicle;
            return entry;
          }),
          ownerHint,
        );
        const loc = offsetToLocation(record.content, ref.index);
        let repairFields: Partial<FindingDraft> = { forceAvailability: 'manual' };
        if (suggestion) {
          const repair = lineValueRepair(record.content, loc.line, ref.value, suggestion);
          if (repair) {
            repairFields = {
              before: repair.before,
              after: repair.after,
              repairedContent: repair.repairedContent,
              summary: `Point ShuffleLink to ${suggestion}.`,
              safetyRationale: `ShuffleLink "${ref.value}" does not match a declared seat. Constrained near-match: "${suggestion}".`,
              suggestedValue: suggestion,
              confidence: 0.91,
            };
          }
        }
        fileFindings.push(
          buildFinding({
            findingId: `shuffle-missing-${record.id}-${loc.line}`,
            category: 'cross-file',
            title: 'Broken seat ShuffleLink',
            explanation: `ShuffleLink references ${ref.value}, but available seats are: ${
              uniqueSeatValues.join(', ') || '(none)'
            }.${suggestion ? `\n\nSuggested match: ${suggestion}` : ''}`,
            file: record.name,
            content: record.content,
            line: loc.line,
            column: loc.column,
            offset: ref.index,
            endOffset: ref.index + ref.value.length,
            confidence: 0.95,
            ...repairFields,
          }),
        );
      }
    }

    // Emit errors/warnings as root defects; always retain info (unverifiable) for disclosure.
    // Stats treat info separately so it is not a false-positive "broken" reference.
    findings.push(...fileFindings);

    record.crossFileState = fileFindings.some((f) => f.severity === 'error')
      ? 'partial'
      : fileFindings.length > 0
        ? 'partial'
        : 'ok';
  }

  // Stash counters on a synthetic side channel via blocked checks summary on first record
  if (records[0]) {
    records[0].blockedChecks.push(
      `__coverage_cross_completed:${checksCompleted}`,
      `__coverage_cross_blocked:${checksBlocked}`,
    );
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Stage 8–10: orchestrate pipeline + coverage
// ---------------------------------------------------------------------------

export type XmlRootDiagnose = (file: MetaFileInput) => {
  finding: MetaFinding | null;
  rawDiagnostics: ParserDiagnostic[];
  wellFormed: boolean;
};

export function runAnalysisPipeline(
  inputs: MetaFileInput[],
  diagnoseXml: XmlRootDiagnose,
  bindingFindings?: (files: MetaFileInput[]) => MetaFinding[],
): AnalysisPipelineResult {
  // Stage 1–2: inventory + independent parse state
  const records = inventoriFiles(inputs);
  const rulesExecuted: string[] = [
    'xml-structure',
    'numeric-range',
    'integer-strict',
    'hex',
    'enum',
    'boolean',
    'array-cardinality',
    'required-text',
    'relational',
    'kit-uniqueness',
    'seat-uniqueness',
    'layout-uniqueness',
    'shuffle-self-ref',
    'layout-seat-refs',
    'symbol-extraction',
    'cross-file-handling',
    'cross-file-modkit',
    'cross-file-model',
    'cross-file-layout',
    'cross-file-shuffle',
  ];

  // Stage 3: parser-diagnostic normalization (one root XML finding per file)
  let rawParserDiagnostics = 0;
  for (const record of records) {
    rawParserDiagnostics += record.rawDiagnostics.length;
    if (record.parseConfidence !== 'full') {
      const { finding } = diagnoseXml({ name: record.name, content: record.content });
      if (finding) {
        record.findings.push(finding);
        if (finding.repair) record.repairCandidates.push(finding.repair);
      }
    }
  }

  // Stage 4: semantic validation (well-formed only)
  for (const record of records) {
    const semantic = runSemanticValidation(record);
    for (const finding of semantic) {
      record.findings.push(finding);
      if (finding.repair) record.repairCandidates.push(finding.repair);
    }
  }

  // Stage 5: symbols from every file (trusted or partial recovery)
  const symbols: MetaSymbol[] = [];
  for (const record of records) {
    symbols.push(...extractSymbols(record));
  }

  // Stage 6: vehicle-centered graphs
  const graphs = buildVehicleGraphs(records, symbols);

  // Stage 7: cross-file relationships
  const crossFindings = runCrossFileValidation(records, symbols);
  for (const finding of crossFindings) {
    const record = records.find((r) => r.name === finding.file);
    if (record) {
      // Avoid double-counting if file already has a higher-priority error for same line
      const duplicate = record.findings.some(
        (existing) =>
          existing.location.line === finding.location.line &&
          existing.severity === 'error' &&
          finding.severity === 'info',
      );
      if (duplicate) continue;
      record.findings.push(finding);
      if (finding.repair) record.repairCandidates.push(finding.repair);
    }
  }

  // Legacy binding / duplicate ID repairs across resources (still useful for Chassis)
  if (bindingFindings) {
    const wellFormedInputs = records
      .filter((r) => r.parseConfidence === 'full')
      .map((r) => ({ name: r.name, content: r.content }));
    const extras = bindingFindings(wellFormedInputs);
    for (const finding of extras) {
      const record = records.find((r) => r.name === finding.file);
      if (!record) continue;
      // Skip if this file already has findings covering the same concern
      if (
        record.findings.some(
          (f) =>
            (f.category === finding.category && f.location.line === finding.location.line) ||
            // Cross-file model reference already diagnoses variation↔vehicles mismatch
            (finding.category === 'binding' &&
              /model/i.test(finding.title) &&
              f.category === 'cross-file' &&
              /model/i.test(f.title) &&
              f.location.line === finding.location.line),
        )
      ) {
        continue;
      }
      record.findings.push(finding);
      if (finding.repair) record.repairCandidates.push(finding.repair);
    }
  }

  // Flatten findings in stable file order, then line order
  const findings = records.flatMap((r) =>
    [...r.findings].sort((a, b) => a.location.line - b.location.line || a.id.localeCompare(b.id)),
  );

  // Coverage counters
  let crossCompleted = 0;
  let crossBlocked = 0;
  for (const record of records) {
    for (const check of record.blockedChecks) {
      if (check.startsWith('__coverage_cross_completed:')) {
        crossCompleted = Number(check.split(':')[1] ?? 0);
      }
      if (check.startsWith('__coverage_cross_blocked:')) {
        crossBlocked = Number(check.split(':')[1] ?? 0);
      }
    }
  }

  const coverage: ScanCoverage = {
    filesInventoried: records.length,
    parsedNormally: records.filter((r) => r.parseConfidence === 'full').length,
    parsedWithStructuralFailures: records.filter((r) => r.parseConfidence === 'partial').length,
    unrecoverableParseFailures: records.filter((r) => r.parseConfidence === 'none').length,
    semanticValidationsCompleted: records.filter(
      (r) => r.semanticState !== 'skipped' && r.semanticState !== 'pending',
    ).length,
    filesInSymbolIndex: records.filter((r) => r.symbolState === 'ok' || r.symbolState === 'partial')
      .length,
    filesExcludedFromIndexes: records.filter((r) => r.symbolState === 'failed').length,
    crossFileChecksCompleted: crossCompleted,
    crossFileChecksBlocked: crossBlocked,
    vehicleGraphsBuilt: graphs.length,
    rulesExecuted,
    unsupportedFieldsEncountered: [],
    silentlySkipped: records.filter((r) => r.silentlySkipped).length,
  };

  return {
    files: records,
    symbols,
    graphs,
    findings,
    coverage,
    rawParserDiagnostics,
  };
}

export function formatCoverageReport(coverage: ScanCoverage): string {
  return [
    'SCAN COVERAGE',
    `${coverage.filesInventoried} files inventoried`,
    `${coverage.parsedNormally} parsed normally`,
    `${coverage.parsedWithStructuralFailures} parsed with structural failures`,
    `${coverage.unrecoverableParseFailures} unrecoverable parse failures`,
    `${coverage.semanticValidationsCompleted} semantic validations completed`,
    `${coverage.filesInSymbolIndex} files included in symbol indexes`,
    `${coverage.filesExcludedFromIndexes} files excluded from indexes`,
    `${coverage.vehicleGraphsBuilt} vehicle relationship graphs built`,
    `${coverage.crossFileChecksCompleted} cross-file checks completed`,
    `${coverage.crossFileChecksBlocked} relationship checks blocked by malformed provider files`,
    `${coverage.silentlySkipped} files silently skipped`,
    `Rules executed: ${coverage.rulesExecuted.join(', ')}`,
  ].join('\n');
}
