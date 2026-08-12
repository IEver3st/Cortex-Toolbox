import type { InterfaceContrast } from '../../../shared/theme-schema';

export type ContrastRating = 'AAA' | 'AA' | 'AA Large' | 'Fail' | 'Advisory';

export interface ContrastResult {
  ratio: number;
  rating: ContrastRating;
  passes: boolean;
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized.slice(0, 6);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = luminance(foreground);
  const bg = luminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function rateContrast(ratio: number, largeText = false): ContrastResult {
  if (ratio >= 7) return { ratio, rating: 'AAA', passes: true };
  if (ratio >= 4.5) return { ratio, rating: largeText ? 'AAA' : 'AA', passes: true };
  if (ratio >= 3 && largeText) return { ratio, rating: 'AA Large', passes: true };
  if (ratio >= 3) return { ratio, rating: 'Advisory', passes: false };
  return { ratio, rating: 'Fail', passes: false };
}

export function formatContrast(result: ContrastResult): string {
  if (result.rating === 'Advisory') return `${result.ratio.toFixed(1)}:1 · Advisory`;
  if (result.rating === 'Fail') return `${result.ratio.toFixed(1)}:1 · Fail`;
  return `${result.ratio.toFixed(1)}:1 · ${result.rating}`;
}

function mixHex(base: string, target: string, amount: number): string {
  const parse = (hex: string) => {
    const value = hex.replace('#', '').slice(0, 6);
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    ] as const;
  };
  const [br, bg, bb] = parse(base);
  const [tr, tg, tb] = parse(target);
  const mix = (from: number, to: number) =>
    Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${mix(br, tr)}${mix(bg, tg)}${mix(bb, tb)}`;
}

export function applyContrastProtection(
  ink: string,
  mutedInk: string,
  background: string,
  enabled: boolean,
): { ink: string; mutedInk: string } {
  if (!enabled) return { ink, mutedInk };
  let nextInk = ink;
  let nextMuted = mutedInk;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inkRatio = contrastRatio(nextInk, background);
    const mutedRatio = contrastRatio(nextMuted, background);
    if (inkRatio >= 4.5 && mutedRatio >= 4.5) break;
    const target = inkRatio < mutedRatio ? '#ffffff' : '#000000';
    if (inkRatio < 4.5) nextInk = mixHex(nextInk, target, 0.12);
    if (mutedRatio < 4.5) nextMuted = mixHex(nextMuted, target, 0.12);
  }
  return { ink: nextInk, mutedInk: nextMuted };
}

export function applyInterfaceContrast(
  tokens: { ink: string; mutedInk: string; outline: string },
  level: InterfaceContrast,
  fine: number,
): { ink: string; mutedInk: string; outline: string } {
  const fineAmount = fine / 100;
  const amountByLevel: Record<InterfaceContrast, number> = {
    soft: -0.08,
    balanced: 0,
    crisp: 0.1,
    maximum: 0.18,
  };
  const amount = amountByLevel[level] + fineAmount;
  if (amount === 0) return tokens;
  const inkTarget = amount > 0 ? '#ffffff' : '#000000';
  const outlineTarget = amount > 0 ? '#ffffff' : '#000000';
  const strength = Math.min(0.28, Math.abs(amount));
  return {
    ink: mixHex(tokens.ink, inkTarget, amount > 0 ? strength : strength * 0.7),
    mutedInk: mixHex(tokens.mutedInk, inkTarget, amount > 0 ? strength * 0.85 : strength * 0.55),
    outline: mixHex(tokens.outline, outlineTarget, strength * 0.65),
  };
}
