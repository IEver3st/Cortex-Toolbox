import { describe, expect, it } from 'vitest';
import {
  PULSE_CHANNEL_COUNT,
  PULSE_STEP_COUNT,
  PULSE_STORAGE_KEY,
  createEmptyPattern,
  createStarterPattern,
  normalizePulsePattern,
  readPulseStudio,
  writePulseStudio,
} from './storage';

describe('Pulse studio storage', () => {
  it('creates a complete 24-channel, 32-step pattern', () => {
    const pattern = createStarterPattern();
    expect(pattern.channels).toHaveLength(PULSE_CHANNEL_COUNT);
    expect(pattern.channels.every((channel) => channel.length === PULSE_STEP_COUNT)).toBe(true);
    expect(pattern.colors).toHaveLength(PULSE_CHANNEL_COUNT);
  });

  it('clears every sequencer cell while preserving pattern metadata', () => {
    const pattern = createStarterPattern();
    const cleared = createEmptyPattern(pattern);

    expect(cleared).toMatchObject({
      name: pattern.name,
      bpm: pattern.bpm,
      sirenId: pattern.sirenId,
      colors: pattern.colors,
    });
    expect(cleared.channels).toHaveLength(PULSE_CHANNEL_COUNT);
    expect(cleared.channels.every((channel) => channel.every((active) => !active))).toBe(true);
  });

  it('pads legacy patterns and keeps stored numeric values', () => {
    const pattern = normalizePulsePattern({
      name: 'Legacy',
      bpm: 9_999,
      sirenId: -2,
      colors: ['#ABCDEF'],
      channels: [[true, false]],
    });
    expect(pattern).toMatchObject({ name: 'Legacy', bpm: 9_999, sirenId: -2 });
    expect(pattern.colors[0]).toBe('#abcdef');
    expect(pattern.channels).toHaveLength(24);
    expect(pattern.channels[0]?.slice(0, 2)).toEqual([true, false]);
  });

  it('round-trips the draft, glow preference, and presets', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const pattern = createStarterPattern();
    writePulseStudio(storage, {
      pattern,
      glow: true,
      presets: [{ id: 'one', name: 'Pack baseline', savedAt: 'now', pattern }],
    });
    expect(values.has(PULSE_STORAGE_KEY)).toBe(true);
    expect(readPulseStudio(storage)).toMatchObject({
      glow: true,
      presets: [{ id: 'one', name: 'Pack baseline' }],
    });
  });
});
