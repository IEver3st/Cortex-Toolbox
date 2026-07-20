import { formatCoverageReport, runAnalysisPipeline } from './analysis';
import { HANDLING_FIELDS, HANDLING_PRESETS, type HandlingFieldDefinition } from './handling';
import type { FileInventoryRecord, ScanCoverage } from './pipeline-types';

export interface MetaFileInput {
  name: string;
  content: string;
}

export type MetaFileKind =
  'vehicles' | 'handling' | 'carcols' | 'carvariations' | 'vehiclelayouts' | 'modkits' | 'unknown';

export interface SourceLocation {
  line: number;
  column: number;
  /** Character offset — secondary; never the only visible location. */
  offset: number;
  endLine?: number;
  endColumn?: number;
  endOffset?: number;
}

export interface ParserDiagnostic {
  message: string;
  location?: SourceLocation;
  kind:
    'unexpected-close' | 'unclosed' | 'malformed-token' | 'unclosed-quote' | 'bad-entity' | 'other';
  openElementStack?: string[];
  expected?: string;
  encountered?: string;
}

export type RepairAvailability = 'candidate' | 'manual' | 'none';

export interface RepairCandidate {
  id: string;
  before: string;
  after: string;
  /** Full-document content after applying this candidate alone. */
  repairedContent: string;
  range: SourceLocation;
  confidence: number;
  summary: string;
  safetyRationale: string;
  validated: boolean;
  linesChanged: number;
  /** Suggested replacement text for value/reference fixes that still need review. */
  suggestedValue?: string;
}

export type FindingCategory =
  'xml-syntax' | 'value' | 'cross-file' | 'binding' | 'duplicate-id' | 'unknown-type';

export interface MetaFinding {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: FindingCategory;
  title: string;
  explanation: string;
  file: string;
  fileName: string;
  location: SourceLocation;
  excerpt: string;
  confidence: number;
  repairAvailability: RepairAvailability;
  repair?: RepairCandidate;
  supportingDiagnostics: ParserDiagnostic[];
  /** @deprecated Prefer title + explanation. Kept for Chassis consumers. */
  message: string;
  /** @deprecated Prefer excerpt / supportingDiagnostics. */
  evidence: string;
  fixable: boolean;
}

/** Legacy issue shape retained for Chassis and older callers. */
export interface MetaIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  file: string;
  message: string;
  evidence: string;
  fixable: boolean;
}

export interface MetaChange {
  file: string;
  before: string;
  after: string;
  summary: string[];
}

export interface MetaDiagnosisStats {
  files: number;
  filesWithFindings: number;
  rootFindings: number;
  rawParserDiagnostics: number;
  errors: number;
  warnings: number;
  repairCandidates: number;
  preparedFixes: number;
  manualReview: number;
  /** Alias of repairCandidates for older UI. */
  fixes: number;
  /** Info-severity findings (e.g. unverifiable relationships). */
  info?: number;
}

export interface MetaDiagnosis {
  findings: MetaFinding[];
  issues: MetaIssue[];
  /** High-confidence proposed changes (not yet user-prepared). */
  changes: MetaChange[];
  stats: MetaDiagnosisStats;
  /** Technical scan coverage disclosure. */
  coverage?: ScanCoverage;
  /** Human-readable coverage report. */
  coverageReport?: string;
  /** Per-file inventory records from the staged pipeline. */
  fileRecords?: FileInventoryRecord[];
}

const REPAIR_CONFIDENCE_THRESHOLD = 0.75;

/** Tags that are attribute-only value elements in GTA vehicle meta. */
const ATTRIBUTE_ONLY_TAGS = new Set([
  'id',
  'Item',
  ...HANDLING_FIELDS.map((field) => field.key),
  'fPercentSubmerged',
  'nMonetaryValue',
  'sirenSettings',
  'lightSettings',
  'wheelScale',
  'wheelScaleRear',
  'dirtLevelMin',
  'dirtLevelMax',
  'envEffScaleMin',
  'envEffScaleMax',
  'damageMapScale',
  'damageOffsetScale',
  'steerWheelMult',
  'HDTextureDist',
  'minSeatHeight',
  'identicalModelSpawnDistance',
  'maxNumOfSameColor',
  'defaultBodyHealth',
  'pretendOccupantsScale',
  'visibleSpawnDistScale',
  'trackerPathWidth',
  'weaponForceMult',
  'frequency',
  'maxNum',
  'bumpersNeedToCollideWithMap',
  'needsRopeTexture',
  'buoyancySphereSizeScale',
  'sequencerBpm',
  'intensity',
  'size',
  'pull',
  'faceCamera',
  'value',
]);

type NumericFieldMeta = {
  key: string;
  nativeType: 'float' | 'int';
  label: string;
};

const NUMERIC_VALUE_TAGS = new Map<string, NumericFieldMeta>([
  ...HANDLING_FIELDS.map(
    (field: HandlingFieldDefinition) =>
      [field.key, { key: field.key, nativeType: field.nativeType, label: field.label }] as const,
  ),
  [
    'fPercentSubmerged',
    { key: 'fPercentSubmerged', nativeType: 'float', label: 'Percent submerged' },
  ],
  ['nMonetaryValue', { key: 'nMonetaryValue', nativeType: 'int', label: 'Monetary value' }],
  ['sirenSettings', { key: 'sirenSettings', nativeType: 'int', label: 'Siren settings' }],
  ['lightSettings', { key: 'lightSettings', nativeType: 'int', label: 'Light settings' }],
]);

function fileNameOf(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || path;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replaceAll('\\', '/');
}

export function resourceKey(file: string): string {
  const normalized = normalizeName(file);
  const marker = normalized.lastIndexOf('/data/');
  if (marker >= 0) return normalized.slice(0, marker);
  const parts = normalized.split('/');
  parts.pop();
  return parts.join('/') || '.';
}

export function detectMetaType(input: MetaFileInput): MetaFileKind {
  const name = normalizeName(input.name);
  const base = name.slice(name.lastIndexOf('/') + 1);
  // Exact filename suffixes (strong)
  if (name.endsWith('vehicles.meta') || /^vehicles([._-]|$)/i.test(base)) return 'vehicles';
  if (name.endsWith('handling.meta') || /^handling([._-]|$)/i.test(base)) return 'handling';
  if (name.endsWith('carvariations.meta') || /^carvariations([._-]|$)/i.test(base))
    return 'carvariations';
  if (name.endsWith('vehiclelayouts.meta') || /^vehiclelayouts([._-]|$)/i.test(base))
    return 'vehiclelayouts';
  if (name.endsWith('carcols.meta') || /^carcols([._-]|$)/i.test(base)) return 'carcols';
  if (name.endsWith('modkits.meta') || /^modkits([._-]|$)/i.test(base)) return 'modkits';
  // Structural signals (authoritative when present)
  if (/<CVehicleModelInfo__InitDataList\b/i.test(input.content)) return 'vehicles';
  if (/<CHandlingDataMgr\b/i.test(input.content)) return 'handling';
  if (/<CVehicleModelInfoVariation\b/i.test(input.content)) return 'carvariations';
  if (/<CVehicleMetadata(?:Mgr)?\b/i.test(input.content)) return 'vehiclelayouts';
  if (/<CVehicleModelInfoVarGlobal\b/i.test(input.content)) {
    if (/<kitName>/i.test(input.content) && !/<Sirens\b/i.test(input.content)) return 'modkits';
    return 'carcols';
  }
  // Weak filename family hints (handling_atlas.meta, vehicles_blaze.meta, …)
  if (/\bhandling[_-]/i.test(base)) return 'handling';
  if (/\bvehicles[_-]/i.test(base)) return 'vehicles';
  if (/\bcarvariations[_-]/i.test(base)) return 'carvariations';
  if (/\bvehiclelayouts[_-]/i.test(base)) return 'vehiclelayouts';
  if (/\bcarcols[_-]/i.test(base)) return 'carcols';
  if (/\bmodkits[_-]/i.test(base)) return 'modkits';
  return 'unknown';
}

export function offsetToLocation(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const limit = Math.max(0, Math.min(offset, source.length));
  for (let index = 0; index < limit; index += 1) {
    if (source[index] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

export function locationAt(source: string, offset: number, endOffset = offset): SourceLocation {
  const start = offsetToLocation(source, offset);
  const end = offsetToLocation(source, endOffset);
  return {
    line: start.line,
    column: start.column,
    offset,
    endLine: end.line,
    endColumn: end.column,
    endOffset,
  };
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

function replaceRange(source: string, start: number, end: number, replacement: string): string {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

/** Structural + token well-formedness check used to validate repair candidates. */
export function isWellFormedXml(content: string): boolean {
  return collectParserDiagnostics(content).length === 0;
}

/**
 * Collect raw parser diagnostics without collapsing them.
 * Cascades are retained for evidence; callers normalize into root findings.
 */
export function collectParserDiagnostics(content: string): ParserDiagnostic[] {
  const diagnostics: ParserDiagnostic[] = [];
  if (!content.trim()) {
    diagnostics.push({
      message: 'The file is empty.',
      location: locationAt(content, 0),
      kind: 'other',
    });
    return diagnostics;
  }

  const scrubbed = content;
  const stack: string[] = [];
  let index = 0;

  const push = (
    message: string,
    at: number,
    kind: ParserDiagnostic['kind'],
    extra?: Partial<ParserDiagnostic>,
  ) => {
    diagnostics.push({
      message,
      location: locationAt(content, at),
      kind,
      openElementStack: [...stack],
      ...extra,
    });
  };

  while (index < scrubbed.length) {
    const char = scrubbed[index];

    if (char === '<' && scrubbed.startsWith('<!--', index)) {
      const end = scrubbed.indexOf('-->', index + 4);
      if (end < 0) {
        push('Unterminated comment.', index, 'malformed-token');
        break;
      }
      index = end + 3;
      continue;
    }

    if (char === '<' && scrubbed.startsWith('<?', index)) {
      const end = scrubbed.indexOf('?>', index + 2);
      if (end < 0) {
        push('Unterminated processing instruction.', index, 'malformed-token');
        break;
      }
      index = end + 2;
      continue;
    }

    if (char === '<' && scrubbed.startsWith('<![CDATA[', index)) {
      const end = scrubbed.indexOf(']]>', index + 9);
      if (end < 0) {
        push('Unterminated CDATA section.', index, 'malformed-token');
        break;
      }
      index = end + 3;
      continue;
    }

    if (char === '<') {
      const close = scrubbed.indexOf('>', index + 1);
      if (close < 0) {
        // Incomplete tag — may be missing final angle bracket
        const rest = scrubbed.slice(index);
        const partialClose = /^<\/([A-Za-z_][\w:.-]*)\s*$/m.exec(rest);
        if (partialClose) {
          push(
            `Closing tag </${partialClose[1]} is missing its final angle bracket.`,
            index,
            'malformed-token',
            { expected: `</${partialClose[1]}>`, encountered: partialClose[0] },
          );
        } else {
          push('Unterminated tag.', index, 'malformed-token');
        }
        break;
      }

      const raw = scrubbed.slice(index + 1, close).trim();
      if (!raw) {
        push('Empty tag.', index, 'malformed-token');
        index = close + 1;
        continue;
      }

      // Detect unclosed attribute quotes inside the tag body
      const quoteCount = (raw.match(/"/g) ?? []).length;
      if (quoteCount % 2 === 1) {
        push('Unclosed attribute quote inside tag.', index, 'unclosed-quote', {
          openElementStack: [...stack],
        });
      }

      // Detect duplicate attributes on the same start tag
      if (!raw.startsWith('/')) {
        const attrNames = [...raw.matchAll(/\b([A-Za-z_][\w:.-]*)\s*=\s*(?:"[^"]*"|'[^']*')/g)].map(
          (m) => m[1] ?? '',
        );
        const seenAttrs = new Set<string>();
        for (const attr of attrNames) {
          const key = attr.toLowerCase();
          if (seenAttrs.has(key)) {
            push(`Duplicate attribute "${attr}".`, index, 'malformed-token', {
              encountered: attr,
            });
            break;
          }
          seenAttrs.add(key);
        }
      }

      if (raw.startsWith('/')) {
        const tag = /^\/\s*([A-Za-z_][\w:.-]*)/.exec(raw)?.[1];
        if (!tag) {
          push('Malformed closing tag.', index, 'malformed-token');
          index = close + 1;
          continue;
        }
        const expected = stack.at(-1);
        if (!expected) {
          push(`Unexpected closing tag </${tag}>.`, index, 'unexpected-close', {
            encountered: tag,
          });
        } else if (expected !== tag) {
          push(`Unexpected closing tag </${tag}>.`, index, 'unexpected-close', {
            expected,
            encountered: tag,
            openElementStack: [...stack],
          });
          // Do not pop — keep stack for cascade unclosed evidence
        } else {
          stack.pop();
        }
        index = close + 1;
        continue;
      }

      const selfClosing = /\/\s*$/.test(raw);
      const tag = /^([A-Za-z_][\w:.-]*)/.exec(raw)?.[1];
      if (!tag) {
        push('Malformed opening tag.', index, 'malformed-token');
        index = close + 1;
        continue;
      }
      if (!selfClosing) stack.push(tag);
      index = close + 1;
      continue;
    }

    // Bare ampersand / entity references outside tags
    if (char === '&') {
      const entity = /^&(?:([A-Za-z][\w]*)|(#\d+)|(#x[\da-fA-F]+));/.exec(scrubbed.slice(index));
      if (!entity) {
        push('Unescaped ampersand in text content.', index, 'bad-entity');
        index += 1;
        continue;
      }
      const named = entity[1];
      const KNOWN_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);
      if (named && !KNOWN_ENTITIES.has(named.toLowerCase())) {
        push(`Undefined entity &${named};.`, index, 'bad-entity', {
          encountered: entity[0],
          expected: '&amp;',
        });
      }
      index += entity[0].length;
      continue;
    }

    index += 1;
  }

  if (stack.length > 0) {
    const open = stack.at(-1) ?? 'unknown';
    push(`Unclosed tag <${open}>.`, content.length, 'unclosed', {
      openElementStack: [...stack],
      expected: `</${open}>`,
    });
  }

  return diagnostics;
}

interface CandidateBuild {
  findingId: string;
  title: string;
  explanation: string;
  file: string;
  line: number;
  column: number;
  offset: number;
  endOffset: number;
  excerpt: string;
  before: string;
  after: string;
  repairedContent: string;
  confidence: number;
  summary: string;
  safetyRationale: string;
  category: FindingCategory;
  supporting: ParserDiagnostic[];
  suggestedValue?: string;
}

function buildFinding(input: CandidateBuild): MetaFinding {
  const validated = isWellFormedXml(input.repairedContent);
  const lineDelta =
    input.before.includes('\n') || input.after.includes('\n')
      ? Math.max(1, countChangedLines(input.before, input.after))
      : 1;

  const confidence = validated ? input.confidence : Math.min(input.confidence, 0.4);
  const offerRepair = validated && confidence >= REPAIR_CONFIDENCE_THRESHOLD && lineDelta <= 3;

  const location: SourceLocation = {
    line: input.line,
    column: input.column,
    offset: input.offset,
    endOffset: input.endOffset,
  };

  const repair: RepairCandidate = {
    id: `${input.findingId}-repair`,
    before: input.before,
    after: input.after,
    repairedContent: input.repairedContent,
    range: location,
    confidence,
    summary: input.summary,
    safetyRationale: input.safetyRationale,
    validated,
    linesChanged: lineDelta,
    ...(input.suggestedValue !== undefined ? { suggestedValue: input.suggestedValue } : {}),
  };

  const repairAvailability: RepairAvailability = offerRepair
    ? 'candidate'
    : validated
      ? 'manual'
      : 'none';

  return {
    id: input.findingId,
    severity: 'error',
    category: input.category,
    title: input.title,
    explanation: input.explanation,
    file: input.file,
    fileName: fileNameOf(input.file),
    location,
    excerpt: input.excerpt,
    confidence,
    repairAvailability,
    ...(repairAvailability !== 'none' ? { repair } : {}),
    supportingDiagnostics: input.supporting,
    message: input.title,
    evidence: `${fileNameOf(input.file)}:${input.line}`,
    fixable: offerRepair,
  };
}

function tryMissingSelfClose(
  file: MetaFileInput,
  supporting: ParserDiagnostic[],
): MetaFinding | null {
  const lines = splitLines(file.content);
  const starts = lineStartOffsets(file.content);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const match = /^(\s*)<([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")+)\s*>\s*$/.exec(line);
    if (!match) continue;
    const tag = match[2] ?? '';
    const attrs = match[3] ?? '';
    // Skip multi-child container tags (but allow attribute-only Item boolean flags)
    const isAttrOnlyItem = tag === 'Item' && /^\s+value\s*=\s*"(?:true|false)"\s*$/i.test(attrs);
    if (
      (tag === 'Item' && !isAttrOnlyItem) ||
      tag === 'Kits' ||
      tag === 'Sirens' ||
      tag === 'Lights' ||
      tag === 'colors' ||
      tag === 'liveries'
    ) {
      continue;
    }
    if (
      !isAttrOnlyItem &&
      !ATTRIBUTE_ONLY_TAGS.has(tag) &&
      !/^(f|n|b)[A-Z]/.test(tag) &&
      tag !== 'id'
    ) {
      continue;
    }

    // Immediate next meaningful line is a closing parent → treat as empty element
    // (do not accept a later sibling/ancestor </Item> as this element's close).
    let nextMeaningful = '';
    for (let j = lineIndex + 1; j < lines.length; j += 1) {
      const candidate = (lines[j] ?? '').trim();
      if (candidate) {
        nextMeaningful = candidate;
        break;
      }
    }
    const nextIsForeignClose =
      nextMeaningful.startsWith('</') && !new RegExp(`^</${tag}\\s*>`, 'i').test(nextMeaningful);
    const rest = lines.slice(lineIndex + 1).join('\n');
    const hasClose = new RegExp(`</${tag}\\s*>`, 'i').test(rest);
    // A later </Item> belonging to an ancestor is not this element's closer.
    if (hasClose && !nextIsForeignClose) continue;

    const indent = match[1] ?? '';
    const fixedLine = `${indent}<${tag}${attrs} />`;
    const repaired = replaceLine(file.content, lineIndex + 1, fixedLine);
    if (!isWellFormedXml(repaired)) continue;
    if (countChangedLines(file.content, repaired) !== 1) continue;

    const offset = (starts[lineIndex] ?? 0) + line.indexOf('<');
    return buildFinding({
      findingId: `xml-missing-self-close-${file.name}-${lineIndex + 1}`,
      title: 'Element missing self-closing slash',
      explanation: `<${tag}> is written as an opening tag but has no content and no matching close tag. GTA vehicle metadata treats this as an attribute-only value element, so it should be self-closing.`,
      file: file.name,
      line: lineIndex + 1,
      column: line.indexOf('<') + 1,
      offset,
      endOffset: offset + line.trim().length,
      excerpt: excerptAroundLine(file.content, lineIndex + 1),
      before: line.trimEnd(),
      after: fixedLine.trimEnd(),
      repairedContent: repaired,
      confidence: 0.95,
      summary: `Add self-closing slash to <${tag}>.`,
      safetyRationale:
        'The repair only inserts a self-closing slash on one line. The repaired document parses successfully and no other content is modified.',
      category: 'xml-syntax',
      supporting,
    });
  }
  return null;
}

function tryUnexpectedOrMismatchedCloseFromStack(
  file: MetaFileInput,
  supporting: ParserDiagnostic[],
): MetaFinding | null {
  const unexpected = supporting.find((d) => d.kind === 'unexpected-close' && d.encountered);
  if (!unexpected?.location) return null;
  const lines = splitLines(file.content);
  const lineIndex = unexpected.location.line - 1;
  const line = lines[lineIndex] ?? '';
  const closeMatch = /<\/([A-Za-z_][\w:.-]*)\s*>/.exec(line);
  if (!closeMatch) return null;
  const encountered = closeMatch[1] ?? unexpected.encountered ?? '';
  const expected = unexpected.expected;
  const offset = (lineStartOffsets(file.content)[lineIndex] ?? 0) + line.indexOf('</');

  // Prefer stack-expected rename when edit distance is small (kitz→kits) and validates.
  if (expected && expected !== encountered) {
    const fixedLine = line.replace(`</${encountered}>`, `</${expected}>`);
    if (fixedLine !== line) {
      const repaired = replaceLine(file.content, unexpected.location.line, fixedLine);
      if (isWellFormedXml(repaired) && countChangedLines(file.content, repaired) === 1) {
        return buildFinding({
          findingId: `xml-mismatched-close-stack-${file.name}-${unexpected.location.line}`,
          title: 'Mismatched closing tag',
          explanation: `The parser expected </${expected}> but found </${encountered}>. XML requires matching end tags.`,
          file: file.name,
          line: unexpected.location.line,
          column: line.indexOf('</') + 1,
          offset,
          endOffset: offset + encountered.length + 3,
          excerpt: excerptAroundLine(file.content, unexpected.location.line),
          before: line.trimEnd(),
          after: fixedLine.trimEnd(),
          repairedContent: repaired,
          confidence: 0.96,
          summary: `Replace </${encountered}> with </${expected}>.`,
          safetyRationale: `The open-element stack identifies <${expected}> as the matching open tag. Only the closing tag name is rewritten.`,
          category: 'xml-syntax',
          supporting,
        });
      }
    }
  }

  // Orphan / wrong close that is not a near rename of the stack top:
  // convert to self-closing empty element (</windowsWithExposedEdges> → <windowsWithExposedEdges />)
  const asSelfClose = line.replace(`</${encountered}>`, `<${encountered} />`);
  if (asSelfClose !== line) {
    const repaired = replaceLine(file.content, unexpected.location.line, asSelfClose);
    if (isWellFormedXml(repaired) && countChangedLines(file.content, repaired) === 1) {
      return buildFinding({
        findingId: `xml-unexpected-close-${file.name}-${unexpected.location.line}`,
        title: 'Unexpected closing tag',
        explanation: `</${encountered}> appears without a matching open element. An empty element should be written as a self-closing tag.`,
        file: file.name,
        line: unexpected.location.line,
        column: line.indexOf('</') + 1,
        offset,
        endOffset: offset + encountered.length + 3,
        excerpt: excerptAroundLine(file.content, unexpected.location.line),
        before: line.trimEnd(),
        after: asSelfClose.trimEnd(),
        repairedContent: repaired,
        confidence: 0.93,
        summary: `Replace orphan </${encountered}> with <${encountered} />.`,
        safetyRationale:
          'The closing tag has no open counterpart on the stack. Converting it to a self-closing empty element restores well-formed structure on one line.',
        category: 'xml-syntax',
        supporting,
      });
    }
  }
  return null;
}

function tryDuplicateAttribute(
  file: MetaFileInput,
  supporting: ParserDiagnostic[],
): MetaFinding | null {
  const dup = supporting.find(
    (d) => d.kind === 'malformed-token' && /Duplicate attribute/i.test(d.message),
  );
  if (!dup?.location || !dup.encountered) return null;
  const lines = splitLines(file.content);
  const lineIndex = dup.location.line - 1;
  const line = lines[lineIndex] ?? '';
  const attr = dup.encountered;
  // Keep first attribute assignment; drop subsequent duplicates of the same name
  let seen = false;
  const fixedLine = line.replace(new RegExp(`(\\s${attr}\\s*=\\s*"[^"]*")`, 'gi'), (match) => {
    if (!seen) {
      seen = true;
      return match;
    }
    return '';
  });
  if (fixedLine === line) return null;
  const repaired = replaceLine(file.content, dup.location.line, fixedLine);
  if (!isWellFormedXml(repaired)) return null;
  if (countChangedLines(file.content, repaired) !== 1) return null;
  const offset = (lineStartOffsets(file.content)[lineIndex] ?? 0) + line.indexOf('<');
  return buildFinding({
    findingId: `xml-dup-attr-${file.name}-${dup.location.line}`,
    title: 'Duplicate attribute',
    explanation: `Attribute "${attr}" is declared more than once on the same element. XML requires unique attribute names per start tag.`,
    file: file.name,
    line: dup.location.line,
    column: line.indexOf(attr) + 1,
    offset,
    endOffset: offset + line.trim().length,
    excerpt: excerptAroundLine(file.content, dup.location.line),
    before: line.trimEnd(),
    after: fixedLine.trimEnd(),
    repairedContent: repaired,
    confidence: 0.94,
    summary: `Remove duplicate "${attr}" attribute.`,
    safetyRationale:
      'The first attribute assignment is preserved; subsequent duplicates of the same name are removed on a single line.',
    category: 'xml-syntax',
    supporting,
  });
}

function tryUndefinedEntity(
  file: MetaFileInput,
  supporting: ParserDiagnostic[],
): MetaFinding | null {
  const entityDiag = supporting.find(
    (d) => d.kind === 'bad-entity' && /Undefined entity/i.test(d.message),
  );
  if (!entityDiag?.location) return null;
  const lines = splitLines(file.content);
  const lineIndex = entityDiag.location.line - 1;
  const line = lines[lineIndex] ?? '';
  const entityText = entityDiag.encountered ?? /&[A-Za-z][\w]*;/.exec(line)?.[0];
  if (!entityText) return null;
  // Prefer plain &amp; (common "Black & White" intent); fall back to escaped remainder.
  const literal = entityText.slice(1); // e.g. "livery;"
  const ampOnly = line.replace(entityText, '&amp;');
  const escapedRemainder = line.replace(entityText, `&amp;${literal}`);
  for (const candidate of [ampOnly, escapedRemainder]) {
    if (candidate === line) continue;
    const repaired = replaceLine(file.content, entityDiag.location.line, candidate);
    if (!isWellFormedXml(repaired)) continue;
    if (countChangedLines(file.content, repaired) !== 1) continue;
    const offset = (lineStartOffsets(file.content)[lineIndex] ?? 0) + line.indexOf(entityText);
    return buildFinding({
      findingId: `xml-undefined-entity-${file.name}-${entityDiag.location.line}`,
      title: 'Undefined entity',
      explanation: `${entityText} is not a predefined XML entity. Only amp, lt, gt, quot, apos, and numeric character references are valid without a DTD.`,
      file: file.name,
      line: entityDiag.location.line,
      column: line.indexOf(entityText) + 1,
      offset,
      endOffset: offset + entityText.length,
      excerpt: excerptAroundLine(file.content, entityDiag.location.line),
      before: line.trimEnd(),
      after: candidate.trimEnd(),
      repairedContent: repaired,
      confidence: 0.9,
      summary: `Replace undefined entity ${entityText} with an escaped form.`,
      safetyRationale:
        'Only the undefined entity token is rewritten to a well-formed escape. Surrounding text is preserved.',
      category: 'xml-syntax',
      supporting,
    });
  }
  return null;
}

function tryMissingCloseBracket(
  file: MetaFileInput,
  supporting: ParserDiagnostic[],
): MetaFinding | null {
  const lines = splitLines(file.content);
  const starts = lineStartOffsets(file.content);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    // Closing tag missing final >
    const closeMatch = /^(.*<\/([A-Za-z_][\w:.-]*))\s*$/.exec(line);
    if (closeMatch && !line.includes('>', line.lastIndexOf('</'))) {
      const fixedLine = `${closeMatch[1]}>`;
      const repaired = replaceLine(file.content, lineIndex + 1, fixedLine);
      if (!isWellFormedXml(repaired)) continue;
      if (countChangedLines(file.content, repaired) !== 1) continue;
      const offset = (starts[lineIndex] ?? 0) + line.indexOf('</');
      return buildFinding({
        findingId: `xml-missing-close-bracket-${file.name}-${lineIndex + 1}`,
        title: 'Closing tag missing final angle bracket',
        explanation: `The closing tag </${closeMatch[2]} is missing its final ">". This prevents the XML parser from recognizing the end of the element.`,
        file: file.name,
        line: lineIndex + 1,
        column: line.indexOf('</') + 1,
        offset,
        endOffset: (starts[lineIndex] ?? 0) + line.length,
        excerpt: excerptAroundLine(file.content, lineIndex + 1),
        before: line.trimEnd(),
        after: fixedLine.trimEnd(),
        repairedContent: repaired,
        confidence: 0.96,
        summary: `Add missing ">" to </${closeMatch[2]}.`,
        safetyRationale:
          'The repair appends a single ">" to the incomplete closing tag on one line. The repaired document parses successfully.',
        category: 'xml-syntax',
        supporting,
      });
    }

    // Opening/self-closing tag truncated without >
    const openTrunc = /^(.*<[A-Za-z_][\w:.-][^<>]*?)\s*$/.exec(line);
    if (openTrunc && line.includes('<') && !line.includes('>') && !line.trimEnd().endsWith('>')) {
      // Prefer the close-tag path above; skip pure open unless clearly incomplete self-close
      continue;
    }
  }
  return null;
}

function tryUnclosedAttributeQuote(
  file: MetaFileInput,
  supporting: ParserDiagnostic[],
): MetaFinding | null {
  const lines = splitLines(file.content);
  const starts = lineStartOffsets(file.content);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const quoteCount = (line.match(/"/g) ?? []).length;
    if (quoteCount % 2 === 0) continue;
    if (!line.includes('<') || !/=/.test(line)) continue;

    // Insert closing quote before optional / and >
    const fixedLine = line.replace(/(\s*\/\s*>\s*|\s*>\s*)$/, '"$1');
    if (fixedLine === line) {
      // No trailing tag end — append quote at end
      const alt = `${line.trimEnd()}"`;
      const repairedAlt = replaceLine(file.content, lineIndex + 1, alt);
      if (!isWellFormedXml(repairedAlt)) continue;
      // fall through with alt
      const offset = (starts[lineIndex] ?? 0) + Math.max(0, line.indexOf('="') + 1);
      return buildFinding({
        findingId: `xml-unclosed-quote-${file.name}-${lineIndex + 1}`,
        title: 'Unclosed attribute quote',
        explanation:
          'An attribute value opens a quote that is never closed before the tag ends. This leaves the rest of the line inside a string and breaks XML parsing.',
        file: file.name,
        line: lineIndex + 1,
        column: line.indexOf('="') + 2,
        offset,
        endOffset: (starts[lineIndex] ?? 0) + line.length,
        excerpt: excerptAroundLine(file.content, lineIndex + 1),
        before: line.trimEnd(),
        after: alt.trimEnd(),
        repairedContent: repairedAlt,
        confidence: 0.93,
        summary: 'Close the attribute value quote.',
        safetyRationale:
          'The repair inserts a single closing quote on the affected line. No other attributes or elements are rewritten.',
        category: 'xml-syntax',
        supporting,
      });
    }

    const repaired = replaceLine(file.content, lineIndex + 1, fixedLine);
    if (!isWellFormedXml(repaired)) continue;
    if (countChangedLines(file.content, repaired) !== 1) continue;

    const offset = (starts[lineIndex] ?? 0) + Math.max(0, line.indexOf('="') + 1);
    return buildFinding({
      findingId: `xml-unclosed-quote-${file.name}-${lineIndex + 1}`,
      title: 'Unclosed attribute quote',
      explanation:
        'An attribute value opens a quote that is never closed before the tag ends. This leaves the rest of the line inside a string and breaks XML parsing.',
      file: file.name,
      line: lineIndex + 1,
      column: line.indexOf('="') + 2,
      offset,
      endOffset: (starts[lineIndex] ?? 0) + line.length,
      excerpt: excerptAroundLine(file.content, lineIndex + 1),
      before: line.trimEnd(),
      after: fixedLine.trimEnd(),
      repairedContent: repaired,
      confidence: 0.94,
      summary: 'Close the attribute value quote.',
      safetyRationale:
        'The repair inserts a single closing quote immediately before the tag terminator. The repaired document parses successfully and only one line changes.',
      category: 'xml-syntax',
      supporting,
    });
  }
  return null;
}

function tryMismatchedClosingTag(
  file: MetaFileInput,
  supporting: ParserDiagnostic[],
): MetaFinding | null {
  const lines = splitLines(file.content);
  const starts = lineStartOffsets(file.content);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const match = /^(.*)<([A-Za-z_][\w:.-]*)>([^<]*)<\/([A-Za-z_][\w:.-]*)>(.*)$/.exec(line);
    if (!match) continue;
    const open = match[2] ?? '';
    const close = match[4] ?? '';
    if (open === close) continue;

    const fixedLine = `${match[1]}<${open}>${match[3]}</${open}>${match[5]}`;
    const repaired = replaceLine(file.content, lineIndex + 1, fixedLine);
    if (!isWellFormedXml(repaired)) continue;
    if (countChangedLines(file.content, repaired) !== 1) continue;

    const offset = (starts[lineIndex] ?? 0) + line.indexOf(`</${close}>`);
    return buildFinding({
      findingId: `xml-mismatched-close-${file.name}-${lineIndex + 1}`,
      title: 'Mismatched closing tag',
      explanation: `The element opens as <${open}> but closes as </${close}>. XML requires matching end tags. The open tag is treated as authoritative.`,
      file: file.name,
      line: lineIndex + 1,
      column: line.indexOf(`</${close}>`) + 1,
      offset,
      endOffset: offset + close.length + 3,
      excerpt: excerptAroundLine(file.content, lineIndex + 1),
      before: line.trimEnd(),
      after: fixedLine.trimEnd(),
      repairedContent: repaired,
      confidence: 0.97,
      summary: `Replace </${close}> with </${open}>.`,
      safetyRationale: `The repair rewrites only the closing tag name to match the opening <${open}> on the same line. Nested structure is unchanged.`,
      category: 'xml-syntax',
      supporting,
    });
  }
  return null;
}

function tryUnescapedAmpersand(
  file: MetaFileInput,
  supporting: ParserDiagnostic[],
): MetaFinding | null {
  const entitySafe = /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/gi;
  let searchFrom = 0;
  while (searchFrom < file.content.length) {
    const index = file.content.indexOf('&', searchFrom);
    if (index < 0) break;
    const slice = file.content.slice(index);
    // Named entity form (even undefined) is handled by tryUndefinedEntity — not bare &
    const namedEntity = /^&[A-Za-z][\w]*;/.exec(slice);
    if (namedEntity) {
      searchFrom = index + namedEntity[0].length;
      continue;
    }
    if (entitySafe.test(slice)) {
      entitySafe.lastIndex = 0;
      const match = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/i.exec(slice);
      searchFrom = index + (match?.[0].length ?? 1);
      continue;
    }
    // Skip if inside a comment
    const before = file.content.slice(0, index);
    if (before.lastIndexOf('<!--') > before.lastIndexOf('-->')) {
      searchFrom = index + 1;
      continue;
    }

    const repaired = replaceRange(file.content, index, index + 1, '&amp;');
    if (!isWellFormedXml(repaired)) {
      searchFrom = index + 1;
      continue;
    }
    if (countChangedLines(file.content, repaired) !== 1) {
      searchFrom = index + 1;
      continue;
    }

    const loc = offsetToLocation(file.content, index);
    const line = splitLines(file.content)[loc.line - 1] ?? '';
    const fixedLine = line.replace('&', '&amp;');
    return buildFinding({
      findingId: `xml-unescaped-amp-${file.name}-${loc.line}`,
      title: 'Unescaped ampersand in text',
      explanation:
        'A raw "&" appears in text content. XML requires ampersands to be written as the &amp; entity.',
      file: file.name,
      line: loc.line,
      column: loc.column,
      offset: index,
      endOffset: index + 1,
      excerpt: excerptAroundLine(file.content, loc.line),
      before: line.trimEnd(),
      after: fixedLine.trimEnd(),
      repairedContent: repaired,
      confidence: 0.98,
      summary: 'Escape "&" as "&amp;".',
      safetyRationale:
        'The repair replaces a single bare ampersand with the standard &amp; entity. No surrounding text is altered.',
      category: 'xml-syntax',
      supporting,
    });
  }
  return null;
}

function diagnoseXmlFile(file: MetaFileInput): {
  finding: MetaFinding | null;
  rawDiagnostics: ParserDiagnostic[];
  wellFormed: boolean;
} {
  const rawDiagnostics = collectParserDiagnostics(file.content);
  const wellFormed = rawDiagnostics.length === 0;

  if (wellFormed) {
    return { finding: null, rawDiagnostics, wellFormed: true };
  }

  const candidates = [
    tryDuplicateAttribute(file, rawDiagnostics),
    tryUndefinedEntity(file, rawDiagnostics),
    tryMissingSelfClose(file, rawDiagnostics),
    tryMissingCloseBracket(file, rawDiagnostics),
    tryUnclosedAttributeQuote(file, rawDiagnostics),
    tryMismatchedClosingTag(file, rawDiagnostics),
    tryUnexpectedOrMismatchedCloseFromStack(file, rawDiagnostics),
    tryUnescapedAmpersand(file, rawDiagnostics),
  ].filter((item): item is MetaFinding => item !== null);

  if (candidates.length > 0) {
    // Prefer highest confidence single root finding
    candidates.sort((a, b) => b.confidence - a.confidence);
    return { finding: candidates[0] ?? null, rawDiagnostics, wellFormed: false };
  }

  // Collapse cascades into one root finding
  const primary = rawDiagnostics[0];
  const loc = primary?.location ?? locationAt(file.content, 0);
  const finding: MetaFinding = {
    id: `xml-structure-${file.name}-${loc.line}`,
    severity: 'error',
    category: 'xml-syntax',
    title: 'Malformed XML structure',
    explanation:
      primary?.message ??
      'The XML document is not well formed. Multiple parser diagnostics were produced by one underlying construct.',
    file: file.name,
    fileName: fileNameOf(file.name),
    location: loc,
    excerpt: excerptAroundLine(file.content, loc.line),
    confidence: 0.7,
    repairAvailability: 'manual',
    supportingDiagnostics: rawDiagnostics,
    message: primary?.message ?? 'Malformed XML structure',
    evidence: `${fileNameOf(file.name)}:${loc.line}`,
    fixable: false,
  };
  return { finding, rawDiagnostics, wellFormed: false };
}

function formatNumericSuggestion(fieldKey: string): string | undefined {
  const preset = HANDLING_PRESETS.street.values;
  if (fieldKey in preset) {
    const value = preset[fieldKey as keyof typeof preset];
    if (typeof value !== 'number') return undefined;
    if (Number.isInteger(value) && !fieldKey.startsWith('f')) return String(value);
    return value.toFixed(6);
  }
  return undefined;
}

function validateNumericValues(file: MetaFileInput): MetaFinding[] {
  const findings: MetaFinding[] = [];
  const valuePattern = /<([A-Za-z_][\w:.-]*)\b([^>]*?)\bvalue\s*=\s*"([^"]*)"([^>]*?)\/?\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = valuePattern.exec(file.content)) !== null) {
    const tag = match[1] ?? '';
    const rawValue = match[3] ?? '';
    const meta = NUMERIC_VALUE_TAGS.get(tag);
    if (!meta) continue;
    // Only validate known handling-style numeric fields (f*/n* or registered)
    if (!meta) continue;

    const numeric = Number(rawValue);
    const isInt = meta.nativeType === 'int';
    const valid =
      rawValue.trim() !== '' && Number.isFinite(numeric) && (!isInt || Number.isInteger(numeric));

    if (valid) continue;

    const offset = match.index;
    const loc = offsetToLocation(file.content, offset);
    const line = splitLines(file.content)[loc.line - 1] ?? '';
    const suggested = formatNumericSuggestion(tag);
    const explanation = `${tag} expects a finite numeric value, but received "${rawValue}".${
      suggested ? `\n\nSuggested reference value:\n${suggested}` : ''
    }`;

    let repair: RepairCandidate | undefined;
    let availability: RepairAvailability = 'manual';
    if (suggested !== undefined) {
      const fixedLine = line.replace(`value="${rawValue}"`, `value="${suggested}"`);
      const repaired = replaceLine(file.content, loc.line, fixedLine);
      const validated =
        isWellFormedXml(repaired) && countChangedLines(file.content, repaired) === 1;
      // Reliable street-preset default exists — offer as candidate for review, not silent apply.
      // Confidence is high enough to prepare once the user accepts the reference.
      const confidence = validated ? 0.82 : 0.4;
      repair = {
        id: `value-${tag}-${loc.line}-repair`,
        before: line.trimEnd(),
        after: fixedLine.trimEnd(),
        repairedContent: repaired,
        range: locationAt(file.content, offset, offset + match[0].length),
        confidence,
        summary: `Set ${tag} to reference value ${suggested}.`,
        safetyRationale: `The value "${rawValue}" is not numeric. The suggested replacement ${suggested} comes from the balanced street handling preset used by Cortex as a known-safe default for ${tag}. Review before applying.`,
        validated,
        linesChanged: 1,
        suggestedValue: suggested,
      };
      availability =
        validated && confidence >= REPAIR_CONFIDENCE_THRESHOLD ? 'candidate' : 'manual';
    }

    findings.push({
      id: `invalid-numeric-${file.name}-${tag}-${loc.line}`,
      severity: 'error',
      category: 'value',
      title: 'Invalid numeric value',
      explanation,
      file: file.name,
      fileName: fileNameOf(file.name),
      location: {
        ...locationAt(file.content, offset, offset + match[0].length),
        line: loc.line,
        column: loc.column,
      },
      excerpt: excerptAroundLine(file.content, loc.line),
      confidence: 0.99,
      repairAvailability: availability,
      ...(repair ? { repair } : {}),
      supportingDiagnostics: [],
      message: 'Invalid numeric value',
      evidence: `${fileNameOf(file.name)}:${loc.line}`,
      fixable: availability === 'candidate',
    });
  }
  return findings;
}

function textValuesFor(source: string, tag: string): { value: string; index: number }[] {
  return [...source.matchAll(new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`, 'gi'))].map(
    (match) => ({
      value: match[1]?.trim() ?? '',
      index: match.index ?? 0,
    }),
  );
}

function valuesFor(source: string, tag: string): number[] {
  return [...source.matchAll(new RegExp(`<${tag}\\s+value=["'](\\d+)["']\\s*/?>`, 'gi'))]
    .map((match) => Number.parseInt(match[1] ?? '', 10))
    .filter(Number.isFinite);
}

function section(source: string, tag: string): string {
  return new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(source)?.[1] ?? '';
}

/** Constrained near-match: exact, case-insensitive, single transposition, or edit distance ≤ 2 with unique winner. */
export function constrainedNearMatch(target: string, candidates: readonly string[]): string | null {
  if (candidates.length === 0) return null;
  if (candidates.includes(target)) return target;
  const insensitive = candidates.find((item) => item.toLowerCase() === target.toLowerCase());
  if (insensitive) return insensitive;

  const scored = candidates
    .map((candidate) => ({ candidate, distance: editDistance(target, candidate) }))
    .filter((entry) => {
      if (entry.distance === 0) return true;
      if (entry.distance === 1) return true;
      if (entry.distance === 2 && Math.abs(entry.candidate.length - target.length) <= 2)
        return true;
      return false;
    })
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate));

  if (scored.length === 0) return null;
  const best = scored[0]!;
  // Require unique best distance — never pick among vague ties
  if (scored.length > 1 && scored[1]!.distance === best.distance) return null;
  if (best.distance > 2) return null;
  return best.candidate;
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

function crossFileFindings(files: MetaFileInput[]): MetaFinding[] {
  const findings: MetaFinding[] = [];
  const groups = new Map<string, MetaFileInput[]>();
  for (const file of files) {
    const key = resourceKey(file.name);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }

  for (const [, entries] of groups) {
    const vehicles = entries.find((file) => detectMetaType(file) === 'vehicles');
    const handling = entries.find((file) => detectMetaType(file) === 'handling');
    const carcols = entries.find((file) => detectMetaType(file) === 'carcols');
    const variations = entries.find((file) => detectMetaType(file) === 'carvariations');

    if (
      vehicles &&
      handling &&
      isWellFormedXml(vehicles.content) &&
      isWellFormedXml(handling.content)
    ) {
      const handlingNames = textValuesFor(handling.content, 'handlingName').map(
        (item) => item.value,
      );
      const handlingIds = textValuesFor(vehicles.content, 'handlingId');
      for (const ref of handlingIds) {
        if (handlingNames.includes(ref.value)) continue;
        const suggestion = constrainedNearMatch(ref.value, handlingNames);
        const loc = offsetToLocation(vehicles.content, ref.index);
        const line = splitLines(vehicles.content)[loc.line - 1] ?? '';
        let repair: RepairCandidate | undefined;
        let availability: RepairAvailability = 'manual';
        if (suggestion) {
          const fixedLine = line.replace(ref.value, suggestion);
          const repaired = replaceLine(vehicles.content, loc.line, fixedLine);
          const validated =
            isWellFormedXml(repaired) && countChangedLines(vehicles.content, repaired) === 1;
          const confidence = validated ? 0.9 : 0.4;
          repair = {
            id: `handling-ref-${vehicles.name}-${loc.line}-repair`,
            before: line.trimEnd(),
            after: fixedLine.trimEnd(),
            repairedContent: repaired,
            range: locationAt(vehicles.content, ref.index, ref.index + ref.value.length + 20),
            confidence,
            summary: `Point handlingId to ${suggestion}.`,
            safetyRationale: `vehicles.meta references "${ref.value}", which is not defined. The only carefully constrained near-match in handling.meta is "${suggestion}" (exact-structure sibling).`,
            validated,
            linesChanged: 1,
            suggestedValue: suggestion,
          };
          availability =
            validated && confidence >= REPAIR_CONFIDENCE_THRESHOLD ? 'candidate' : 'manual';
        }
        findings.push({
          id: `handling-id-mismatch-${vehicles.name}-${loc.line}`,
          severity: 'error',
          category: 'cross-file',
          title: 'Broken handling reference',
          explanation: `vehicles.meta references ${ref.value}, but handling.meta defines ${
            handlingNames.join(', ') || '(none)'
          }.${suggestion ? `\n\nSuggested match: ${suggestion}` : ''}`,
          file: vehicles.name,
          fileName: fileNameOf(vehicles.name),
          location: {
            ...locationAt(vehicles.content, ref.index),
            line: loc.line,
            column: loc.column,
          },
          excerpt: excerptAroundLine(vehicles.content, loc.line),
          confidence: 0.95,
          repairAvailability: availability,
          ...(repair ? { repair } : {}),
          supportingDiagnostics: [],
          message: `vehicles.meta references ${ref.value}, but handling.meta defines ${handlingNames.join(', ')}.`,
          evidence: `${fileNameOf(vehicles.name)}:${loc.line}`,
          fixable: availability === 'candidate',
        });
      }
    }

    if (
      carcols &&
      variations &&
      isWellFormedXml(carcols.content) &&
      isWellFormedXml(variations.content)
    ) {
      const kitNames = textValuesFor(carcols.content, 'kitName').map((item) => item.value);
      const kitBody = section(variations.content, 'kits');
      const kitRefs = [...kitBody.matchAll(/<Item>([^<]+)<\/Item>/gi)].map((match) => ({
        value: match[1]?.trim() ?? '',
        index:
          (variations.content.indexOf(kitBody) >= 0 ? variations.content.indexOf(kitBody) : 0) +
          (match.index ?? 0),
      }));

      // Prefer absolute index from full document
      const kitRefsPrecise = textValuesFromSection(variations.content, 'kits', 'Item');

      for (const ref of kitRefsPrecise.length > 0 ? kitRefsPrecise : kitRefs) {
        if (!ref.value || kitNames.includes(ref.value)) continue;
        const suggestion = constrainedNearMatch(ref.value, kitNames);
        const loc = offsetToLocation(variations.content, ref.index);
        const line = splitLines(variations.content)[loc.line - 1] ?? '';
        let repair: RepairCandidate | undefined;
        let availability: RepairAvailability = 'manual';
        if (suggestion) {
          const fixedLine = line.replace(ref.value, suggestion);
          const repaired = replaceLine(variations.content, loc.line, fixedLine);
          const validated =
            isWellFormedXml(repaired) && countChangedLines(variations.content, repaired) === 1;
          const confidence = validated ? 0.9 : 0.4;
          repair = {
            id: `modkit-ref-${variations.name}-${loc.line}-repair`,
            before: line.trimEnd(),
            after: fixedLine.trimEnd(),
            repairedContent: repaired,
            range: locationAt(variations.content, ref.index, ref.index + ref.value.length + 10),
            confidence,
            summary: `Point kit reference to ${suggestion}.`,
            safetyRationale: `carvariations.meta references "${ref.value}", which is not defined. The only carefully constrained near-match in carcols.meta is "${suggestion}".`,
            validated,
            linesChanged: 1,
            suggestedValue: suggestion,
          };
          availability =
            validated && confidence >= REPAIR_CONFIDENCE_THRESHOLD ? 'candidate' : 'manual';
        }
        findings.push({
          id: `modkit-mismatch-${variations.name}-${loc.line}`,
          severity: 'error',
          category: 'cross-file',
          title: 'Broken modkit reference',
          explanation: `carvariations.meta references ${ref.value}, but carcols.meta defines ${
            kitNames.join(', ') || '(none)'
          }.${suggestion ? `\n\nSuggested match: ${suggestion}` : ''}`,
          file: variations.name,
          fileName: fileNameOf(variations.name),
          location: {
            ...locationAt(variations.content, ref.index),
            line: loc.line,
            column: loc.column,
          },
          excerpt: excerptAroundLine(variations.content, loc.line),
          confidence: 0.95,
          repairAvailability: availability,
          ...(repair ? { repair } : {}),
          supportingDiagnostics: [],
          message: `carvariations.meta references ${ref.value}, but carcols.meta defines ${kitNames.join(', ')}.`,
          evidence: `${fileNameOf(variations.name)}:${loc.line}`,
          fixable: availability === 'candidate',
        });
      }
    }
  }

  return findings;
}

function textValuesFromSection(
  source: string,
  sectionTag: string,
  itemTag: string,
): { value: string; index: number }[] {
  const open = new RegExp(`<${sectionTag}(?:\\s[^>]*)?>`, 'i').exec(source);
  if (!open || open.index === undefined) return [];
  const bodyStart = open.index + open[0].length;
  const close = source.toLowerCase().indexOf(`</${sectionTag.toLowerCase()}>`, bodyStart);
  if (close < 0) return [];
  const body = source.slice(bodyStart, close);
  return [...body.matchAll(new RegExp(`<${itemTag}>([^<]+)</${itemTag}>`, 'gi'))].map((match) => ({
    value: match[1]?.trim() ?? '',
    index: bodyStart + (match.index ?? 0),
  }));
}

// --- Legacy binding / duplicate-id repair (still proposed as candidates) ---

type Pool = 'siren' | 'light' | 'modkit';

interface Claim {
  pool: Pool;
  id: number;
  file: string;
  index: number;
  full: string;
}

const LIMITS: Record<Pool, { min: number; max: number }> = {
  siren: { min: 1, max: 254 },
  light: { min: 1, max: 255 },
  modkit: { min: 1, max: 1_023 },
};

function claimsFor(file: MetaFileInput): Claim[] {
  if (detectMetaType(file) !== 'carcols' && detectMetaType(file) !== 'modkits') return [];
  if (!isWellFormedXml(file.content)) return [];
  const output: Claim[] = [];
  const pools: { pool: Pool; tag: string }[] = [
    { pool: 'siren', tag: 'Sirens' },
    { pool: 'light', tag: 'Lights' },
    { pool: 'modkit', tag: 'Kits' },
  ];
  for (const { pool, tag } of pools) {
    const body = section(file.content, tag);
    const offset = file.content.indexOf(body);
    for (const match of body.matchAll(/<id\s+value=["'](\d+)["']\s*\/?\s*>/gi)) {
      const id = Number.parseInt(match[1] ?? '', 10);
      if (!Number.isFinite(id)) continue;
      output.push({
        pool,
        id,
        file: file.name,
        index: offset + (match.index ?? 0),
        full: match[0],
      });
    }
  }
  return output;
}

function replaceAt(source: string, index: number, before: string, after: string): string {
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

function replaceValue(source: string, tag: string, before: number, after: number): string {
  const expression = new RegExp(`(<${tag}\\s+value=["'])${before}(["']\\s*/?>)`, 'gi');
  return source.replace(expression, `$1${after}$2`);
}

function nextFree(used: Set<number>, pool: Pool): number | null {
  const { min, max } = LIMITS[pool];
  for (let candidate = max; candidate >= min; candidate -= 1) {
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  return null;
}

function bindingFindings(files: MetaFileInput[]): {
  findings: MetaFinding[];
  proposed: Map<string, { after: string; summary: string[] }>;
} {
  const findings: MetaFinding[] = [];
  const working = new Map(files.map((file) => [file.name, file.content]));
  const summaries = new Map<string, string[]>();
  const claims = files.flatMap(claimsFor);
  const used: Record<Pool, Set<number>> = {
    siren: new Set(claims.filter((claim) => claim.pool === 'siren').map((claim) => claim.id)),
    light: new Set(claims.filter((claim) => claim.pool === 'light').map((claim) => claim.id)),
    modkit: new Set(claims.filter((claim) => claim.pool === 'modkit').map((claim) => claim.id)),
  };
  const groups = new Map<string, Claim[]>();
  for (const claim of claims) {
    const key = `${claim.pool}:${claim.id}`;
    groups.set(key, [...(groups.get(key) ?? []), claim]);
  }

  const addSummary = (file: string, summary: string) => {
    summaries.set(file, [...(summaries.get(file) ?? []), summary]);
  };

  for (const group of groups.values()) {
    const resources = new Set(group.map((claim) => resourceKey(claim.file)));
    if (resources.size <= 1) continue;
    const ordered = [...group].sort((left, right) => left.file.localeCompare(right.file));
    const winner = ordered[0];
    if (!winner) continue;
    for (const loser of ordered.slice(1)) {
      const replacement = nextFree(used[loser.pool], loser.pool);
      const loc = offsetToLocation(
        files.find((f) => f.name === loser.file)?.content ?? '',
        loser.index,
      );
      const fixable = replacement !== null;
      let repair: RepairCandidate | undefined;
      if (replacement !== null) {
        const current = working.get(loser.file) ?? '';
        const relativeIndex = current.indexOf(loser.full);
        if (relativeIndex >= 0) {
          const nextTag = loser.full.replace(String(loser.id), String(replacement));
          working.set(loser.file, replaceAt(current, relativeIndex, loser.full, nextTag));
          addSummary(loser.file, `Reassigned ${loser.pool} ID ${loser.id} to ${replacement}.`);
        }
        const key = resourceKey(loser.file);
        for (const file of files.filter((entry) => resourceKey(entry.name) === key)) {
          let content = working.get(file.name) ?? file.content;
          if (loser.pool === 'siren')
            content = replaceValue(content, 'sirenSettings', loser.id, replacement);
          if (loser.pool === 'light')
            content = replaceValue(content, 'lightSettings', loser.id, replacement);
          if (loser.pool === 'modkit') {
            content = content.replaceAll(`${loser.id}_`, `${replacement}_`);
          }
          if (content !== (working.get(file.name) ?? file.content)) {
            working.set(file.name, content);
            addSummary(
              file.name,
              `Updated ${loser.pool} bindings from ${loser.id} to ${replacement}.`,
            );
          }
        }
        const after = working.get(loser.file) ?? '';
        const before = files.find((f) => f.name === loser.file)?.content ?? '';
        repair = {
          id: `duplicate-${loser.pool}-${loser.id}-repair`,
          before: loser.full,
          after: loser.full.replace(String(loser.id), String(replacement)),
          repairedContent: after,
          range: locationAt(before, loser.index, loser.index + loser.full.length),
          confidence: 0.88,
          summary: `Reassign ${loser.pool} ID ${loser.id} → ${replacement}.`,
          safetyRationale: `The ID collides across resources. Reassignment uses the next free ${loser.pool} slot and updates local bindings.`,
          validated: isWellFormedXml(after),
          linesChanged: countChangedLines(before, after),
        };
      }
      findings.push({
        id: `duplicate-${loser.pool}-${loser.id}-${loser.file}`,
        severity: 'error',
        category: 'duplicate-id',
        title: `Duplicate ${loser.pool} ID`,
        explanation: `${loser.pool} ID ${loser.id} is also claimed by ${winner.file}.`,
        file: loser.file,
        fileName: fileNameOf(loser.file),
        location: { ...locationAt('', 0), line: loc.line, column: loc.column, offset: loser.index },
        excerpt: loser.full,
        confidence: 0.9,
        repairAvailability: fixable ? 'candidate' : 'manual',
        ...(repair ? { repair } : {}),
        supportingDiagnostics: [],
        message: `${loser.pool} ID ${loser.id} is also claimed by ${winner.file}.`,
        evidence: ordered.map((claim) => claim.file).join(', '),
        fixable,
      });
    }
  }

  const resourceGroups = new Map<string, MetaFileInput[]>();
  for (const file of files) {
    const key = resourceKey(file.name);
    resourceGroups.set(key, [...(resourceGroups.get(key) ?? []), file]);
  }
  for (const [key, entries] of resourceGroups) {
    const carcols = entries.find((file) => detectMetaType(file) === 'carcols');
    const variations = entries.find((file) => detectMetaType(file) === 'carvariations');
    if (
      carcols &&
      variations &&
      isWellFormedXml(carcols.content) &&
      isWellFormedXml(variations.content)
    ) {
      const effectiveCarcols = {
        ...carcols,
        content: working.get(carcols.name) ?? carcols.content,
      };
      const sirens = claimsFor(effectiveCarcols)
        .filter((claim) => claim.pool === 'siren')
        .map((claim) => claim.id);
      const lights = claimsFor(effectiveCarcols)
        .filter((claim) => claim.pool === 'light')
        .map((claim) => claim.id);
      const variationSource = working.get(variations.name) ?? variations.content;
      const boundSiren = valuesFor(variationSource, 'sirenSettings')[0];
      const boundLight = valuesFor(variationSource, 'lightSettings')[0];
      for (const [pool, bound, available, tag] of [
        ['siren', boundSiren, sirens, 'sirenSettings'],
        ['light', boundLight, lights, 'lightSettings'],
      ] as const) {
        if (bound === undefined || available.length !== 1 || available.includes(bound)) continue;
        const expected = available[0];
        if (expected === undefined) continue;
        const before = working.get(variations.name) ?? variations.content;
        const after = replaceValue(before, tag, bound, expected);
        working.set(variations.name, after);
        addSummary(variations.name, `Matched ${tag} ${bound} to local ${pool} ID ${expected}.`);
        const match = before.match(new RegExp(`<${tag}\\s+value=["']${bound}["']\\s*/?>`, 'i'));
        const index = match?.index ?? 0;
        const loc = offsetToLocation(before, index);
        findings.push({
          id: `broken-${pool}-binding-${key}`,
          severity: 'error',
          category: 'binding',
          title: `Broken ${pool} binding`,
          explanation: `${tag} points to ${bound}, but this resource defines ${expected}.`,
          file: variations.name,
          fileName: fileNameOf(variations.name),
          location: { ...locationAt(before, index), line: loc.line, column: loc.column },
          excerpt: excerptAroundLine(before, loc.line),
          confidence: 0.92,
          repairAvailability: 'candidate',
          repair: {
            id: `broken-${pool}-binding-${key}-repair`,
            before: match?.[0] ?? `${tag}=${bound}`,
            after: (match?.[0] ?? '').replace(String(bound), String(expected)),
            repairedContent: after,
            range: locationAt(before, index, index + (match?.[0].length ?? 0)),
            confidence: 0.92,
            summary: `Match ${tag} to ${expected}.`,
            safetyRationale: `Only one local ${pool} ID exists; rebinding is unambiguous.`,
            validated: isWellFormedXml(after),
            linesChanged: countChangedLines(before, after),
          },
          supportingDiagnostics: [],
          message: `${tag} points to ${bound}, but this resource defines ${expected}.`,
          evidence: `${carcols.name} ↔ ${variations.name}`,
          fixable: true,
        });
      }
    }

    // Single-pair model binding is only safe when exactly one vehicles and one
    // carvariations file are present. Multi-vehicle batches are handled by the
    // staged cross-file pipeline (order-independent symbol indexes).
    const vehicleFiles = entries.filter((file) => detectMetaType(file) === 'vehicles');
    const variationFiles = entries.filter((file) => detectMetaType(file) === 'carvariations');
    if (
      vehicleFiles.length === 1 &&
      variationFiles.length === 1 &&
      isWellFormedXml(vehicleFiles[0]!.content) &&
      isWellFormedXml(variationFiles[0]!.content)
    ) {
      const vehicles = vehicleFiles[0]!;
      const modelVariations = variationFiles[0]!;
      const models = textValuesFor(vehicles.content, 'modelName').map((item) => item.value);
      const variationModels = textValuesFor(modelVariations.content, 'modelName');
      if (
        models.length === 1 &&
        variationModels.length === 1 &&
        models[0] !== variationModels[0]?.value
      ) {
        const before = working.get(modelVariations.name) ?? modelVariations.content;
        const after = before.replace(
          /(<modelName>\s*)[^<]+(\s*<\/modelName>)/i,
          `$1${models[0]}$2`,
        );
        working.set(modelVariations.name, after);
        addSummary(modelVariations.name, `Renamed the variation binding to ${models[0]}.`);
        const ref = variationModels[0]!;
        const loc = offsetToLocation(before, ref.index);
        const line = splitLines(before)[loc.line - 1] ?? '';
        findings.push({
          id: `model-name-mismatch-${key}`,
          severity: 'error',
          category: 'binding',
          title: 'Model name mismatch',
          explanation: `Model name ${ref.value} does not match vehicles.meta (${models[0]}).`,
          file: modelVariations.name,
          fileName: fileNameOf(modelVariations.name),
          location: { ...locationAt(before, ref.index), line: loc.line, column: loc.column },
          excerpt: excerptAroundLine(before, loc.line),
          confidence: 0.91,
          repairAvailability: 'candidate',
          repair: {
            id: `model-name-mismatch-${key}-repair`,
            before: line.trimEnd(),
            after: line.replace(ref.value, models[0] ?? ref.value).trimEnd(),
            repairedContent: after,
            range: locationAt(before, ref.index, ref.index + ref.value.length + 24),
            confidence: 0.91,
            summary: `Rename variation model to ${models[0]}.`,
            safetyRationale: 'Exactly one model is defined in each file; renaming is unambiguous.',
            validated: isWellFormedXml(after),
            linesChanged: countChangedLines(before, after),
          },
          supportingDiagnostics: [],
          message: `Model name ${ref.value} does not match vehicles.meta (${models[0]}).`,
          evidence: `${vehicles.name} ↔ ${modelVariations.name}`,
          fixable: true,
        });
      }
    }
  }

  const proposed = new Map<string, { after: string; summary: string[] }>();
  for (const [file, after] of working) {
    const before = files.find((entry) => entry.name === file)?.content ?? '';
    if (after !== before) {
      proposed.set(file, { after, summary: summaries.get(file) ?? [] });
    }
  }
  return { findings, proposed };
}

function toIssue(finding: MetaFinding): MetaIssue {
  return {
    id: finding.id,
    severity: finding.severity,
    file: finding.file,
    message: finding.message,
    evidence: finding.evidence,
    fixable: finding.fixable,
  };
}

/**
 * Validate a single metadata file for XML structure (legacy-compatible issues).
 * Cascading parser messages are collapsed into one root issue when possible.
 */
export function validateMetaXml(input: MetaFileInput): MetaIssue[] {
  if (!input.content.trim()) {
    return [
      {
        id: 'empty-file',
        severity: 'error',
        file: input.name,
        message: 'The file is empty.',
        evidence: input.name,
        fixable: false,
      },
    ];
  }
  const { finding } = diagnoseXmlFile(input);
  const issues: MetaIssue[] = [];
  if (finding) issues.push(toIssue(finding));
  if (detectMetaType(input) === 'unknown') {
    issues.push({
      id: 'unknown-meta-type',
      severity: 'warning',
      file: input.name,
      message: 'Cortex could not identify this metadata file type.',
      evidence: input.name,
      fixable: false,
    });
  }
  // Value checks only when well-formed
  if (isWellFormedXml(input.content)) {
    for (const valueFinding of validateNumericValues(input)) {
      issues.push(toIssue(valueFinding));
    }
  }
  return issues;
}

/**
 * Diagnose a set of vehicle metadata files via the staged Align pipeline.
 * Returns root-cause findings (not cascading parser noise), optional repair candidates,
 * proposed changes for high-confidence fixes, and scan coverage. Nothing is applied to disk.
 *
 * Stages: inventory → independent parse → diagnostic normalization → schema validation →
 * symbol extraction → vehicle graphs → cross-file (tri-state refs) → repair candidates → coverage.
 * Never aborts the whole scan because one file fails to parse.
 */
export function diagnoseMetaBundle(files: MetaFileInput[]): MetaDiagnosis {
  const { findings: bindFindings, proposed } = bindingFindings(
    files.filter((file) => isWellFormedXml(file.content)),
  );

  const pipeline = runAnalysisPipeline(
    files,
    diagnoseXmlFile,
    (wellFormed) => bindingFindings(wellFormed).findings,
  );

  // Prefer pipeline findings; ensure legacy binding multi-file ID reassignment still surfaces
  const findings = [...pipeline.findings];
  for (const finding of bindFindings) {
    if (
      findings.some(
        (existing) =>
          existing.id === finding.id ||
          (existing.file === finding.file &&
            existing.category === finding.category &&
            existing.location.line === finding.location.line) ||
          // Avoid double-reporting model mismatches already caught by cross-file validation
          (finding.category === 'binding' &&
            existing.file === finding.file &&
            existing.category === 'cross-file' &&
            /model/i.test(existing.title) &&
            existing.location.line === finding.location.line),
      )
    ) {
      continue;
    }
    findings.push(finding);
  }

  // Stable sort: file path then line then id (order-independent of input sequence)
  findings.sort((a, b) => {
    const fileCmp = a.file
      .replaceAll('\\', '/')
      .toLowerCase()
      .localeCompare(b.file.replaceAll('\\', '/').toLowerCase());
    if (fileCmp !== 0) return fileCmp;
    if (a.location.line !== b.location.line) return a.location.line - b.location.line;
    return a.id.localeCompare(b.id);
  });

  // Build proposed MetaChange list from high-confidence repair candidates + binding proposals
  const changeMap = new Map<string, { before: string; after: string; summary: string[] }>();
  for (const file of files) {
    changeMap.set(file.name, {
      before: file.content,
      after: file.content,
      summary: [],
    });
  }

  for (const [file, proposal] of proposed) {
    const entry = changeMap.get(file);
    if (!entry) continue;
    entry.after = proposal.after;
    entry.summary.push(...proposal.summary);
  }

  for (const finding of findings) {
    if (!finding.repair || finding.repairAvailability !== 'candidate') continue;
    if (finding.category === 'duplicate-id' || finding.category === 'binding') continue;
    const entry = changeMap.get(finding.file);
    if (!entry) continue;
    if (entry.after === entry.before) {
      entry.after = finding.repair.repairedContent;
      entry.summary.push(finding.repair.summary);
    }
  }

  const changes: MetaChange[] = [];
  for (const [file, entry] of changeMap) {
    if (entry.after !== entry.before) {
      changes.push({
        file,
        before: entry.before,
        after: entry.after,
        summary: entry.summary,
      });
    }
  }

  // Root findings for stats: errors + warnings (intentional defects). Info (unverifiable) is separate.
  const rootFindings = findings.filter((item) => item.severity !== 'info');
  const errors = findings.filter((item) => item.severity === 'error').length;
  const warnings = findings.filter((item) => item.severity === 'warning').length;
  const info = findings.filter((item) => item.severity === 'info').length;
  const repairCandidates = findings.filter(
    (item) => item.repairAvailability === 'candidate',
  ).length;
  const manualReview = rootFindings.filter(
    (item) => item.repairAvailability === 'manual' || item.repairAvailability === 'none',
  ).length;
  const filesWithFindings = new Set(rootFindings.map((item) => item.file)).size;

  return {
    findings,
    issues: findings.map(toIssue),
    changes,
    stats: {
      files: files.length,
      filesWithFindings,
      rootFindings: rootFindings.length,
      rawParserDiagnostics: pipeline.rawParserDiagnostics,
      errors,
      warnings,
      repairCandidates,
      preparedFixes: 0,
      manualReview,
      fixes: repairCandidates,
      info,
    },
    coverage: pipeline.coverage,
    coverageReport: formatCoverageReport(pipeline.coverage),
    fileRecords: pipeline.files,
  };
}

/** Apply a set of prepared repair candidates to file contents (in memory). */
export function applyPreparedRepairs(
  files: MetaFileInput[],
  prepared: { file: string; repairedContent: string }[],
): MetaFileInput[] {
  const map = new Map(files.map((file) => [file.name, file.content]));
  for (const item of prepared) {
    map.set(item.file, item.repairedContent);
  }
  return files.map((file) => ({
    name: file.name,
    content: map.get(file.name) ?? file.content,
  }));
}

/** Re-diagnose after repairs; useful for apply validation. */
export function revalidateRepairedFiles(files: MetaFileInput[]): MetaDiagnosis {
  return diagnoseMetaBundle(files);
}
