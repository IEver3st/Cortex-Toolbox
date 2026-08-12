import { describe, expect, it } from 'vitest';
import { analysisMarkdown, analyzeScript, buildResourceAnalysis } from './index';

describe('script analysis', () => {
  it('extracts evidence-backed FiveM contracts without executing source', () => {
    const source =
      "RegisterNetEvent('garage:open')\nAddEventHandler('garage:open', function() end)\nTriggerServerEvent('garage:save')\nexports('GetGarage', function() end)";
    const file = analyzeScript('client/main.lua', source);
    expect(
      file.symbols.some(
        (symbol) => symbol.name === 'garage:open' && symbol.direction === 'incoming',
      ),
    ).toBe(true);
    expect(
      file.symbols.some(
        (symbol) => symbol.name === 'garage:save' && symbol.direction === 'outgoing',
      ),
    ).toBe(true);
    expect(
      file.symbols.some(
        (symbol) =>
          symbol.name === 'GetGarage' && symbol.kind === 'export' && symbol.direction === 'public',
      ),
    ).toBe(true);
    const analysis = buildResourceAnalysis([file], new Date('2026-01-01T00:00:00.000Z'));
    expect(analysis.edges.length).toBeGreaterThan(0);
    expect(analysisMarkdown(analysis)).toContain('client/main.lua:1');
  });

  it('extracts NUI callback registration as an incoming event', () => {
    const source = "RegisterNUICallback('closeUi', function(data, cb) cb('ok') end)";
    const file = analyzeScript('client/nui.lua', source);
    const symbol = file.symbols.find((entry) => entry.name === 'closeUi');
    expect(symbol).toMatchObject({
      kind: 'event',
      direction: 'incoming',
      evidence: { extractionRule: 'nui-callback', confidence: 'exact' },
    });
  });

  it('extracts SendNUIMessage action when present on the same line', () => {
    const source = "SendNUIMessage({ action = 'openMenu', data = {} })";
    const file = analyzeScript('client/nui.lua', source);
    expect(
      file.symbols.some(
        (symbol) =>
          symbol.name === 'openMenu' &&
          symbol.kind === 'event' &&
          symbol.direction === 'outgoing' &&
          symbol.evidence.extractionRule === 'nui-message',
      ),
    ).toBe(true);
  });

  it('extracts ox_lib callback register and call', () => {
    const source =
      "lib.callback.register('garage:getSlots', function() return 4 end)\nlib.callback('garage:getSlots', false, function(slots) end)";
    const file = analyzeScript('server/callbacks.lua', source);
    expect(
      file.symbols.some(
        (symbol) =>
          symbol.name === 'garage:getSlots' &&
          symbol.kind === 'export' &&
          symbol.direction === 'public' &&
          symbol.evidence.extractionRule === 'ox-lib-callback-registration',
      ),
    ).toBe(true);
    expect(
      file.symbols.some(
        (symbol) =>
          symbol.name === 'garage:getSlots' &&
          symbol.kind === 'dependency' &&
          symbol.direction === 'dependency' &&
          symbol.evidence.extractionRule === 'ox-lib-callback-call',
      ),
    ).toBe(true);
  });

  it('warns on unresolved dynamic event and export names without adding symbols', () => {
    const source =
      "local eventName = 'garage:' .. mode\nRegisterNetEvent(eventName)\nTriggerServerEvent(eventName)\nexports(exportName, function() end)";
    const file = analyzeScript('client/dynamic.lua', source);
    expect(file.symbols.some((symbol) => symbol.name === '<dynamic>')).toBe(false);
    expect(file.symbols.some((symbol) => symbol.kind === 'event')).toBe(false);
    expect(file.warnings.some((warning) => /Unresolved dynamic.*near line 2/.test(warning))).toBe(
      true,
    );
    expect(file.warnings.some((warning) => /Unresolved dynamic.*near line 3/.test(warning))).toBe(
      true,
    );
    expect(file.warnings.some((warning) => /Unresolved dynamic.*near line 4/.test(warning))).toBe(
      true,
    );
  });

  it('includes a Coverage section in analysis markdown', () => {
    const file = analyzeScript('client/main.lua', "RegisterNetEvent('a')");
    const markdown = analysisMarkdown(
      buildResourceAnalysis([file], new Date('2026-01-01T00:00:00.000Z')),
    );
    expect(markdown).toContain('## Coverage');
    expect(markdown).toContain('static string literals');
    expect(markdown).toContain('NUI callback');
    expect(markdown).toContain('no script execution');
  });

  it('breaks scripts into ordered structural pieces with line ranges and weights', () => {
    const source = [
      'local config = {}',
      '',
      "RegisterNetEvent('garage:open')",
      "AddEventHandler('garage:open', function() end)",
      '',
      'function OpenGarage()',
      '  print("open")',
      'end',
      '',
      "RegisterCommand('garage', function() end)",
      "exports('GetGarage', function() end)",
    ].join('\n');
    const file = analyzeScript('client/garage.lua', source);
    expect(file.pieces.length).toBeGreaterThanOrEqual(3);
    expect(file.pieces[0]).toMatchObject({
      kind: 'preamble',
      startLine: 1,
      label: 'Preamble',
    });
    const handler = file.pieces.find((piece) => piece.kind === 'handler');
    expect(handler).toBeTruthy();
    expect(handler?.startLine).toBe(3);
    const fn = file.pieces.find((piece) => piece.label === 'OpenGarage');
    expect(fn).toMatchObject({ kind: 'function' });
    const weights = file.pieces.reduce((sum, piece) => sum + piece.weight, 0);
    expect(weights).toBeCloseTo(1, 5);
    const analysis = buildResourceAnalysis([file], new Date('2026-01-01T00:00:00.000Z'));
    expect(analysis.summary.pieces).toBe(file.pieces.length);
    const markdown = analysisMarkdown(analysis);
    expect(markdown).toContain('## Structure');
    expect(markdown).toContain('Preamble');
    expect(markdown).toContain('OpenGarage');
  });

  it('emits a single whole-file piece when no symbols are found', () => {
    const file = analyzeScript('shared/empty.lua', 'local x = 1\nreturn x\n');
    expect(file.pieces).toHaveLength(1);
    expect(file.pieces[0]).toMatchObject({
      kind: 'region',
      startLine: 1,
      endLine: 3,
      weight: 1,
    });
  });

  it('links same-file function callers in the graph', () => {
    const file = analyzeScript(
      'client/functions.lua',
      [
        'function FormatPlate()',
        "  return 'ABC'",
        'end',
        'function SpawnCar()',
        '  FormatPlate()',
        'end',
      ].join('\n'),
    );
    expect(file.references).toContainEqual(
      expect.objectContaining({ name: 'FormatPlate', caller: 'SpawnCar', line: 5 }),
    );
    const graph = buildResourceAnalysis([file]);
    expect(graph.edges).toContainEqual({
      from: 'function:client/functions.lua:SpawnCar',
      to: 'function:client/functions.lua:FormatPlate',
      kind: 'calls',
    });
  });

  it('flags continuous loops without a yield and network emissions in loops', () => {
    const file = analyzeScript(
      'client/hot.lua',
      [
        'CreateThread(function()',
        '  while true do',
        "    TriggerServerEvent('hot:path')",
        '  end',
        'end)',
      ].join('\n'),
    );
    expect(file.warnings).toContain('Continuous loop has no visible Wait near line 2');
    expect(file.warnings).toContain('Network event is emitted from a continuous loop near line 2');
  });
});
