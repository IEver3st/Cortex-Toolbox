export const CHEVRON_STORAGE_KEY = 'cortex.chevron.builder.v1';

export type ChevronLayout = 'v' | 'diagonal-right' | 'diagonal-left';
export type Finish = 'vinyl' | 'retroreflective' | 'microprismatic';

export interface ChevronTexture {
  enabled: boolean;
  dataUrl: string;
  fileName: string;
  opacity: number;
  scale: number;
}

export interface ChevronDraft {
  width: number;
  height: number;
  primary: string;
  secondary: string;
  stripe: number;
  angle: number;
  layout: ChevronLayout;
  seam: boolean;
  text: string;
  textPosition: 'upper' | 'center' | 'lower';
  finish: Finish;
  reflectivePrimary: boolean;
  reflectiveSecondary: boolean;
  texture: ChevronTexture;
}

export interface SavedChevronPreset extends ChevronDraft {
  id: string;
  label: string;
  savedAt: string;
}

export interface ChevronBuilderState {
  draft: ChevronDraft;
  presets: SavedChevronPreset[];
}

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const DEFAULT_CHEVRON_DRAFT: ChevronDraft = {
  width: 800,
  height: 500,
  primary: '#d8493e',
  secondary: '#f7c947',
  stripe: 42,
  angle: 45,
  layout: 'v',
  seam: false,
  text: 'STAY BACK 500 FT',
  textPosition: 'center',
  finish: 'microprismatic',
  reflectivePrimary: true,
  reflectiveSecondary: true,
  texture: { enabled: false, dataUrl: '', fileName: '', opacity: 36, scale: 100 },
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const clamp = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

function normalizeTexture(value: unknown): ChevronTexture {
  const record = asRecord(value);
  const fallback = DEFAULT_CHEVRON_DRAFT.texture;
  const dataUrl =
    typeof record?.dataUrl === 'string' && record.dataUrl.startsWith('data:image/')
      ? record.dataUrl.slice(0, 1_400_000)
      : '';
  return {
    enabled: record?.enabled === true && Boolean(dataUrl),
    dataUrl,
    fileName:
      typeof record?.fileName === 'string' && record.fileName.trim()
        ? record.fileName.slice(0, 120)
        : '',
    opacity: clamp(record?.opacity, fallback.opacity, 0, 100),
    scale: clamp(record?.scale, fallback.scale, 20, 240),
  };
}

export function normalizeChevronDraft(value: unknown): ChevronDraft {
  const record = asRecord(value);
  const fallback = DEFAULT_CHEVRON_DRAFT;
  const hex = (candidate: unknown, alternative: string) =>
    typeof candidate === 'string' && /^#[0-9a-f]{6}$/i.test(candidate)
      ? candidate.toLowerCase()
      : alternative;
  const layout = record?.layout;
  const finish = record?.finish;
  const textPosition = record?.textPosition;
  return {
    width: clamp(record?.width, fallback.width, 128, 4096),
    height: clamp(record?.height, fallback.height, 128, 4096),
    primary: hex(record?.primary, fallback.primary),
    secondary: hex(record?.secondary, fallback.secondary),
    stripe: clamp(record?.stripe, fallback.stripe, 8, 160),
    angle: clamp(record?.angle, fallback.angle, 15, 75),
    layout:
      layout === 'v' || layout === 'diagonal-right' || layout === 'diagonal-left'
        ? layout
        : fallback.layout,
    seam: record?.seam === true,
    text: typeof record?.text === 'string' ? record.text.slice(0, 42) : fallback.text,
    textPosition:
      textPosition === 'upper' || textPosition === 'center' || textPosition === 'lower'
        ? textPosition
        : fallback.textPosition,
    finish:
      finish === 'vinyl' || finish === 'retroreflective' || finish === 'microprismatic'
        ? finish
        : fallback.finish,
    reflectivePrimary: record?.reflectivePrimary !== false,
    reflectiveSecondary: record?.reflectiveSecondary !== false,
    texture: normalizeTexture(record?.texture),
  };
}

export function readChevronBuilder(storage: StorageLike | undefined): ChevronBuilderState {
  const fallback: ChevronBuilderState = { draft: DEFAULT_CHEVRON_DRAFT, presets: [] };
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(CHEVRON_STORAGE_KEY);
    if (!raw) return fallback;
    const record = asRecord(JSON.parse(raw));
    if (!record) return fallback;
    const presets = Array.isArray(record.presets)
      ? record.presets.flatMap((value, index): SavedChevronPreset[] => {
          const preset = asRecord(value);
          if (!preset) return [];
          const draft = normalizeChevronDraft(preset);
          return [
            {
              ...draft,
              id: typeof preset.id === 'string' ? preset.id.slice(0, 120) : `preset-${index}`,
              label:
                typeof preset.label === 'string' && preset.label.trim()
                  ? preset.label.trim().slice(0, 80)
                  : `Custom preset ${index + 1}`,
              savedAt: typeof preset.savedAt === 'string' ? preset.savedAt.slice(0, 64) : '',
            },
          ];
        })
      : [];
    return { draft: normalizeChevronDraft(record.draft), presets: presets.slice(0, 24) };
  } catch {
    return fallback;
  }
}

export function writeChevronBuilder(
  storage: StorageLike | undefined,
  state: ChevronBuilderState,
): void {
  if (!storage) return;
  try {
    storage.setItem(CHEVRON_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the builder usable when browser storage is unavailable or full.
  }
}
