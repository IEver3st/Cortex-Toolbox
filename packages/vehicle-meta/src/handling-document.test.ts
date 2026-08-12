import { describe, expect, it } from 'vitest';
import {
  parseHandlingDocument,
  updateHandlingEntry,
  validateHandlingEntry,
} from './handling-document';

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<CHandlingDataMgr>
  <!-- keep this file-level comment -->
  <HandlingData>
    <Item type="CHandlingData">
      <handlingName>GSDGATOR</handlingName>
      <fMass value="2450.000000" />
      <fInitialDragCoeff value="9.500000" />
      <fDownforceModifier value="1.200000" />
      <fDriveBiasFront value="0.320000" />
      <nInitialDriveGears value="6" />
      <fInitialDriveForce value="15.750000" />
      <vecCentreOfMassOffset x="0.000000" y="0.050000" z="-0.900000" />
      <vecInertiaMultiplier x="1.200000" y="1.900000" z="2.900000" />
      <fSeatOffsetDistX value="0.100000" />
      <fSeatOffsetDistY value="-0.020000" />
      <fSeatOffsetDistZ value="0.030000" />
      <nMonetaryValue value="75000" />
      <strModelFlags>440010</strModelFlags>
      <strHandlingFlags>820000</strHandlingFlags>
      <strDamageFlags>0</strDamageFlags>
      <AIHandling>SPORTS_CAR</AIHandling>
      <fCommunityExtension value="123.456" />
      <SubHandlingData>
        <Item type="CCarHandlingData">
          <fBackEndPopUpCarImpulseMult value="0.100000" />
          <CustomSubHandlingValue value="leave-me" />
        </Item>
        <Item type="NULL" />
      </SubHandlingData>
    </Item>
    <!-- unrelated entry must remain byte-for-byte -->
    <Item type="CHandlingData">
      <handlingName>SECOND_CAR</handlingName>
      <fMass value="1300.000000" />
      <fInitialDriveForce value="0.300000" />
      <vecCentreOfMassOffset x="0.000000" y="0.000000" z="0.000000" />
      <vecInertiaMultiplier x="1.000000" y="1.400000" z="1.600000" />
      <strModelFlags>0</strModelFlags>
      <strHandlingFlags>0</strHandlingFlags>
      <strDamageFlags>0</strDamageFlags>
      <AIHandling>AVERAGE</AIHandling>
      <SubHandlingData><Item type="NULL" /></SubHandlingData>
    </Item>
  </HandlingData>
</CHandlingDataMgr>
`;

describe('handling document editing', () => {
  it('parses real entries, vectors, flags, subhandling, and unusual finite values', () => {
    const document = parseHandlingDocument(SOURCE);

    expect(document.entries.map((entry) => entry.handlingName)).toEqual(['GSDGATOR', 'SECOND_CAR']);
    const entry = document.entries[0]!;
    expect(entry.values.fMass).toBe(2450);
    expect(entry.values.fInitialDriveForce).toBe(15.75);
    expect(entry.setup.centreOfMass).toEqual({ x: 0, y: 0.05, z: -0.9 });
    expect(entry.setup.inertiaMultiplier).toEqual({ x: 1.2, y: 1.9, z: 2.9 });
    expect(entry.setup.seatOffset).toEqual({ x: 0.1, y: -0.02, z: 0.03 });
    expect(entry.setup.handlingFlags).toBe('820000');
    expect(entry.setup.subHandling).toBe('car');
    expect(entry.setup.subHandlingType).toBe('CCarHandlingData');
    expect(entry.unknownNodes.map((node) => node.name)).toContain('fCommunityExtension');
  });

  it('returns the exact source when no values changed', () => {
    const document = parseHandlingDocument(SOURCE);
    const entry = document.entries[0]!;

    expect(
      updateHandlingEntry(document, entry.id, {
        handlingName: entry.handlingName,
        values: entry.values,
        setup: entry.setup,
      }),
    ).toBe(SOURCE);
  });

  it('patches only selected scalar and vector values', () => {
    const document = parseHandlingDocument(SOURCE);
    const entry = document.entries[0]!;
    const secondEntryBefore = SOURCE.slice(
      document.entries[1]!.sourceRange.start,
      document.entries[1]!.sourceRange.end,
    );
    const updated = updateHandlingEntry(document, entry.id, {
      values: { ...entry.values, fMass: 2600 },
      setup: {
        ...entry.setup,
        centreOfMass: { ...entry.setup.centreOfMass, z: -0.35 },
      },
    });
    const reparsed = parseHandlingDocument(updated);

    expect(reparsed.entries[0]!.values.fMass).toBe(2600);
    expect(reparsed.entries[0]!.setup.centreOfMass.z).toBe(-0.35);
    expect(updated).toContain('<fMass value="2600.000000" />');
    expect(updated).toContain('z="-0.350000"');
    expect(updated).toContain('<!-- keep this file-level comment -->');
    expect(updated).toContain('<fCommunityExtension value="123.456" />');
    expect(updated).toContain('<CustomSubHandlingValue value="leave-me" />');
    const secondEntryAfter = updated.slice(
      reparsed.entries[1]!.sourceRange.start,
      reparsed.entries[1]!.sourceRange.end,
    );
    expect(secondEntryAfter).toBe(secondEntryBefore);
  });

  it('does not reject imported values merely for exceeding interaction ranges', () => {
    const document = parseHandlingDocument(SOURCE);
    const entry = document.entries[0]!;

    expect(validateHandlingEntry(document, entry.id, { values: entry.values })).toEqual([]);
    expect(entry.values.fInitialDriveForce).toBeGreaterThan(1.5);
  });

  it('rejects non-finite edits before serialization', () => {
    const document = parseHandlingDocument(SOURCE);
    const entry = document.entries[0]!;

    expect(
      validateHandlingEntry(document, entry.id, {
        values: { ...entry.values, fMass: Number.NaN },
      }),
    ).toEqual([{ field: 'fMass', message: 'Mass must be a finite number.' }]);
  });
});
