import { describe, expect, it } from 'vitest';
import { DEFAULT_HANDLING_SETUP, HANDLING_PRESETS } from '@cortex/vehicle-meta';
import type { AiChangeProposal } from '@cortex/ai';
import { applyAiHandlingPatch } from './chassis-utils';

const DEFAULT_HANDLING = HANDLING_PRESETS.street.values;

function proposal(values: Record<string, number>): AiChangeProposal {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Improve stability',
    summary: 'Coherent stability adjustment.',
    createdAt: '2026-08-08T00:00:00.000Z',
    status: 'proposed',
    files: [],
    handlingPatch: {
      relativePath: 'data/handling.meta',
      handlingName: 'GSDGATOR',
      values,
    },
  };
}

describe('Chassis live AI handling proposals', () => {
  it('updates scalar and vector editor values while attributing only AI fields', () => {
    const result = applyAiHandlingPatch({
      proposal: proposal({ fAntiRollBarForce: 0.58, 'centreOfMass.z': -0.35 }),
      activePath: 'data\\handling.meta',
      handlingName: 'gsdgator',
      handling: DEFAULT_HANDLING,
      setup: DEFAULT_HANDLING_SETUP,
    });
    expect(result?.handling.fAntiRollBarForce).toBe(0.58);
    expect(result?.setup.centreOfMass.z).toBe(-0.35);
    expect(result ? [...result.attributed] : []).toEqual(['fAntiRollBarForce', 'centreOfMass.z']);
    expect(DEFAULT_HANDLING_SETUP.centreOfMass.z).not.toBe(-0.35);
  });

  it('rejects stale entry identity, non-finite values, and unknown fields', () => {
    const base = {
      activePath: 'data/handling.meta',
      handlingName: 'GSDGATOR',
      handling: DEFAULT_HANDLING,
      setup: DEFAULT_HANDLING_SETUP,
    };
    expect(applyAiHandlingPatch({ ...base, proposal: proposal({ fMass: Number.NaN }) })).toBeNull();
    expect(applyAiHandlingPatch({ ...base, proposal: proposal({ madeUp: 1 }) })).toBeNull();
    expect(
      applyAiHandlingPatch({
        ...base,
        handlingName: 'SECOND_CAR',
        proposal: proposal({ fMass: 1_500 }),
      }),
    ).toBeNull();
  });
});
