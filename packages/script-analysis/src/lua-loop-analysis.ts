const LUA_KEYWORDS = new Set([
  'and',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while',
]);

const YIELD_CALL = /\b(?:(?:Citizen\.)?Wait|Citizen\.Await|coroutine\.yield)\s*\(/;
const SHORT_WAIT_CALL = /\b(?:Citizen\.)?Wait\s*\(\s*(?:0|1)\s*\)/;
const NETWORK_CALL =
  /\b(?:Trigger(?:Latent)?ServerEvent|Trigger(?:Latent)?ClientEvent|emitNet)\s*\(/;
const FUNCTION_CALL = /\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*\(/;

export interface LuaWhileLoopAnalysis {
  startLine: number;
  endLine: number;
  condition: string;
  body: string;
  unconditional: boolean;
  hasYield: boolean;
  hasShortWait: boolean;
  hasNetworkEmission: boolean;
  hasJsonWork: boolean;
  hasDebugPrint: boolean;
  hasExit: boolean;
  mutatesCondition: boolean;
  hasRepeatedCall: boolean;
  mayRunContinuously: boolean;
}

function stripStringsAndComment(line: string): string {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let output = '';
  for (let index = 0; index < line.length; index += 1) {
    const current = line[index] ?? '';
    const next = line[index + 1] ?? '';
    if (quote) {
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === quote) quote = null;
      output += ' ';
      continue;
    }
    if (current === '-' && next === '-') break;
    if (current === '"' || current === "'") {
      quote = current;
      output += ' ';
      continue;
    }
    output += current;
  }
  return output;
}

function countMatches(line: string, pattern: RegExp): number {
  return [...line.matchAll(pattern)].length;
}

function blockDelta(line: string): number {
  const trimmed = line.trim();
  let opens = 0;
  if (/^(?:local\s+)?function\b/.test(trimmed)) opens += 1;
  if (/^if\b.*\bthen\b/.test(trimmed)) opens += 1;
  if (/^for\b.*\bdo\b/.test(trimmed)) opens += 1;
  if (/^while\b.*\bdo\b/.test(trimmed)) opens += 1;
  if (/^repeat\b/.test(trimmed)) opens += 1;
  if (/^do\b/.test(trimmed)) opens += 1;
  const closes = countMatches(trimmed, /\bend\b/g) + (/^until\b/.test(trimmed) ? 1 : 0);
  return opens - closes;
}

function findLoopEnd(lines: string[], startIndex: number): number {
  let depth = 1;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    depth += blockDelta(lines[index] ?? '');
    if (depth <= 0) return index;
  }
  return Math.min(lines.length - 1, startIndex + 119);
}

function conditionIdentifiers(condition: string): string[] {
  return [...new Set(condition.match(/[A-Za-z_]\w*/g) ?? [])].filter(
    (identifier) => !LUA_KEYWORDS.has(identifier),
  );
}

function conditionIsMutated(condition: string, body: string): boolean {
  return conditionIdentifiers(condition).some((identifier) => {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `(?:^|[;]|\\bthen\\s+|\\bdo\\s+|\\belse\\s+)\\s*${escaped}(?:\\s*(?:\\[[^\\]]+\\]|\\.[A-Za-z_]\\w*))*\\s*=`,
      'm',
    ).test(body);
  });
}

function isUnconditional(condition: string): boolean {
  const normalized = condition.replace(/[()\s]/g, '').toLowerCase();
  return normalized === 'true' || normalized === 'notfalse';
}

export function analyzeLuaWhileLoops(source: string): LuaWhileLoopAnalysis[] {
  const rawLines = source.replaceAll('\r\n', '\n').split('\n');
  const lines = rawLines.map(stripStringsAndComment);
  const loops: LuaWhileLoopAnalysis[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*while\s+(.+?)\s+do\s*$/.exec(lines[index] ?? '');
    if (!match) continue;
    const condition = (match[1] ?? '').trim();
    const endIndex = findLoopEnd(lines, index);
    const body = lines.slice(index + 1, endIndex).join('\n');
    const unconditional = isUnconditional(condition);
    const hasYield = YIELD_CALL.test(body);
    const hasShortWait = SHORT_WAIT_CALL.test(body);
    const hasNetworkEmission = NETWORK_CALL.test(body);
    const hasJsonWork = /\bjson\.(?:encode|decode)\s*\(/.test(body);
    const hasDebugPrint = /\bprint\s*\(/.test(body);
    const hasExit = /\b(?:break|return)\b/.test(body);
    const mutatesCondition = conditionIsMutated(condition, body);
    const hasRepeatedCall = FUNCTION_CALL.test(body);
    const mayRunContinuously =
      !hasYield &&
      (unconditional ||
        (!hasExit &&
          !mutatesCondition &&
          (hasRepeatedCall || hasNetworkEmission || body.trim() !== '')));

    loops.push({
      startLine: index + 1,
      endLine: endIndex + 1,
      condition,
      body,
      unconditional,
      hasYield,
      hasShortWait,
      hasNetworkEmission,
      hasJsonWork,
      hasDebugPrint,
      hasExit,
      mutatesCondition,
      hasRepeatedCall,
      mayRunContinuously,
    });
  }

  return loops;
}
