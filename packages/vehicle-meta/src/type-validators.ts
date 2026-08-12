/**
 * Strict, reusable type validators for metadata values.
 * Never use JavaScript coercion that accepts a valid prefix and ignores junk.
 */

export interface ValidateOk {
  ok: true;
  value: unknown;
}
export interface ValidateErr {
  ok: false;
  reason: string;
  title: string;
}
export type ValidateResult = ValidateOk | ValidateErr;

const FLOAT_GRAMMAR = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const INT_GRAMMAR = /^[+-]?\d+$/;
const UINT_GRAMMAR = /^\+?\d+$/;
const HEX_GRAMMAR = /^0x[0-9a-fA-F]+$/;

export function validateFiniteFloat(raw: string): ValidateResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'empty', title: 'Empty numeric value' };
  }
  if (/^nan$/i.test(trimmed)) {
    return { ok: false, reason: 'NaN is not a finite number', title: 'Non-finite numeric value' };
  }
  if (/^[+-]?inf(inity)?$/i.test(trimmed)) {
    return {
      ok: false,
      reason: 'Infinity is not a finite number',
      title: 'Non-finite numeric value',
    };
  }
  if (!FLOAT_GRAMMAR.test(trimmed)) {
    return {
      ok: false,
      reason: `"${raw}" is not a finite float (entire value must match numeric grammar)`,
      title: 'Invalid numeric value',
    };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, reason: 'not finite', title: 'Non-finite numeric value' };
  }
  return { ok: true, value };
}

export function validateInteger(raw: string): ValidateResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'empty', title: 'Empty integer value' };
  }
  // Reject floats and letter-O confusions (30O0) via full-string integer grammar
  if (!INT_GRAMMAR.test(trimmed)) {
    return {
      ok: false,
      reason: `"${raw}" is not an integer (entire value must be digits with optional sign)`,
      title: 'Invalid integer value',
    };
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    return { ok: false, reason: 'not a safe integer', title: 'Invalid integer value' };
  }
  return { ok: true, value };
}

export function validateUnsignedInteger(raw: string): ValidateResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'empty', title: 'Empty unsigned integer value' };
  }
  if (!UINT_GRAMMAR.test(trimmed)) {
    // Distinguish negative vs non-numeric
    if (INT_GRAMMAR.test(trimmed) && Number(trimmed) < 0) {
      return {
        ok: false,
        reason: `"${raw}" is negative; an unsigned integer is required`,
        title: 'Numeric value out of range',
      };
    }
    return {
      ok: false,
      reason: `"${raw}" is not an unsigned integer`,
      title: 'Invalid integer value',
    };
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 0) {
    return { ok: false, reason: 'not a non-negative integer', title: 'Invalid integer value' };
  }
  return { ok: true, value };
}

export function validateBoolean(raw: string): ValidateResult {
  if (raw === 'true' || raw === 'false') return { ok: true, value: raw === 'true' };
  return {
    ok: false,
    reason: `Expected "true" or "false", but received "${raw}"`,
    title: 'Invalid boolean value',
  };
}

export function validateHex(raw: string): ValidateResult {
  const trimmed = raw.trim();
  if (!HEX_GRAMMAR.test(trimmed)) {
    return {
      ok: false,
      reason: `"${raw}" is not a valid hexadecimal value (expected 0x followed by hex digits)`,
      title: 'Invalid hexadecimal value',
    };
  }
  return { ok: true, value: trimmed };
}

export function validateNonEmptyString(raw: string): ValidateResult {
  if (raw.trim() === '') {
    return {
      ok: false,
      reason: 'A non-empty value is required',
      title: 'Empty required value',
    };
  }
  return { ok: true, value: raw };
}

export function validateEnum(raw: string, allowed: readonly string[]): ValidateResult {
  if (allowed.includes(raw)) return { ok: true, value: raw };
  return {
    ok: false,
    reason: `"${raw}" is not in the allowed set`,
    title: 'Invalid enum value',
  };
}

export function validateSpaceSeparatedArray(
  raw: string,
  itemType: 'float' | 'int' | 'string',
  cardinality?: number | { min?: number; max?: number },
): ValidateResult {
  const parts = raw.trim() === '' ? [] : raw.trim().split(/\s+/);
  if (typeof cardinality === 'number' && parts.length !== cardinality) {
    return {
      ok: false,
      reason: `Expected ${cardinality} items, found ${parts.length}`,
      title: 'Wrong array item count',
    };
  }
  if (cardinality && typeof cardinality === 'object') {
    if (cardinality.min !== undefined && parts.length < cardinality.min) {
      return {
        ok: false,
        reason: `Expected at least ${cardinality.min} items, found ${parts.length}`,
        title: 'Wrong array item count',
      };
    }
    if (cardinality.max !== undefined && parts.length > cardinality.max) {
      return {
        ok: false,
        reason: `Expected at most ${cardinality.max} items, found ${parts.length}`,
        title: 'Wrong array item count',
      };
    }
  }
  for (const part of parts) {
    if (itemType === 'float') {
      const r = validateFiniteFloat(part);
      if (!r.ok) {
        return {
          ok: false,
          reason: `Array item "${part}" is not a finite float`,
          title: 'Invalid array item',
        };
      }
    } else if (itemType === 'int') {
      const r = validateInteger(part);
      if (!r.ok) {
        return {
          ok: false,
          reason: `Array item "${part}" is not an integer`,
          title: 'Invalid array item',
        };
      }
    }
  }
  return { ok: true, value: parts };
}

export function checkRange(
  value: number,
  range: {
    min?: number;
    max?: number;
    exclusiveMin?: number;
    exclusiveMax?: number;
    positive?: boolean;
    nonNegative?: boolean;
  },
): ValidateResult {
  if (range.positive && !(value > 0)) {
    return {
      ok: false,
      reason: `must be greater than zero (received ${value})`,
      title: 'Numeric value out of range',
    };
  }
  if (range.nonNegative && value < 0) {
    return {
      ok: false,
      reason: `must be greater than or equal to zero (received ${value})`,
      title: 'Numeric value out of range',
    };
  }
  if (range.exclusiveMin !== undefined && !(value > range.exclusiveMin)) {
    return {
      ok: false,
      reason: `must be greater than ${range.exclusiveMin} (received ${value})`,
      title: 'Numeric value out of range',
    };
  }
  if (range.exclusiveMax !== undefined && !(value < range.exclusiveMax)) {
    return {
      ok: false,
      reason: `must be less than ${range.exclusiveMax} (received ${value})`,
      title: 'Numeric value out of range',
    };
  }
  if (range.min !== undefined && value < range.min) {
    return {
      ok: false,
      reason: `is below the supported minimum of ${range.min} (received ${value})`,
      title: 'Numeric value out of range',
    };
  }
  if (range.max !== undefined && value > range.max) {
    return {
      ok: false,
      reason: `is above the supported maximum of ${range.max} (received ${value})`,
      title: 'Numeric value out of range',
    };
  }
  return { ok: true, value };
}

/**
 * Token-aware edit distance: splits on _ and scores token sequences,
 * falling back to Damerau-Levenshtein on the full string.
 */
export function tokenAwareDistance(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a === b) return 0;
  const aTokens = a.split(/_+/).filter(Boolean);
  const bTokens = b.split(/_+/).filter(Boolean);
  const full = levenshtein(a, b);
  if (aTokens.length <= 1 || bTokens.length <= 1) return full;
  // Token multiset distance + join residual
  let tokenCost = Math.abs(aTokens.length - bTokens.length);
  const used = new Set<number>();
  for (const token of aTokens) {
    let best = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < bTokens.length; i += 1) {
      if (used.has(i)) continue;
      const d = levenshtein(token, bTokens[i]!);
      if (d < best) {
        best = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      tokenCost += best;
    } else {
      tokenCost += token.length;
    }
  }
  return Math.min(full, tokenCost);
}

function levenshtein(left: string, right: string): number {
  const a = left;
  const b = right;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
  for (let i = 0; i < rows; i += 1) grid[i]![0] = i;
  for (let j = 0; j < cols; j += 1) grid[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i]![j] = Math.min(
        (grid[i - 1]![j] ?? 0) + 1,
        (grid[i]![j - 1] ?? 0) + 1,
        (grid[i - 1]![j - 1] ?? 0) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        grid[i]![j] = Math.min(grid[i]![j]!, (grid[i - 2]![j - 2] ?? 0) + 1);
      }
    }
  }
  return grid[a.length]![b.length]!;
}

/** Conservative enum near-match using token-aware distance. */
export function enumNearMatch(target: string, allowed: readonly string[]): string | null {
  if (allowed.includes(target)) return target;
  const insensitive = allowed.find((item) => item.toLowerCase() === target.toLowerCase());
  if (insensitive) return insensitive;

  const scored = allowed
    .map((candidate) => ({
      candidate,
      distance: tokenAwareDistance(target, candidate),
    }))
    .filter((entry) => {
      const maxLen = Math.max(target.length, entry.candidate.length);
      if (entry.distance <= 2) return true;
      if (maxLen >= 12 && entry.distance <= 3) return true;
      // Token-aware: single token typo in long identifiers
      if (target.includes('_') && entry.distance <= 2) return true;
      return false;
    })
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate));

  if (scored.length === 0) return null;
  const best = scored[0]!;
  if (scored.length > 1 && scored[1]!.distance === best.distance) return null;
  return best.candidate;
}
