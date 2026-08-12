import type { ParsedManifest } from '@cortex/resource-parser/manifest';

const SCALAR_KEYS = {
  fxVersion: 'fx_version',
  game: 'game',
  author: 'author',
  description: 'description',
  version: 'version',
  uiPage: 'ui_page',
} as const;

const LIST_KEYS = {
  sharedScripts: 'shared_scripts',
  clientScripts: 'client_scripts',
  serverScripts: 'server_scripts',
  files: 'files',
  dependencies: 'dependencies',
} as const;

function quote(value: string): string {
  return `'${value.replaceAll('\\', '/').replaceAll("'", "\\'")}'`;
}

function stripComment(text: string): string {
  return text.replace(/--.*$/, '').trim();
}

function replaceQuotedValue(line: string, newValue: string): string {
  return line.replace(/(['"])(?:\\.|(?!\1).)*\1/, quote(newValue));
}

export function patchScalarField(
  source: string,
  field: ManifestScalarField,
  newValue: string,
): string {
  const key = SCALAR_KEYS[field];
  const lines = source.split(/\r?\n/);
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const keyPattern = new RegExp(`^${key}\\b`);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    if (!keyPattern.test(stripComment(raw))) continue;
    lines[index] = replaceQuotedValue(raw, newValue);
    return lines.join(lineEnding);
  }
  const insertion = `${key} ${quote(newValue)}`;
  const gameIndex = lines.findIndex((line) => /^game\b/.test(stripComment(line)));
  if (gameIndex >= 0) {
    lines.splice(gameIndex + 1, 0, insertion);
    return lines.join(lineEnding);
  }
  lines.push(insertion);
  return lines.join(lineEnding);
}

type ManifestListField = keyof typeof LIST_KEYS;
type ManifestScalarField = keyof typeof SCALAR_KEYS;

export function patchListField(
  source: string,
  field: ManifestListField,
  values: string[],
  parsed: ParsedManifest,
): string {
  const key = LIST_KEYS[field];
  const lines = source.split(/\r?\n/);
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const entries = parsed[field];
  const blockStart = lines.findIndex((line) =>
    new RegExp(`^${key}\\s*\\{`).test(stripComment(line)),
  );
  if (blockStart >= 0) {
    let blockEnd = blockStart;
    while (blockEnd < lines.length && !stripComment(lines[blockEnd] ?? '').includes('}')) {
      blockEnd += 1;
    }
    const block = [`${key} {`, ...values.map((value) => `    ${quote(value)},`), '}'];
    lines.splice(blockStart, blockEnd - blockStart + 1, ...block);
    return lines.join(lineEnding);
  }
  if (values.length === 0) return source;
  const block = ['', `${key} {`, ...values.map((value) => `    ${quote(value)},`), '}'];
  if (entries.length > 0) {
    const firstLine = Math.max(0, (entries[0]?.range.line ?? 1) - 1);
    lines.splice(firstLine, 0, ...block);
    return lines.join(lineEnding);
  }
  lines.push(...block);
  return lines.join(lineEnding);
}

export function patchStructuredField(
  source: string,
  parsed: ParsedManifest,
  field: string,
  value: string | string[],
): string {
  if (field in SCALAR_KEYS) {
    return patchScalarField(source, field as ManifestScalarField, String(value));
  }
  if (field in LIST_KEYS) {
    return patchListField(
      source,
      field as ManifestListField,
      Array.isArray(value) ? value : [value],
      parsed,
    );
  }
  return source;
}
