import { describe, expect, it } from 'vitest';
import { BUILTIN_PALETTE_IDS, FOUNDATION_TOKEN_KEYS } from '../../../shared/theme-schema';
import { resolveBuiltinTokens } from './builtins';

describe('built-in theme palettes', () => {
  it('provides complete and palette-specific foundation colors in both modes', () => {
    for (const mode of ['dark', 'light'] as const) {
      const signatures = BUILTIN_PALETTE_IDS.map((id) => {
        const tokens = resolveBuiltinTokens(id, mode);
        for (const key of FOUNDATION_TOKEN_KEYS) expect(tokens[key]).toMatch(/^#[0-9a-f]{6}$/);
        return [tokens.signal, tokens.canvas, tokens.surface, tokens.rail, tokens.ink].join('|');
      });
      expect(new Set(signatures).size).toBe(BUILTIN_PALETTE_IDS.length);
    }
  });
});
