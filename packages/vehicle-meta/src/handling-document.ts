import { XMLParser, XMLValidator } from 'fast-xml-parser';
import {
  DEFAULT_HANDLING_SETUP,
  HANDLING_FIELDS,
  HANDLING_PRESETS,
  type HandlingSetup,
  type HandlingValues,
} from './handling';

export interface HandlingUnknownNode {
  name: string;
  source: string;
}

export interface HandlingDocumentEntry {
  id: string;
  index: number;
  handlingName: string;
  values: HandlingValues;
  setup: HandlingSetup;
  subHandlingTypes: string[];
  unknownNodes: HandlingUnknownNode[];
  sourceRange: { start: number; end: number };
}

export interface HandlingDocument {
  source: string;
  entries: HandlingDocumentEntry[];
  lineEnding: '\n' | '\r\n';
}

export interface HandlingEntryUpdate {
  handlingName?: string;
  values?: HandlingValues;
  setup?: HandlingSetup;
}

export interface HandlingValidationIssue {
  field: string;
  message: string;
}

interface AttributeSpan {
  name: string;
  value: string;
  valueStart: number;
  valueEnd: number;
}

interface ElementSpan {
  name: string;
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  attributes: AttributeSpan[];
  parent: ElementSpan | null;
  children: ElementSpan[];
}

interface SourcePatch {
  start: number;
  end: number;
  value: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === 'Item' || name === 'item',
});

const KNOWN_ENTRY_NODES = new Set<string>([
  'handlingName',
  ...HANDLING_FIELDS.map((field) => field.key),
  'vecCentreOfMassOffset',
  'vecInertiaMultiplier',
  'fSeatOffsetDistX',
  'fSeatOffsetDistY',
  'fSeatOffsetDistZ',
  'nMonetaryValue',
  'strModelFlags',
  'strHandlingFlags',
  'strDamageFlags',
  'AIHandling',
  'SubHandlingData',
]);

function localName(name: string): string {
  return name.split(':').at(-1) ?? name;
}

function findTagEnd(source: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '>') return index + 1;
  }
  return source.length;
}

function skipDeclaration(source: string, start: number): number {
  if (source.startsWith('<!--', start)) {
    const end = source.indexOf('-->', start + 4);
    return end === -1 ? source.length : end + 3;
  }
  if (source.startsWith('<![CDATA[', start)) {
    const end = source.indexOf(']]>', start + 9);
    return end === -1 ? source.length : end + 3;
  }
  if (source.startsWith('<?', start)) {
    const end = source.indexOf('?>', start + 2);
    return end === -1 ? source.length : end + 2;
  }
  if (/^<!doctype/i.test(source.slice(start, start + 9))) {
    let quote: '"' | "'" | null = null;
    let bracketDepth = 0;
    for (let index = start + 9; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      else if (character === '[') bracketDepth += 1;
      else if (character === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      else if (character === '>' && bracketDepth === 0) return index + 1;
    }
    return source.length;
  }
  if (source.startsWith('<!', start)) return findTagEnd(source, start + 2);
  return start;
}

function parseAttributes(source: string, tagStart: number, tagEnd: number): AttributeSpan[] {
  const attributes: AttributeSpan[] = [];
  let index = tagStart + 1;
  while (index < tagEnd && !/[\s/>]/.test(source[index] ?? '')) index += 1;

  while (index < tagEnd) {
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (index >= tagEnd || source[index] === '/' || source[index] === '>') break;
    const nameStart = index;
    while (index < tagEnd && !/[\s=/>]/.test(source[index] ?? '')) index += 1;
    const name = source.slice(nameStart, index);
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (source[index] !== '=') {
      attributes.push({ name, value: '', valueStart: index, valueEnd: index });
      continue;
    }
    index += 1;
    while (/\s/.test(source[index] ?? '')) index += 1;
    const quote = source[index];
    if (quote === '"' || quote === "'") {
      const valueStart = index + 1;
      const valueEnd = source.indexOf(quote, valueStart);
      const safeEnd = valueEnd === -1 || valueEnd > tagEnd ? tagEnd - 1 : valueEnd;
      attributes.push({
        name,
        value: source.slice(valueStart, safeEnd),
        valueStart,
        valueEnd: safeEnd,
      });
      index = safeEnd + 1;
    } else {
      const valueStart = index;
      while (index < tagEnd && !/[\s/>]/.test(source[index] ?? '')) index += 1;
      attributes.push({
        name,
        value: source.slice(valueStart, index),
        valueStart,
        valueEnd: index,
      });
    }
  }
  return attributes;
}

function scanElements(source: string): ElementSpan[] {
  const elements: ElementSpan[] = [];
  const stack: ElementSpan[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start === -1) break;
    const skipped = skipDeclaration(source, start);
    if (skipped !== start) {
      cursor = skipped;
      continue;
    }
    const end = findTagEnd(source, start + 1);
    const raw = source.slice(start + 1, end - 1).trim();
    if (!raw) {
      cursor = end;
      continue;
    }
    if (raw.startsWith('/')) {
      const closingName = raw.slice(1).trim().split(/\s/, 1)[0] ?? '';
      const current = stack.pop();
      if (current && localName(current.name) === localName(closingName)) {
        current.closeStart = start;
        current.end = end;
      }
      cursor = end;
      continue;
    }

    const name = raw.split(/[\s/>]/, 1)[0] ?? '';
    const parent = stack.at(-1) ?? null;
    const element: ElementSpan = {
      name,
      start,
      openEnd: end,
      closeStart: end,
      end,
      attributes: parseAttributes(source, start, end),
      parent,
      children: [],
    };
    parent?.children.push(element);
    elements.push(element);
    if (!raw.endsWith('/')) stack.push(element);
    cursor = end;
  }

  return elements;
}

function attribute(element: ElementSpan, name: string): AttributeSpan | undefined {
  return element.attributes.find((candidate) => candidate.name === name);
}

function child(element: ElementSpan, name: string): ElementSpan | undefined {
  return element.children.find((candidate) => localName(candidate.name) === name);
}

function textValue(node: unknown, fallback: string): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if ('#text' in record) return String(record['#text']);
    if ('@_value' in record) return String(record['@_value']);
  }
  return fallback;
}

function numericValue(node: unknown, fallback: number): number {
  const raw =
    node && typeof node === 'object' && '@_value' in (node as Record<string, unknown>)
      ? (node as Record<string, unknown>)['@_value']
      : node;
  const parsed =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function vectorValue(
  node: unknown,
  fallback: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const record = node && typeof node === 'object' ? (node as Record<string, unknown>) : {};
  return {
    x: numericValue(record['@_x'], fallback.x),
    y: numericValue(record['@_y'], fallback.y),
    z: numericValue(record['@_z'], fallback.z),
  };
}

function subHandlingKind(type: string): HandlingSetup['subHandling'] {
  const normalized = type.toUpperCase();
  if (!normalized || normalized === 'NULL') return 'none';
  if (normalized === 'CCARHANDLINGDATA') return 'car';
  if (normalized === 'CBIKEHANDLINGDATA') return 'bike';
  if (normalized === 'CBOATHANDLINGDATA') return 'boat';
  if (normalized === 'CTRAILERHANDLINGDATA') return 'trailer';
  return 'other';
}

function parseEntry(source: string, element: ElementSpan, index: number): HandlingDocumentEntry {
  const entrySource = source.slice(element.start, element.end);
  const parsed = parser.parse(entrySource) as Record<string, unknown>;
  const rawItem = parsed.Item ?? parsed.item ?? {};
  const item = (Array.isArray(rawItem) ? rawItem[0] : rawItem) as Record<string, unknown>;
  const defaultValues = HANDLING_PRESETS.street.values;
  const values = { ...defaultValues };
  for (const field of HANDLING_FIELDS) {
    values[field.key] = numericValue(item[field.key], defaultValues[field.key]);
  }

  const subHandlingNode = (item.SubHandlingData ?? item.subHandlingData) as
    Record<string, unknown> | undefined;
  const rawSubItems = subHandlingNode?.Item ?? subHandlingNode?.item;
  const subItems =
    rawSubItems === undefined ? [] : Array.isArray(rawSubItems) ? rawSubItems : [rawSubItems];
  const subHandlingTypes = subItems
    .map((candidate) => {
      if (!candidate || typeof candidate !== 'object') return '';
      const type = (candidate as Record<string, unknown>)['@_type'];
      return typeof type === 'string' || typeof type === 'number' ? String(type) : '';
    })
    .filter(Boolean);
  const primarySubHandling =
    subHandlingTypes.find((type) => type.toUpperCase() !== 'NULL') ?? 'NULL';
  const setup: HandlingSetup = {
    centreOfMass: vectorValue(item.vecCentreOfMassOffset, DEFAULT_HANDLING_SETUP.centreOfMass),
    inertiaMultiplier: vectorValue(
      item.vecInertiaMultiplier,
      DEFAULT_HANDLING_SETUP.inertiaMultiplier,
    ),
    seatOffset: {
      x: numericValue(item.fSeatOffsetDistX, DEFAULT_HANDLING_SETUP.seatOffset.x),
      y: numericValue(item.fSeatOffsetDistY, DEFAULT_HANDLING_SETUP.seatOffset.y),
      z: numericValue(item.fSeatOffsetDistZ, DEFAULT_HANDLING_SETUP.seatOffset.z),
    },
    monetaryValue: numericValue(item.nMonetaryValue, DEFAULT_HANDLING_SETUP.monetaryValue),
    modelFlags: textValue(item.strModelFlags, DEFAULT_HANDLING_SETUP.modelFlags),
    handlingFlags: textValue(item.strHandlingFlags, DEFAULT_HANDLING_SETUP.handlingFlags),
    damageFlags: textValue(item.strDamageFlags, DEFAULT_HANDLING_SETUP.damageFlags),
    aiHandling: textValue(item.AIHandling, DEFAULT_HANDLING_SETUP.aiHandling),
    subHandling: subHandlingKind(primarySubHandling),
    subHandlingType: primarySubHandling,
  };
  const handlingName = textValue(item.handlingName, '').trim();
  return {
    id: `handling-${index}`,
    index,
    handlingName,
    values,
    setup,
    subHandlingTypes,
    unknownNodes: element.children
      .filter((candidate) => !KNOWN_ENTRY_NODES.has(localName(candidate.name)))
      .map((candidate) => ({
        name: localName(candidate.name),
        source: source.slice(candidate.start, candidate.end),
      })),
    sourceRange: { start: element.start, end: element.end },
  };
}

export function parseHandlingDocument(source: string): HandlingDocument {
  const validation = XMLValidator.validate(source);
  if (validation !== true) {
    throw new Error(`handling.meta is not well formed: ${validation.err.msg}`);
  }
  const entryElements = scanElements(source).filter((element) => {
    if (localName(element.name) !== 'Item') return false;
    return attribute(element, 'type')?.value.toUpperCase() === 'CHANDLINGDATA';
  });
  const entries = entryElements.map((element, index) => parseEntry(source, element, index));
  if (entries.some((entry) => !entry.handlingName)) {
    throw new Error('Every CHandlingData entry must contain a handlingName.');
  }
  return {
    source,
    entries,
    lineEnding: source.includes('\r\n') ? '\r\n' : '\n',
  };
}

function decimalPlaces(value: number): number {
  const text = String(value);
  if (/e/i.test(text)) {
    const fixed = value.toFixed(12).replace(/0+$/, '');
    return fixed.includes('.') ? fixed.length - fixed.indexOf('.') - 1 : 0;
  }
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

function formatNumberLike(original: string | undefined, value: number, integer = false): string {
  if (integer) return String(Math.round(value));
  if (!original) return String(value);
  if (/e/i.test(original)) return String(value);
  const originalDecimals = original.includes('.') ? original.length - original.indexOf('.') - 1 : 0;
  let places = Math.min(12, Math.max(originalDecimals, decimalPlaces(value)));
  let formatted = value.toFixed(places);
  while (Number(formatted) !== value && places < 12) {
    places += 1;
    formatted = value.toFixed(places);
  }
  return formatted;
}

function escapeXmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function replaceAttribute(
  patches: SourcePatch[],
  element: ElementSpan,
  name: string,
  value: string,
): boolean {
  const target = attribute(element, name);
  if (!target) return false;
  patches.push({ start: target.valueStart, end: target.valueEnd, value });
  return true;
}

function replaceText(patches: SourcePatch[], element: ElementSpan, value: string): void {
  patches.push({
    start: element.openEnd,
    end: element.closeStart,
    value: escapeXmlText(value),
  });
}

function indentationForEntry(source: string, entry: ElementSpan): string {
  const existingChild = entry.children[0];
  const position = existingChild?.start ?? entry.closeStart;
  const lineStart = Math.max(source.lastIndexOf('\n', position - 1) + 1, 0);
  const whitespace = /^\s*/.exec(source.slice(lineStart, position))?.[0];
  if (whitespace) return whitespace.replace(/\r/g, '');
  const entryLineStart = Math.max(source.lastIndexOf('\n', entry.start - 1) + 1, 0);
  const entryIndent = /^\s*/.exec(source.slice(entryLineStart, entry.start))?.[0] ?? '';
  return `${entryIndent}  `;
}

function insertScalar(
  patches: SourcePatch[],
  document: HandlingDocument,
  entry: ElementSpan,
  name: string,
  value: string,
): void {
  const before = child(entry, 'SubHandlingData')?.start ?? entry.closeStart;
  const insertionPoint = Math.max(document.source.lastIndexOf('\n', before - 1) + 1, 0);
  const indent = indentationForEntry(document.source, entry);
  patches.push({
    start: insertionPoint,
    end: insertionPoint,
    value: `${indent}<${name} value="${value}" />${document.lineEnding}`,
  });
}

function validateUpdate(
  entry: HandlingDocumentEntry,
  update: HandlingEntryUpdate,
): HandlingValidationIssue[] {
  const issues: HandlingValidationIssue[] = [];
  const handlingName = update.handlingName ?? entry.handlingName;
  if (!handlingName.trim())
    issues.push({ field: 'handlingName', message: 'Handling name is required.' });
  const values = update.values ?? entry.values;
  for (const field of HANDLING_FIELDS) {
    const value = values[field.key];
    if (!Number.isFinite(value)) {
      issues.push({ field: field.key, message: `${field.label} must be a finite number.` });
    } else if (field.nativeType === 'int' && !Number.isInteger(value)) {
      issues.push({ field: field.key, message: `${field.label} must be a whole number.` });
    }
  }
  const setup = update.setup ?? entry.setup;
  for (const [name, vector] of [
    ['vecCentreOfMassOffset', setup.centreOfMass],
    ['vecInertiaMultiplier', setup.inertiaMultiplier],
    ['seatOffset', setup.seatOffset],
  ] as const) {
    for (const axis of ['x', 'y', 'z'] as const) {
      if (!Number.isFinite(vector[axis])) {
        issues.push({
          field: `${name}.${axis}`,
          message: `${name} ${axis.toUpperCase()} must be finite.`,
        });
      }
    }
  }
  if (!Number.isFinite(setup.monetaryValue) || !Number.isInteger(setup.monetaryValue)) {
    issues.push({
      field: 'nMonetaryValue',
      message: 'Monetary value must be a finite whole number.',
    });
  }
  return issues;
}

function subHandlingType(setup: HandlingSetup): string {
  if (setup.subHandlingType?.trim()) return setup.subHandlingType.trim();
  if (setup.subHandling === 'car') return 'CCarHandlingData';
  if (setup.subHandling === 'bike') return 'CBikeHandlingData';
  if (setup.subHandling === 'boat') return 'CBoatHandlingData';
  if (setup.subHandling === 'trailer') return 'CTrailerHandlingData';
  return 'NULL';
}

export function updateHandlingEntry(
  document: HandlingDocument,
  entryId: string,
  update: HandlingEntryUpdate,
): string {
  const entry = document.entries.find((candidate) => candidate.id === entryId);
  if (!entry) throw new Error('The selected handling entry is no longer available.');
  const issues = validateUpdate(entry, update);
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join(' '));

  const elements = scanElements(document.source);
  const entryElement = elements.filter(
    (element) =>
      localName(element.name) === 'Item' &&
      attribute(element, 'type')?.value.toUpperCase() === 'CHANDLINGDATA',
  )[entry.index];
  if (!entryElement)
    throw new Error('The selected handling entry could not be located in the source.');
  const patches: SourcePatch[] = [];
  const nextValues = update.values ?? entry.values;

  if (update.handlingName !== undefined && update.handlingName !== entry.handlingName) {
    const nameElement = child(entryElement, 'handlingName');
    if (!nameElement) throw new Error('The selected handling entry does not contain handlingName.');
    replaceText(patches, nameElement, update.handlingName);
  }

  for (const field of HANDLING_FIELDS) {
    const before = entry.values[field.key];
    const after = nextValues[field.key];
    if (before === after) continue;
    const fieldElement = child(entryElement, field.key);
    const formatted = formatNumberLike(
      fieldElement ? attribute(fieldElement, 'value')?.value : undefined,
      after,
      field.nativeType === 'int',
    );
    if (!fieldElement || !replaceAttribute(patches, fieldElement, 'value', formatted)) {
      insertScalar(patches, document, entryElement, field.key, formatted);
    }
  }

  const nextSetup = update.setup ?? entry.setup;
  for (const [name, beforeVector, afterVector] of [
    ['vecCentreOfMassOffset', entry.setup.centreOfMass, nextSetup.centreOfMass],
    ['vecInertiaMultiplier', entry.setup.inertiaMultiplier, nextSetup.inertiaMultiplier],
  ] as const) {
    const vectorElement = child(entryElement, name);
    if (!vectorElement) {
      if (
        beforeVector.x !== afterVector.x ||
        beforeVector.y !== afterVector.y ||
        beforeVector.z !== afterVector.z
      ) {
        const before = child(entryElement, 'SubHandlingData')?.start ?? entryElement.closeStart;
        const insertionPoint = Math.max(document.source.lastIndexOf('\n', before - 1) + 1, 0);
        const indent = indentationForEntry(document.source, entryElement);
        patches.push({
          start: insertionPoint,
          end: insertionPoint,
          value: `${indent}<${name} x="${afterVector.x}" y="${afterVector.y}" z="${afterVector.z}" />${document.lineEnding}`,
        });
      }
      continue;
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      if (beforeVector[axis] === afterVector[axis]) continue;
      replaceAttribute(
        patches,
        vectorElement,
        axis,
        formatNumberLike(attribute(vectorElement, axis)?.value, afterVector[axis]),
      );
    }
  }

  for (const [axis, name] of [
    ['x', 'fSeatOffsetDistX'],
    ['y', 'fSeatOffsetDistY'],
    ['z', 'fSeatOffsetDistZ'],
  ] as const) {
    if (entry.setup.seatOffset[axis] === nextSetup.seatOffset[axis]) continue;
    const fieldElement = child(entryElement, name);
    const formatted = formatNumberLike(
      fieldElement ? attribute(fieldElement, 'value')?.value : undefined,
      nextSetup.seatOffset[axis],
    );
    if (!fieldElement || !replaceAttribute(patches, fieldElement, 'value', formatted)) {
      insertScalar(patches, document, entryElement, name, formatted);
    }
  }

  if (entry.setup.monetaryValue !== nextSetup.monetaryValue) {
    const monetary = child(entryElement, 'nMonetaryValue');
    const formatted = formatNumberLike(
      monetary ? attribute(monetary, 'value')?.value : undefined,
      nextSetup.monetaryValue,
      true,
    );
    if (!monetary || !replaceAttribute(patches, monetary, 'value', formatted)) {
      insertScalar(patches, document, entryElement, 'nMonetaryValue', formatted);
    }
  }

  for (const [name, before, after] of [
    ['strModelFlags', entry.setup.modelFlags, nextSetup.modelFlags],
    ['strHandlingFlags', entry.setup.handlingFlags, nextSetup.handlingFlags],
    ['strDamageFlags', entry.setup.damageFlags, nextSetup.damageFlags],
    ['AIHandling', entry.setup.aiHandling, nextSetup.aiHandling],
  ] as const) {
    if (before === after) continue;
    const fieldElement = child(entryElement, name);
    if (!fieldElement) throw new Error(`${name} is missing and cannot be safely inserted as text.`);
    replaceText(patches, fieldElement, after);
  }

  const beforeSubHandling = subHandlingType(entry.setup);
  const afterSubHandling = subHandlingType(nextSetup);
  if (beforeSubHandling !== afterSubHandling) {
    const container = child(entryElement, 'SubHandlingData');
    const candidate =
      container?.children.find(
        (item) =>
          localName(item.name) === 'Item' &&
          attribute(item, 'type')?.value.toUpperCase() !== 'NULL',
      ) ?? container?.children.find((item) => localName(item.name) === 'Item');
    if (!candidate || !replaceAttribute(patches, candidate, 'type', afterSubHandling)) {
      throw new Error('SubHandlingData is missing and cannot be safely updated.');
    }
  }

  const nextSource = patches
    .sort((left, right) => right.start - left.start)
    .reduce(
      (source, patch) => `${source.slice(0, patch.start)}${patch.value}${source.slice(patch.end)}`,
      document.source,
    );
  const validation = XMLValidator.validate(nextSource);
  if (validation !== true)
    throw new Error(`The updated handling.meta is invalid: ${validation.err.msg}`);
  return nextSource;
}

export function validateHandlingEntry(
  document: HandlingDocument,
  entryId: string,
  update: HandlingEntryUpdate,
): HandlingValidationIssue[] {
  const entry = document.entries.find((candidate) => candidate.id === entryId);
  return entry
    ? validateUpdate(entry, update)
    : [{ field: 'entry', message: 'The selected handling entry is no longer available.' }];
}
