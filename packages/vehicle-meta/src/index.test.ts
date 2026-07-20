import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  binaryToDecimal,
  HANDLING_PRESETS,
  DEFAULT_HANDLING_SETUP,
  decimalToBinary,
  diagnoseMetaBundle,
  generateVehicleMetaBundle,
  isWellFormedXml,
  parseSirenPattern,
  SIREN_CHANNEL_COUNT,
  serializeSirenPattern,
} from './index';

const SUITE_ROOT = path.resolve('C:/Users/User/Desktop/FiveM_Vehicle_Meta_Repair_Test_Suite');

function readMetaFiles(dir: string): { name: string; content: string }[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.meta'))
    .map((name) => ({
      name: path.join(path.basename(dir), name).replaceAll('\\', '/'),
      content: readFileSync(path.join(dir, name), 'utf8'),
    }));
}

function primaryFinding(files: { name: string; content: string }[]) {
  const result = diagnoseMetaBundle(files);
  return { result, finding: result.findings[0] };
}

describe('siren patterns', () => {
  it('round-trips unsigned 32-bit sequencers', () => {
    const bits = Array.from({ length: 32 }, (_, index) => index % 2 === 0);
    expect(decimalToBinary(binaryToDecimal(bits))).toEqual(bits);
    expect(binaryToDecimal(Array.from({ length: 32 }, () => true))).toBe(4_294_967_295);
  });

  it('exports deterministic xml, dat, and json', () => {
    const pattern = {
      name: 'Pursuit',
      bpm: 600,
      colors: ['#ff3344'],
      channels: [decimalToBinary(2_863_311_530)],
    };
    expect(serializeSirenPattern(pattern, 'xml')).toContain('sequencer value="2863311530"');
    expect(serializeSirenPattern(pattern, 'xml')).toContain('<CVehicleModelInfoVarGlobal>');
    expect(serializeSirenPattern(pattern, 'dat')).toContain('channel.1=2863311530');
    const parsed: unknown = JSON.parse(serializeSirenPattern(pattern, 'json'));
    expect(parsed).toMatchObject({ channels: [{ decimal: 2_863_311_530 }] });
  });

  it('exports all 24 Pulse channels to carcols', () => {
    const pattern = {
      name: 'Fleet pattern',
      bpm: 600,
      colors: Array.from({ length: SIREN_CHANNEL_COUNT }, () => '#ff3344'),
      channels: Array.from({ length: SIREN_CHANNEL_COUNT }, (_, index) =>
        decimalToBinary(index + 1),
      ),
    };
    const xml = serializeSirenPattern(pattern, 'xml');
    expect(xml.match(/<lightGroup value=/g)).toHaveLength(SIREN_CHANNEL_COUNT);
    expect(xml).toContain('<lightGroup value="23" />');
  });

  it('imports Pulse and drop-in carcols formats', () => {
    const pattern = {
      name: 'Pursuit',
      bpm: 600,
      sirenId: 42,
      colors: ['#ff3344'],
      channels: [decimalToBinary(2_863_311_530)],
    };
    expect(parseSirenPattern(serializeSirenPattern(pattern, 'json'))).toMatchObject({
      name: 'Pursuit',
      sirenId: 42,
    });
    expect(
      binaryToDecimal(parseSirenPattern(serializeSirenPattern(pattern, 'dat')).channels[0] ?? []),
    ).toBe(2_863_311_530);
    const carcols = parseSirenPattern(serializeSirenPattern(pattern, 'xml'));
    expect(carcols).toMatchObject({ name: 'Pursuit', bpm: 600, sirenId: 42 });
    expect(binaryToDecimal(carcols.channels[0] ?? [])).toBe(2_863_311_530);
    expect(carcols.colors[0]).toBe('#ff3344');
    expect(carcols.channels).toHaveLength(SIREN_CHANNEL_COUNT);
  });
});

describe('vehicle metadata', () => {
  it('generates linked core files', () => {
    const files = generateVehicleMetaBundle({
      modelName: 'police_test',
      emergency: true,
      sirenId: 42,
      lightId: 77,
      modkitId: 1000,
    });
    expect(files).toHaveLength(6);
    expect(files.find((file) => file.name.endsWith('vehicles.meta'))?.content).toContain(
      '<modelName>police_test</modelName>',
    );
    expect(files.find((file) => file.name.endsWith('carvariations.meta'))?.content).toContain(
      '<sirenSettings value="42" />',
    );
    expect(files.find((file) => file.name.endsWith('carcols.meta'))?.content).toContain(
      '<emmissiveBoost value="false" />',
    );
  });

  it('grounds handling values and active Pulse patterns in generated metadata', () => {
    const pattern = {
      name: 'Response split',
      bpm: 720,
      sirenId: 91,
      colors: ['#ff3344'],
      channels: [decimalToBinary(2_863_311_530)],
    };
    const files = generateVehicleMetaBundle({
      modelName: 'response_car',
      handlingId: 'RESPONSE_CAR',
      emergency: true,
      sirenId: 91,
      handling: HANDLING_PRESETS.emergency.values,
      sirenPattern: pattern,
    });
    const handling = files.find((file) => file.name.endsWith('handling.meta'))?.content;
    const carcols = files.find((file) => file.name.endsWith('carcols.meta'))?.content;
    expect(handling).toContain('<fInitialDriveForce value="0.340000" />');
    expect(handling).toContain('<nInitialDriveGears value="6" />');
    expect(carcols).toContain('<name>Response split</name>');
    expect(carcols).toContain('<sequencer value="2863311530" />');
  });

  it('writes editable chassis setup values into handling metadata', () => {
    const files = generateVehicleMetaBundle({
      modelName: 'setup_test',
      handlingSetup: {
        ...DEFAULT_HANDLING_SETUP,
        centreOfMass: { x: 0.1, y: -0.2, z: -0.35 },
        inertiaMultiplier: { x: 1.2, y: 1.1, z: 1.8 },
        monetaryValue: 92_000,
        aiHandling: 'SPORTS_CAR',
        subHandling: 'trailer',
      },
    });
    const handling = files.find((file) => file.name.endsWith('handling.meta'))?.content;
    expect(handling).toContain(
      '<vecCentreOfMassOffset x="0.100000" y="-0.200000" z="-0.350000" />',
    );
    expect(handling).toContain('<nMonetaryValue value="92000" />');
    expect(handling).toContain('<AIHandling>SPORTS_CAR</AIHandling>');
    expect(handling).toContain('<Item type="CTrailerHandlingData" />');
  });

  it('repairs duplicate ids and local broken bindings as one plan', () => {
    const carcols = (id: number) =>
      `<CVehicleModelInfoVarGlobal><Sirens><Item><id value="${id}" /></Item></Sirens></CVehicleModelInfoVarGlobal>`;
    const variations = (id: number) =>
      `<CVehicleModelInfoVariation><variationData><Item><modelName>car</modelName><sirenSettings value="${id}" /></Item></variationData></CVehicleModelInfoVariation>`;
    const result = diagnoseMetaBundle([
      { name: 'a/data/carcols.meta', content: carcols(10) },
      { name: 'a/data/carvariations.meta', content: variations(10) },
      { name: 'b/data/carcols.meta', content: carcols(10) },
      { name: 'b/data/carvariations.meta', content: variations(10) },
    ]);
    expect(result.issues.some((issue) => issue.id.startsWith('duplicate-siren'))).toBe(true);
    expect(result.changes.find((change) => change.file === 'b/data/carcols.meta')?.after).toContain(
      'value="254"',
    );
    expect(
      result.changes.find((change) => change.file === 'b/data/carvariations.meta')?.after,
    ).toContain('value="254"');
  });

  it('repairs a renamed vehicle binding', () => {
    const result = diagnoseMetaBundle([
      {
        name: 'pack/data/vehicles.meta',
        content:
          '<CVehicleModelInfo__InitDataList><InitDatas><Item><modelName>new_name</modelName></Item></InitDatas></CVehicleModelInfo__InitDataList>',
      },
      {
        name: 'pack/data/carvariations.meta',
        content:
          '<CVehicleModelInfoVariation><variationData><Item><modelName>old_name</modelName></Item></variationData></CVehicleModelInfoVariation>',
      },
    ]);
    expect(result.changes[0]?.after).toContain('<modelName>new_name</modelName>');
  });
});

describe('FiveM Vehicle Meta Repair Test Suite', () => {
  it('case 01: missing self-closing slash', () => {
    const files = readMetaFiles(path.join(SUITE_ROOT, 'cases/01_carcols_missing_self_close'));
    const { result, finding } = primaryFinding(files);
    expect(result.findings).toHaveLength(1);
    expect(finding?.title).toMatch(/self-closing/i);
    expect(finding?.location.line).toBe(6);
    expect(finding?.repairAvailability).toBe('candidate');
    expect(finding?.repair?.validated).toBe(true);
    expect(finding?.repair?.linesChanged).toBe(1);
    expect(finding?.repair?.after).toContain('<id value="1000" />');
    expect(isWellFormedXml(finding!.repair!.repairedContent)).toBe(true);
    expect(finding?.supportingDiagnostics.length).toBeGreaterThan(0);
    const fixed = readFileSync(
      path.join(SUITE_ROOT, 'fixed_reference/01_carcols_missing_self_close/carcols.meta'),
      'utf8',
    );
    expect(finding?.repair?.repairedContent.replace(/\r\n/g, '\n')).toBe(
      fixed.replace(/\r\n/g, '\n'),
    );
  });

  it('case 02: missing closing-tag bracket', () => {
    const files = readMetaFiles(
      path.join(SUITE_ROOT, 'cases/02_carvariations_missing_closing_bracket'),
    );
    const { result, finding } = primaryFinding(files);
    expect(result.findings).toHaveLength(1);
    expect(finding?.location.line).toBe(5);
    expect(finding?.repair?.after).toContain('</modelName>');
    expect(finding?.repairAvailability).toBe('candidate');
    const fixed = readFileSync(
      path.join(
        SUITE_ROOT,
        'fixed_reference/02_carvariations_missing_closing_bracket/carvariations.meta',
      ),
      'utf8',
    );
    expect(finding?.repair?.repairedContent.replace(/\r\n/g, '\n')).toBe(
      fixed.replace(/\r\n/g, '\n'),
    );
  });

  it('case 03: unclosed attribute quote', () => {
    const files = readMetaFiles(
      path.join(SUITE_ROOT, 'cases/03_handling_unclosed_attribute_quote'),
    );
    const { result, finding } = primaryFinding(files);
    expect(result.findings).toHaveLength(1);
    expect(finding?.location.line).toBe(6);
    expect(finding?.repair?.after).toContain('value="1500.000000"');
    expect(finding?.repairAvailability).toBe('candidate');
    const fixed = readFileSync(
      path.join(SUITE_ROOT, 'fixed_reference/03_handling_unclosed_attribute_quote/handling.meta'),
      'utf8',
    );
    expect(finding?.repair?.repairedContent.replace(/\r\n/g, '\n')).toBe(
      fixed.replace(/\r\n/g, '\n'),
    );
  });

  it('case 04: mismatched closing tag', () => {
    const files = readMetaFiles(path.join(SUITE_ROOT, 'cases/04_vehicles_mismatched_closing_tag'));
    const { result, finding } = primaryFinding(files);
    expect(result.findings).toHaveLength(1);
    expect(finding?.location.line).toBe(8);
    expect(finding?.repair?.after).toContain('</txdName>');
    expect(finding?.repair?.after).not.toContain('</textureName>');
    const fixed = readFileSync(
      path.join(SUITE_ROOT, 'fixed_reference/04_vehicles_mismatched_closing_tag/vehicles.meta'),
      'utf8',
    );
    expect(finding?.repair?.repairedContent.replace(/\r\n/g, '\n')).toBe(
      fixed.replace(/\r\n/g, '\n'),
    );
  });

  it('case 05: unescaped ampersand', () => {
    const files = readMetaFiles(
      path.join(SUITE_ROOT, 'cases/05_vehiclelayouts_unescaped_ampersand'),
    );
    const { result, finding } = primaryFinding(files);
    expect(result.findings).toHaveLength(1);
    expect(finding?.location.line).toBe(17);
    expect(finding?.repair?.after).toContain('&amp;');
    const fixed = readFileSync(
      path.join(
        SUITE_ROOT,
        'fixed_reference/05_vehiclelayouts_unescaped_ampersand/vehiclelayouts.meta',
      ),
      'utf8',
    );
    expect(finding?.repair?.repairedContent.replace(/\r\n/g, '\n')).toBe(
      fixed.replace(/\r\n/g, '\n'),
    );
  });

  it('case 06: invalid numeric value with suggested reference', () => {
    const files = readMetaFiles(path.join(SUITE_ROOT, 'cases/06_handling_invalid_numeric_value'));
    const { result, finding } = primaryFinding(files);
    expect(isWellFormedXml(files[0]!.content)).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(finding?.title).toBe('Invalid numeric value');
    expect(finding?.location.line).toBe(13);
    expect(finding?.explanation).toContain('fInitialDriveForce');
    expect(finding?.explanation).toContain('"fast"');
    expect(finding?.explanation).toContain('0.300000');
    expect(finding?.repair?.suggestedValue).toBe('0.300000');
  });

  it('case 07: handling ID mismatch with companion', () => {
    const files = readMetaFiles(path.join(SUITE_ROOT, 'cases/07_vehicles_handling_id_mismatch'));
    const result = diagnoseMetaBundle(files);
    const finding = result.findings.find((item) => item.category === 'cross-file');
    expect(finding).toBeTruthy();
    expect(finding?.explanation).toContain('CORTEX_TSET');
    expect(finding?.explanation).toContain('CORTEX_TEST');
    expect(finding?.repairAvailability).toBe('candidate');
    expect(finding?.repair?.after).toContain('CORTEX_TEST');
    const fixed = readFileSync(
      path.join(SUITE_ROOT, 'fixed_reference/07_vehicles_handling_id_mismatch/vehicles.meta'),
      'utf8',
    );
    expect(finding?.repair?.repairedContent.replace(/\r\n/g, '\n')).toBe(
      fixed.replace(/\r\n/g, '\n'),
    );
  });

  it('case 08: modkit mismatch with companion', () => {
    const files = readMetaFiles(path.join(SUITE_ROOT, 'cases/08_carvariations_modkit_mismatch'));
    const result = diagnoseMetaBundle(files);
    const finding = result.findings.find((item) => item.category === 'cross-file');
    expect(finding).toBeTruthy();
    expect(finding?.explanation).toContain('1001_cortex_test_modkit');
    expect(finding?.explanation).toContain('1000_cortex_test_modkit');
    expect(finding?.repairAvailability).toBe('candidate');
    const fixed = readFileSync(
      path.join(SUITE_ROOT, 'fixed_reference/08_carvariations_modkit_mismatch/carvariations.meta'),
      'utf8',
    );
    expect(finding?.repair?.repairedContent.replace(/\r\n/g, '\n')).toBe(
      fixed.replace(/\r\n/g, '\n'),
    );
  });

  it('batch_all_broken: 20-file multi-vehicle suite yields one root finding per file', () => {
    const files = readMetaFiles(path.join(SUITE_ROOT, 'batch_all_broken'));
    const result = diagnoseMetaBundle(files);
    expect(result.stats.files).toBe(20);
    expect(result.stats.filesWithFindings).toBe(20);
    expect(result.stats.rootFindings).toBe(20);
    expect(result.stats.repairCandidates).toBeGreaterThan(0);
    // Never only character offsets
    for (const finding of result.findings) {
      expect(finding.location.line).toBeGreaterThan(0);
      expect(finding.fileName.length).toBeGreaterThan(0);
    }
    // No false-positive broken modkit on nomad variation
    expect(
      result.findings.some(
        (f) =>
          f.fileName === 'carvariations_nomad.meta' &&
          f.severity === 'error' &&
          /broken modkit/i.test(f.title),
      ),
    ).toBe(false);
  });

  it('does not count each cascade as an independent root finding', () => {
    const files = readMetaFiles(path.join(SUITE_ROOT, 'cases/01_carcols_missing_self_close'));
    const result = diagnoseMetaBundle(files);
    expect(result.findings).toHaveLength(1);
    expect(result.stats.rawParserDiagnostics).toBeGreaterThan(1);
    expect(result.findings[0]?.supportingDiagnostics.length).toBeGreaterThan(1);
  });
});
