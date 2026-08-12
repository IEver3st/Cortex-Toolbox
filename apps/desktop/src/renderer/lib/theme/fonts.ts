export interface FontOption {
  id: string;
  label: string;
  family: string;
  kind: 'interface' | 'code' | 'both';
  bundled: boolean;
}

export const INTERFACE_FONTS = [
  {
    id: 'aptos',
    label: 'Aptos',
    family: "'Aptos', 'Segoe UI Variable Text', 'Segoe UI', sans-serif",
    kind: 'interface',
    bundled: false,
  },
  {
    id: 'segoe',
    label: 'Segoe UI',
    family: "'Segoe UI Variable Text', 'Segoe UI', sans-serif",
    kind: 'interface',
    bundled: false,
  },
  {
    id: 'bahnschrift',
    label: 'Bahnschrift',
    family: "'Bahnschrift', 'Segoe UI Variable Display', sans-serif",
    kind: 'interface',
    bundled: false,
  },
  {
    id: 'cascadia-ui',
    label: 'Cascadia UI',
    family: "'Cascadia UI', 'Segoe UI Variable Text', sans-serif",
    kind: 'interface',
    bundled: false,
  },
] as const satisfies readonly FontOption[];

export const CODE_FONTS = [
  {
    id: 'cascadia-code',
    label: 'Cascadia Code',
    family: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    kind: 'code',
    bundled: false,
  },
  {
    id: 'consolas',
    label: 'Consolas',
    family: "Consolas, 'Cascadia Mono', monospace",
    kind: 'code',
    bundled: false,
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: "'JetBrains Mono', Consolas, monospace",
    kind: 'code',
    bundled: false,
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    family: "'Fira Code', Consolas, monospace",
    kind: 'code',
    bundled: false,
  },
] as const satisfies readonly FontOption[];

const FONT_BY_ID: ReadonlyMap<string, FontOption> = new Map(
  [...INTERFACE_FONTS, ...CODE_FONTS].map((font) => [font.id, font] as const),
);

export function resolveInterfaceFont(id: string): FontOption {
  return FONT_BY_ID.get(id) ?? INTERFACE_FONTS[0];
}

export function resolveCodeFont(id: string): FontOption {
  const font = FONT_BY_ID.get(id);
  if (font?.kind === 'code' || font?.kind === 'both') return font;
  return CODE_FONTS[0];
}

export function isAllowedFontId(id: string, kind: 'interface' | 'code'): boolean {
  const font = FONT_BY_ID.get(id);
  if (!font) return false;
  return font.kind === kind || font.kind === 'both';
}

function isFontFamilyAvailable(family: string, fallback: 'sans-serif' | 'monospace'): boolean {
  if (typeof document === 'undefined') return true;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return true;

  const probe = 'mmmmmmmmmmlli';
  const size = '72px';

  context.font = `${size} ${fallback}`;
  const fallbackWidth = context.measureText(probe).width;

  context.font = `${size} "${family}", ${fallback}`;
  const candidateWidth = context.measureText(probe).width;

  return fallbackWidth !== candidateWidth;
}

export async function detectAvailableFonts(fonts: FontOption[]): Promise<Map<string, boolean>> {
  const availability = new Map<string, boolean>();
  if (typeof document === 'undefined') {
    for (const font of fonts) availability.set(font.id, true);
    return availability;
  }

  if ('fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // FontFaceSet may be unavailable in some test environments.
    }
  }

  for (const font of fonts) {
    if (font.bundled) {
      availability.set(font.id, true);
      continue;
    }

    const primary = font.family.split(',')[0]?.replace(/['"]/g, '').trim() ?? font.label;
    const fallback = font.kind === 'code' ? 'monospace' : 'sans-serif';
    availability.set(font.id, isFontFamilyAvailable(primary, fallback));
  }

  return availability;
}
