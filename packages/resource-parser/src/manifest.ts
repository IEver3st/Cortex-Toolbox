import { z } from 'zod';

export const sourceRangeSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});
export const manifestValueSchema = z.object({ value: z.string(), range: sourceRangeSchema });
export const manifestSchema = z.object({
  fxVersion: manifestValueSchema.nullable(),
  game: manifestValueSchema.nullable(),
  author: manifestValueSchema.nullable(),
  description: manifestValueSchema.nullable(),
  version: manifestValueSchema.nullable(),
  clientScripts: z.array(manifestValueSchema),
  serverScripts: z.array(manifestValueSchema),
  sharedScripts: z.array(manifestValueSchema),
  files: z.array(manifestValueSchema),
  dependencies: z.array(manifestValueSchema),
  dataFiles: z.array(z.object({ type: manifestValueSchema, path: manifestValueSchema })),
  uiPage: manifestValueSchema.nullable(),
  unsupported: z.array(z.object({ line: z.number(), text: z.string(), reason: z.string() })),
});
export type ParsedManifest = z.infer<typeof manifestSchema>;

const scalarKeys = new Set(['fx_version', 'game', 'author', 'description', 'version', 'ui_page']);
const listMap: Record<
  string,
  keyof Pick<
    ParsedManifest,
    'clientScripts' | 'serverScripts' | 'sharedScripts' | 'files' | 'dependencies'
  >
> = {
  client_script: 'clientScripts',
  client_scripts: 'clientScripts',
  server_script: 'serverScripts',
  server_scripts: 'serverScripts',
  shared_script: 'sharedScripts',
  shared_scripts: 'sharedScripts',
  file: 'files',
  files: 'files',
  dependency: 'dependencies',
  dependencies: 'dependencies',
};
const scalarMap: Record<
  string,
  keyof Pick<ParsedManifest, 'fxVersion' | 'game' | 'author' | 'description' | 'version' | 'uiPage'>
> = {
  fx_version: 'fxVersion',
  game: 'game',
  author: 'author',
  description: 'description',
  version: 'version',
  ui_page: 'uiPage',
};
const quoted = /(['"])(.*?)\1/g;

export function parseManifest(source: string): ParsedManifest {
  const result: ParsedManifest = {
    fxVersion: null,
    game: null,
    author: null,
    description: null,
    version: null,
    clientScripts: [],
    serverScripts: [],
    sharedScripts: [],
    files: [],
    dependencies: [],
    dataFiles: [],
    uiPage: null,
    unsupported: [],
  };
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    const text = raw.replace(/--.*$/, '').trim();
    if (!text) continue;
    const keyMatch = /^(\w+)\s*(.*)$/.exec(text);
    if (!keyMatch) continue;
    const key = keyMatch[1] ?? '';
    let remainder = keyMatch[2] ?? '';
    let consumedTo = index;
    if (remainder.includes('{') && !remainder.includes('}')) {
      while (consumedTo + 1 < lines.length && !remainder.includes('}')) {
        consumedTo += 1;
        remainder += `\n${lines[consumedTo] ?? ''}`;
      }
    }
    const values = [...remainder.matchAll(quoted)].map((match) => {
      const matchIndex = match.index;
      const prefix = remainder.slice(0, matchIndex);
      const lineOffset = prefix.split('\n').length - 1;
      const lastNewline = prefix.lastIndexOf('\n');
      const column =
        lineOffset === 0 ? Math.max(1, raw.indexOf(match[0]) + 1) : matchIndex - lastNewline;
      return { value: match[2] ?? '', range: { line: index + 1 + lineOffset, column } };
    });
    if (scalarKeys.has(key) && values[0]) result[scalarMap[key] ?? 'description'] = values[0];
    else if (key in listMap) result[listMap[key] ?? 'files'].push(...values);
    else if (key === 'data_file' && values.length >= 2 && values[0] && values[1])
      result.dataFiles.push({ type: values[0], path: values[1] });
    else if (!['lua54', 'this_is_a_map', 'server_only', 'provide'].includes(key))
      result.unsupported.push({
        line: index + 1,
        text,
        reason: 'This construct is not interpreted by the restricted parser.',
      });
    index = consumedTo;
  }
  return manifestSchema.parse(result);
}

function quote(value: string): string {
  return `'${value.replaceAll('\\', '/').replaceAll("'", "\\'")}'`;
}
function list(name: string, values: string[]): string[] {
  if (values.length === 0) return [];
  return [`${name} {`, ...values.map((value) => `    ${quote(value)},`), '}'];
}
export function formatManifest(manifest: ParsedManifest): string {
  const output = [
    `fx_version ${quote(manifest.fxVersion?.value ?? 'cerulean')}`,
    `game ${quote(manifest.game?.value ?? 'gta5')}`,
    '',
    ...(manifest.author ? [`author ${quote(manifest.author.value)}`] : []),
    ...(manifest.description ? [`description ${quote(manifest.description.value)}`] : []),
    ...(manifest.version ? [`version ${quote(manifest.version.value)}`] : []),
    '',
    ...list(
      'shared_scripts',
      manifest.sharedScripts.map((entry) => entry.value),
    ),
    ...list(
      'client_scripts',
      manifest.clientScripts.map((entry) => entry.value),
    ),
    ...list(
      'server_scripts',
      manifest.serverScripts.map((entry) => entry.value),
    ),
    ...list(
      'files',
      manifest.files.map((entry) => entry.value),
    ),
    ...(manifest.uiPage ? [`ui_page ${quote(manifest.uiPage.value)}`] : []),
    ...manifest.dataFiles.map(
      (entry) => `data_file ${quote(entry.type.value)} ${quote(entry.path.value)}`,
    ),
    ...list(
      'dependencies',
      manifest.dependencies.map((entry) => entry.value),
    ),
  ];
  return `${output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

export function buildManifestFromFiles(
  files: readonly { relativePath: string; extension: string }[],
): string {
  const normalized = files
    .map((file) => ({
      relativePath: file.relativePath.replaceAll('\\', '/').replace(/^\.\//, ''),
      extension: file.extension.toLowerCase(),
    }))
    .filter((file) => file.relativePath && !file.relativePath.startsWith('.'))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const scripts = normalized.filter((file) => ['.lua', '.js', '.ts'].includes(file.extension));
  const serverScripts = scripts.filter((file) => /(^|\/)server(\/|\.)/i.test(file.relativePath));
  const sharedScripts = scripts.filter((file) => /(^|\/)shared(\/|\.)/i.test(file.relativePath));
  const clientScripts = scripts.filter(
    (file) => !serverScripts.includes(file) && !sharedScripts.includes(file),
  );
  const dataTypes: Record<string, string> = {
    'vehicles.meta': 'VEHICLE_METADATA_FILE',
    'handling.meta': 'HANDLING_FILE',
    'carcols.meta': 'CARCOLS_FILE',
    'carvariations.meta': 'VEHICLE_VARIATION_FILE',
    'vehiclelayouts.meta': 'VEHICLE_LAYOUTS_FILE',
    'modkits.meta': 'CARCOLS_FILE',
    'dlctext.meta': 'DLCTEXT_FILE',
    'weaponarchetypes.meta': 'WEAPON_METADATA_FILE',
    'weaponanimations.meta': 'WEAPON_ANIMATIONS_FILE',
    'pedpersonality.meta': 'PED_PERSONALITY_FILE',
  };
  const metadata = normalized.filter((file) => file.extension === '.meta');
  const range = { line: 1, column: 1 };
  const value = (input: string) => ({ value: input, range });
  return formatManifest({
    fxVersion: value('cerulean'),
    game: value('gta5'),
    author: value('Cortex ToolBox'),
    description: value('Generated by Bundle'),
    version: value('1.0.0'),
    clientScripts: clientScripts.map((file) => value(file.relativePath)),
    serverScripts: serverScripts.map((file) => value(file.relativePath)),
    sharedScripts: sharedScripts.map((file) => value(file.relativePath)),
    files: metadata.map((file) => value(file.relativePath)),
    dependencies: [],
    dataFiles: metadata
      .map((file) => {
        const type = dataTypes[file.relativePath.split('/').at(-1)?.toLowerCase() ?? ''];
        return type ? { type: value(type), path: value(file.relativePath) } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    uiPage: null,
    unsupported: [],
  });
}
