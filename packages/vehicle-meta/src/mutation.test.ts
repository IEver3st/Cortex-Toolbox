/**
 * Mutation tests: inject controlled defects into known-good metadata and
 * confirm the generic constraint engine diagnoses (and optionally repairs) them.
 * Prevents rules from only matching hand-authored fixture strings.
 */

import { describe, expect, it } from 'vitest';
import {
  diagnoseMetaBundle,
  generateVehicleMetaBundle,
  isWellFormedXml,
  type MetaFileInput,
  type MetaFinding,
} from './index';

function rootFindings(findings: MetaFinding[]): MetaFinding[] {
  return findings.filter((f) => f.severity !== 'info');
}

function fileOf(files: MetaFileInput[], suffix: string): MetaFileInput {
  const hit = files.find((f) => f.name.endsWith(suffix));
  if (!hit) throw new Error(`missing ${suffix}`);
  return hit;
}

function mutate(
  files: MetaFileInput[],
  suffix: string,
  transform: (content: string) => string,
): MetaFileInput[] {
  return files.map((f) => (f.name.endsWith(suffix) ? { ...f, content: transform(f.content) } : f));
}

function nearLine(finding: MetaFinding, expectedLine: number, radius = 2): boolean {
  return Math.abs(finding.location.line - expectedLine) <= radius;
}

describe('Align mutation tests', () => {
  const baseline = generateVehicleMetaBundle({
    modelName: 'cortex_mut',
    emergency: false,
    modkitId: 900,
  });

  it('detects deleted attribute quote', () => {
    const handling = fileOf(baseline, 'handling.meta');
    const line = handling.content.split(/\r?\n/).findIndex((l) => l.includes('fMass value='));
    const mutated = mutate(baseline, 'handling.meta', (c) =>
      c.replace('fMass value="', 'fMass value='),
    );
    const result = diagnoseMetaBundle(mutated);
    const roots = rootFindings(result.findings).filter((f) => f.fileName.endsWith('handling.meta'));
    expect(roots.length).toBeGreaterThanOrEqual(1);
    expect(roots.some((f) => /quote|malformed|attribute/i.test(f.title))).toBe(true);
    expect(roots.some((f) => nearLine(f, line + 1, 3))).toBe(true);
  });

  it('detects deleted angle bracket on self-closing tag', () => {
    const carcols = fileOf(baseline, 'carcols.meta');
    // Force a classic self-close defect on an id line if present, else inject
    let content = carcols.content;
    if (!content.includes('<id value=')) {
      content = content.replace(
        '<Kits />',
        '<Kits>\n    <Item>\n      <kitName>900_cortex_mut_modkit</kitName>\n      <id value="900" />\n      <kitType>MKT_STANDARD</kitType>\n    </Item>\n  </Kits>',
      );
    }
    const withId = baseline.map((f) => (f.name.endsWith('carcols.meta') ? { ...f, content } : f));
    const mutated = mutate(withId, 'carcols.meta', (c) =>
      c.replace(/<id value="900"\s*\/>/, '<id value="900">'),
    );
    const result = diagnoseMetaBundle(mutated);
    const roots = rootFindings(result.findings).filter((f) => f.fileName.endsWith('carcols.meta'));
    expect(roots.some((f) => /self-closing|malformed|unclosed/i.test(f.title))).toBe(true);
  });

  it('detects mismatched closing tag', () => {
    const vehicles = fileOf(baseline, 'vehicles.meta');
    const mutated = mutate(baseline, 'vehicles.meta', (c) =>
      c.replace(/<txdName>([^<]*)<\/txdName>/, '<txdName>$1</textureName>'),
    );
    const result = diagnoseMetaBundle(mutated);
    const roots = rootFindings(result.findings).filter((f) => f.fileName.endsWith('vehicles.meta'));
    expect(roots.some((f) => /mismatched closing/i.test(f.title))).toBe(true);
    const repairable = roots.find((f) => f.repairAvailability === 'candidate');
    if (repairable?.repair) {
      expect(isWellFormedXml(repairable.repair.repairedContent)).toBe(true);
    }
  });

  it('detects duplicate attribute', () => {
    const mutated = mutate(baseline, 'carvariations.meta', (c) =>
      c.replace(/<lightSettings value="0"\s*\/>/, '<lightSettings value="0" value="1" />'),
    );
    const result = diagnoseMetaBundle(mutated);
    const roots = rootFindings(result.findings).filter((f) =>
      f.fileName.endsWith('carvariations.meta'),
    );
    expect(roots.some((f) => /duplicate attribute/i.test(f.title))).toBe(true);
  });

  it('detects enum character mutation', () => {
    const mutated = mutate(baseline, 'vehicles.meta', (c) => c.replace('VC_SPORT', 'VC_SPROT'));
    const result = diagnoseMetaBundle(mutated);
    const roots = rootFindings(result.findings).filter((f) => f.fileName.endsWith('vehicles.meta'));
    expect(roots.some((f) => /vehicle class/i.test(f.title))).toBe(true);
    const hit = roots.find((f) => /vehicle class/i.test(f.title));
    expect(hit?.repair?.suggestedValue === 'VC_SPORT' || hit?.repairAvailability === 'manual').toBe(
      true,
    );
  });

  it('detects digit replaced with letter O in integer id', () => {
    let content = fileOf(baseline, 'carcols.meta').content;
    if (!content.includes('<id value=')) {
      content = content.replace(
        '<Kits />',
        '<Kits>\n    <Item>\n      <kitName>900_cortex_mut_modkit</kitName>\n      <id value="900" />\n      <kitType>MKT_STANDARD</kitType>\n    </Item>\n  </Kits>',
      );
    }
    const withId = baseline.map((f) => (f.name.endsWith('carcols.meta') ? { ...f, content } : f));
    const mutated = mutate(withId, 'carcols.meta', (c) =>
      c.replace('id value="900"', 'id value="9O0"'),
    );
    const result = diagnoseMetaBundle(mutated);
    const roots = rootFindings(result.findings).filter((f) => f.fileName.endsWith('carcols.meta'));
    expect(roots.some((f) => /integer/i.test(f.title))).toBe(true);
  });

  it('detects numeric value pushed outside absolute range', () => {
    const mutated = mutate(baseline, 'handling.meta', (c) =>
      c.replace(/fDriveBiasFront value="[^"]+"/, 'fDriveBiasFront value="1.500000"'),
    );
    const result = diagnoseMetaBundle(mutated);
    const roots = rootFindings(result.findings).filter((f) => f.fileName.endsWith('handling.meta'));
    expect(roots.some((f) => /out of range/i.test(f.title))).toBe(true);
  });

  it('detects broken typed handling reference', () => {
    const mutated = mutate(baseline, 'vehicles.meta', (c) =>
      c.replace(/<handlingId>[^<]+<\/handlingId>/, '<handlingId>NOT_A_REAL_HANDLING</handlingId>'),
    );
    const result = diagnoseMetaBundle(mutated);
    const roots = rootFindings(result.findings).filter((f) => f.fileName.endsWith('vehicles.meta'));
    expect(roots.some((f) => /handling/i.test(f.title) && f.category === 'cross-file')).toBe(true);
  });

  it('detects empty required text mutation', () => {
    const layouts = `<?xml version="1.0" encoding="UTF-8"?>
<CVehicleMetadata>
  <SeatInfos>
    <Item type="CVehicleSeatInfo">
      <Name>SEAT_MUT_DRIVER</Name>
      <SeatBoneName></SeatBoneName>
      <ShuffleLink>SEAT_MUT_PASSENGER</ShuffleLink>
    </Item>
    <Item type="CVehicleSeatInfo">
      <Name>SEAT_MUT_PASSENGER</Name>
      <SeatBoneName>seat_pside_f</SeatBoneName>
      <ShuffleLink>SEAT_MUT_DRIVER</ShuffleLink>
    </Item>
  </SeatInfos>
  <VehicleLayouts>
    <Item type="CVehicleLayoutInfo">
      <Name>LAYOUT_CORTEX_MUT</Name>
      <Seats>
        <Item>SEAT_MUT_DRIVER</Item>
        <Item>SEAT_MUT_PASSENGER</Item>
      </Seats>
    </Item>
  </VehicleLayouts>
</CVehicleMetadata>
`;
    const files = [
      ...baseline.filter((f) => !f.name.endsWith('vehiclelayouts.meta')),
      { name: 'data/vehiclelayouts.meta', content: layouts },
    ];
    const result = diagnoseMetaBundle(files);
    const roots = rootFindings(result.findings).filter((f) =>
      f.fileName.endsWith('vehiclelayouts.meta'),
    );
    expect(roots.some((f) => /empty required/i.test(f.title))).toBe(true);
  });

  it('detects self-referencing ShuffleLink mutation', () => {
    const layouts = `<?xml version="1.0" encoding="UTF-8"?>
<CVehicleMetadata>
  <SeatInfos>
    <Item type="CVehicleSeatInfo">
      <Name>SEAT_MUT_DRIVER</Name>
      <SeatBoneName>seat_dside_f</SeatBoneName>
      <ShuffleLink>SEAT_MUT_DRIVER</ShuffleLink>
    </Item>
    <Item type="CVehicleSeatInfo">
      <Name>SEAT_MUT_PASSENGER</Name>
      <SeatBoneName>seat_pside_f</SeatBoneName>
      <ShuffleLink>SEAT_MUT_DRIVER</ShuffleLink>
    </Item>
  </SeatInfos>
  <VehicleLayouts>
    <Item type="CVehicleLayoutInfo">
      <Name>LAYOUT_CORTEX_MUT</Name>
      <Seats>
        <Item>SEAT_MUT_DRIVER</Item>
        <Item>SEAT_MUT_PASSENGER</Item>
      </Seats>
    </Item>
  </VehicleLayouts>
</CVehicleMetadata>
`;
    const files = [
      ...baseline.filter((f) => !f.name.endsWith('vehiclelayouts.meta')),
      { name: 'data/vehiclelayouts.meta', content: layouts },
    ];
    const result = diagnoseMetaBundle(files);
    const roots = rootFindings(result.findings).filter((f) =>
      f.fileName.endsWith('vehiclelayouts.meta'),
    );
    expect(roots.some((f) => /self-referenc/i.test(f.title))).toBe(true);
  });

  it('detects lodDistances cardinality mutation', () => {
    const mutated = mutate(baseline, 'vehicles.meta', (c) =>
      c.replace(
        /<lodDistances content="float_array">[^<]+<\/lodDistances>/,
        '<lodDistances content="float_array">15.000000 30.000000 60.000000</lodDistances>',
      ),
    );
    const result = diagnoseMetaBundle(mutated);
    const roots = rootFindings(result.findings).filter((f) => f.fileName.endsWith('vehicles.meta'));
    expect(roots.some((f) => /array item count/i.test(f.title))).toBe(true);
  });

  it('detects invalid hexadecimal color mutation', () => {
    let content = fileOf(baseline, 'carcols.meta').content;
    if (!content.includes('color value=')) {
      content = content.replace(
        '<Lights />',
        '<Lights>\n    <Item>\n      <id value="0" />\n      <indicator>\n        <color value="0xFFFF6A00" />\n      </indicator>\n    </Item>\n  </Lights>',
      );
    }
    const withColor = baseline.map((f) =>
      f.name.endsWith('carcols.meta') ? { ...f, content } : f,
    );
    const mutated = mutate(withColor, 'carcols.meta', (c) =>
      c.replace(/color value="0x[0-9A-Fa-f]+"/, 'color value="0xZZFF6A00"'),
    );
    const result = diagnoseMetaBundle(mutated);
    const roots = rootFindings(result.findings).filter((f) => f.fileName.endsWith('carcols.meta'));
    expect(roots.some((f) => /hex/i.test(f.title))).toBe(true);
  });
});
