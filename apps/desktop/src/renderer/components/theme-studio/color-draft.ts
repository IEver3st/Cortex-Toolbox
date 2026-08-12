import { normalizeHexColor } from '../../../shared/theme-schema';

export function finalizeColorDraft(
  input: string,
  fallback: string,
): { value: string; shouldCommit: boolean } {
  const normalized = normalizeHexColor(input);
  return normalized
    ? { value: normalized, shouldCommit: true }
    : { value: fallback, shouldCommit: false };
}
