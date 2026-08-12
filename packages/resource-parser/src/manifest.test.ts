import { describe, expect, it } from 'vitest';
import { buildManifestFromFiles, formatManifest, parseManifest } from './manifest';

const source = `fx_version 'cerulean'\ngame 'gta5'\nclient_scripts {\n 'client/main.lua',\n 'client/ui.lua'\n}\nserver_script 'server/main.lua'\n`;
describe('restricted manifest parser', () => {
  it('extracts documented declarations without evaluating Lua', () => {
    const result = parseManifest(source);
    expect(result.clientScripts.map((x) => x.value)).toEqual(['client/main.lua', 'client/ui.lua']);
    expect(result.serverScripts[0]?.value).toBe('server/main.lua');
  });
  it('formats stable readable Lua', () =>
    expect(formatManifest(parseManifest(source))).toContain("fx_version 'cerulean'"));
  it('reports dynamic constructs as unsupported', () =>
    expect(parseManifest("local x = os.getenv('X')").unsupported).toHaveLength(1));
});

describe('Bundle manifest generation', () => {
  it('classifies scripts and vehicle metadata deterministically', () => {
    const source = buildManifestFromFiles([
      { relativePath: 'client/main.lua', extension: '.lua' },
      { relativePath: 'server/main.lua', extension: '.lua' },
      { relativePath: 'data/vehicles.meta', extension: '.meta' },
      { relativePath: 'data/handling.meta', extension: '.meta' },
      { relativePath: 'stream/car.yft', extension: '.yft' },
    ]);
    expect(source).toContain('client_scripts {');
    expect(source).toContain("'client/main.lua'");
    expect(source).toContain('server_scripts {');
    expect(source).toContain("data_file 'VEHICLE_METADATA_FILE' 'data/vehicles.meta'");
    expect(source).toContain("data_file 'HANDLING_FILE' 'data/handling.meta'");
    expect(source).not.toContain('stream/car.yft');
  });
});
