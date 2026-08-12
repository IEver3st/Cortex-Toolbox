import { describe, expect, it } from 'vitest';
import {
  CHEVRON_STORAGE_KEY,
  DEFAULT_CHEVRON_DRAFT,
  normalizeChevronDraft,
  readChevronBuilder,
  writeChevronBuilder,
} from './storage';

describe('Chevron builder storage', () => {
  it('normalizes malformed drafts without losing a usable texture configuration', () => {
    const draft = normalizeChevronDraft({
      width: 9000,
      height: 32,
      primary: '#ABCDEF',
      layout: 'diagonal-left',
      texture: {
        enabled: true,
        dataUrl: 'data:image/png;base64,texture',
        fileName: 'mesh.png',
        opacity: 120,
        scale: 3,
      },
    });
    expect(draft).toMatchObject({
      width: 4096,
      height: 128,
      primary: '#abcdef',
      layout: 'diagonal-left',
      texture: { enabled: true, fileName: 'mesh.png', opacity: 100, scale: 20 },
    });
  });

  it('round-trips the current draft and custom presets', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const draft = {
      ...DEFAULT_CHEVRON_DRAFT,
      texture: {
        enabled: true,
        dataUrl: 'data:image/png;base64,texture',
        fileName: 'microprism.png',
        opacity: 48,
        scale: 72,
      },
    };
    writeChevronBuilder(storage, {
      draft,
      presets: [{ ...draft, id: 'station-4', label: 'Station 4', savedAt: 'now' }],
    });
    expect(values.has(CHEVRON_STORAGE_KEY)).toBe(true);
    expect(readChevronBuilder(storage)).toMatchObject({
      draft: { texture: { enabled: true, opacity: 48 } },
      presets: [{ id: 'station-4', label: 'Station 4', texture: { scale: 72 } }],
    });
  });
});
