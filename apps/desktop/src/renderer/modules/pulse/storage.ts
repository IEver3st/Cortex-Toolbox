import { decimalToBinary, type SirenPattern } from '@cortex/vehicle-meta';

export const PULSE_STORAGE_KEY = 'cortex.pulse.studio.v1';
export const PULSE_CHANNEL_COUNT = 24;
export const PULSE_STEP_COUNT = 32;

const BASE_COLORS = [
  '#ff4050',
  '#2788e8',
  '#ffffff',
  '#ffb936',
  '#25df82',
  '#9b6cff',
  '#52d6dc',
  '#ff72bd',
];

const STARTER_SEQUENCERS = [
  0xf0f00000, 0x00000f0f, 0xcccc0000, 0x33330000, 0xaa550000, 0x55aa0000, 0xff000000, 0x00ff0000,
];

export interface PulsePreset {
  id: string;
  name: string;
  savedAt: string;
  pattern: SirenPattern;
}

export interface PulseStudioState {
  pattern: SirenPattern;
  glow: boolean;
  presets: PulsePreset[];
}

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const parseInteger = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;

export function createStarterPattern(): SirenPattern {
  return {
    name: 'Cortex pursuit',
    bpm: 600,
    sirenId: 254,
    colors: Array.from(
      { length: PULSE_CHANNEL_COUNT },
      (_, index) => BASE_COLORS[index % BASE_COLORS.length] ?? '#ffffff',
    ),
    channels: Array.from({ length: PULSE_CHANNEL_COUNT }, (_, index) =>
      decimalToBinary(STARTER_SEQUENCERS[index % STARTER_SEQUENCERS.length] ?? 0),
    ),
  };
}

export function normalizePulsePattern(value: unknown): SirenPattern {
  const fallback = createStarterPattern();
  const record = asRecord(value);
  if (!record) return fallback;
  const rawColors: unknown[] = Array.isArray(record.colors) ? record.colors : [];
  const rawChannels: unknown[] = Array.isArray(record.channels) ? record.channels : [];
  return {
    name:
      typeof record.name === 'string' && record.name.trim()
        ? record.name.slice(0, 80)
        : fallback.name,
    bpm: parseInteger(record.bpm, fallback.bpm),
    sirenId: parseInteger(record.sirenId, fallback.sirenId ?? 254),
    colors: Array.from({ length: PULSE_CHANNEL_COUNT }, (_, index) => {
      const color: unknown = rawColors[index];
      return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
        ? color.toLowerCase()
        : (fallback.colors[index] ?? '#ffffff');
    }),
    channels: Array.from({ length: PULSE_CHANNEL_COUNT }, (_, row) => {
      const channel: unknown = rawChannels[row];
      const fallbackChannel = fallback.channels[row] ?? decimalToBinary(0);
      return Array.from({ length: PULSE_STEP_COUNT }, (_, column) =>
        Array.isArray(channel) ? channel[column] === true : fallbackChannel[column] === true,
      );
    }),
  };
}

export function readPulseStudio(storage: StorageLike | undefined): PulseStudioState {
  const fallback: PulseStudioState = { pattern: createStarterPattern(), glow: false, presets: [] };
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(PULSE_STORAGE_KEY);
    if (!raw) return fallback;
    const record = asRecord(JSON.parse(raw));
    if (!record) return fallback;
    const presets = Array.isArray(record.presets)
      ? record.presets.flatMap((value, index): PulsePreset[] => {
          const preset = asRecord(value);
          if (!preset) return [];
          const pattern = normalizePulsePattern(preset.pattern);
          return [
            {
              id: typeof preset.id === 'string' ? preset.id : `preset-${index}`,
              name:
                typeof preset.name === 'string' && preset.name.trim()
                  ? preset.name.slice(0, 80)
                  : pattern.name,
              savedAt: typeof preset.savedAt === 'string' ? preset.savedAt : '',
              pattern,
            },
          ];
        })
      : [];
    return {
      pattern: normalizePulsePattern(record.pattern),
      glow: record.glow === true,
      presets,
    };
  } catch {
    return fallback;
  }
}

export function writePulseStudio(storage: StorageLike | undefined, state: PulseStudioState): void {
  if (!storage) return;
  try {
    storage.setItem(PULSE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore unavailable storage and quota errors. Editing and exports still work.
  }
}
