import { z } from 'zod';
import { analyzeLuaWhileLoops } from './lua-loop-analysis';

export const evidenceSchema = z.object({
  sourceFile: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  extractionRule: z.string(),
  confidence: z.enum(['exact', 'heuristic']),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const scriptSymbolSchema = z.object({
  name: z.string(),
  kind: z.enum(['function', 'event', 'export', 'command', 'dependency']),
  direction: z.enum(['local', 'incoming', 'outgoing', 'public', 'dependency']),
  line: z.number().int().positive(),
  evidence: evidenceSchema,
});
export const scriptReferenceSchema = z.object({
  name: z.string(),
  kind: z.literal('function-call'),
  line: z.number().int().positive(),
  caller: z.string().nullable(),
  evidence: evidenceSchema,
});
/** Structural segment of a script, derived from ordered symbol anchors. */
export const scriptPieceSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['preamble', 'function', 'handler', 'export', 'command', 'region', 'trailing']),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  lineCount: z.number().int().positive(),
  /** Share of the file by line count, 0–1. Useful for proportional maps. */
  weight: z.number().min(0).max(1),
  summary: z.string(),
  symbols: z.array(scriptSymbolSchema),
});
export const scriptAnalysisSchema = z.object({
  relativePath: z.string(),
  language: z.enum(['lua', 'javascript', 'typescript']),
  lines: z.number().int().nonnegative(),
  symbols: z.array(scriptSymbolSchema),
  references: z.array(scriptReferenceSchema),
  pieces: z.array(scriptPieceSchema),
  warnings: z.array(z.string()),
});
export const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['file', 'function', 'event', 'export', 'command', 'dependency']),
});
export const graphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(['defines', 'emits', 'listens', 'calls', 'depends-on']),
});
export const resourceAnalysisSchema = z.object({
  generatedAt: z.string(),
  files: z.array(scriptAnalysisSchema),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  summary: z.object({
    scripts: z.number().int().nonnegative(),
    lines: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
    exports: z.number().int().nonnegative(),
    commands: z.number().int().nonnegative(),
    pieces: z.number().int().nonnegative(),
  }),
});
export type ScriptSymbol = z.infer<typeof scriptSymbolSchema>;
export type ScriptReference = z.infer<typeof scriptReferenceSchema>;
export type ScriptPiece = z.infer<typeof scriptPieceSchema>;
export type ScriptAnalysis = z.infer<typeof scriptAnalysisSchema>;
export type ResourceAnalysis = z.infer<typeof resourceAnalysisSchema>;

const patterns: {
  kind: z.infer<typeof scriptSymbolSchema>['kind'];
  direction: z.infer<typeof scriptSymbolSchema>['direction'];
  rule: string;
  expressions: RegExp[];
}[] = [
  {
    kind: 'event',
    direction: 'incoming',
    rule: 'event-registration',
    expressions: [
      /(?:RegisterNetEvent|AddEventHandler)\s*\(\s*['"]([^'"]+)['"]/,
      /on(?:Net)?\s*\(\s*['"]([^'"]+)['"]/,
      /\.on\s*\(\s*['"]([^'"]+)['"]/,
    ],
  },
  {
    kind: 'event',
    direction: 'outgoing',
    rule: 'event-emission',
    expressions: [
      /(?:TriggerServerEvent|TriggerClientEvent|TriggerEvent)\s*\(\s*['"]([^'"]+)['"]/,
      /emit(?:Net)?\s*\(\s*['"]([^'"]+)['"]/,
    ],
  },
  {
    kind: 'event',
    direction: 'incoming',
    rule: 'nui-callback',
    expressions: [/(?:RegisterNUICallback|RegisterNuiCallback)\s*\(\s*['"]([^'"]+)['"]/],
  },
  {
    kind: 'event',
    direction: 'outgoing',
    rule: 'nui-message',
    // Only extract when an action string is present on the same line.
    expressions: [
      /SendNUIMessage\s*\([^)\n]*action\s*[:=]\s*['"]([^'"]+)['"]/,
      /SendNUIMessage\s*\(\s*\{\s*action\s*[:=]\s*['"]([^'"]+)['"]/,
    ],
  },
  {
    kind: 'export',
    direction: 'public',
    rule: 'export-definition',
    expressions: [/exports\s*\(\s*['"]([^'"]+)['"]/, /exports\.([A-Za-z_$][\w$]*)\s*=/],
  },
  {
    kind: 'export',
    direction: 'public',
    rule: 'ox-lib-callback-registration',
    expressions: [/lib\.callback\.register\s*\(\s*['"]([^'"]+)['"]/],
  },
  {
    kind: 'dependency',
    direction: 'dependency',
    rule: 'ox-lib-callback-call',
    expressions: [/lib\.callback\s*\(\s*['"]([^'"]+)['"]/],
  },
  {
    kind: 'command',
    direction: 'incoming',
    rule: 'command-registration',
    expressions: [/(?:RegisterCommand|RegisterKeyMapping)\s*\(\s*['"]([^'"]+)['"]/],
  },
  {
    kind: 'dependency',
    direction: 'dependency',
    rule: 'cross-resource-export',
    expressions: [/exports\[['"]([^'"]+)['"]\]/, /exports\.([A-Za-z0-9_-]+)\s*:/],
  },
];

/** APIs whose first argument is a name; non-string args become file warnings. */
const dynamicNamePatterns: { label: string; expression: RegExp }[] = [
  {
    label: 'event/export registration',
    expression:
      /(?:RegisterNetEvent|AddEventHandler|RegisterNUICallback|RegisterNuiCallback|RegisterCommand|RegisterKeyMapping|lib\.callback\.register)\s*\(\s*(?!['"`])/,
  },
  {
    label: 'event emission',
    expression:
      /(?:TriggerServerEvent|TriggerClientEvent|TriggerEvent|emitNet|emit)\s*\(\s*(?!['"`])/,
  },
  {
    label: 'export registration',
    expression: /exports\s*\(\s*(?!['"`])/,
  },
  {
    label: 'callback invocation',
    // Avoid matching lib.callback.register (handled above).
    expression: /lib\.callback\s*\(\s*(?!['"`])/,
  },
];

/**
 * Mark source positions that are executable code. The analyzer still reads exact
 * quoted literal names from the original line, but ignores API-looking text in
 * comments and strings. This is deliberately a small lexer rather than a Lua or
 * JavaScript parser; preserving line/column shape keeps evidence deterministic.
 */
function buildCodeMasks(
  lines: string[],
  language: 'lua' | 'javascript' | 'typescript',
): boolean[][] {
  const masks: boolean[][] = [];
  let quote: "'" | '"' | '`' | null = null;
  let block: 'comment' | 'lua-string' | null = null;

  for (const line of lines) {
    const mask = Array.from({ length: line.length }, () => false);
    let escaped = false;
    for (let index = 0; index < line.length; index += 1) {
      const current = line[index] ?? '';
      const next = line[index + 1] ?? '';

      if (block === 'comment') {
        if (language === 'lua' && current === ']' && next === ']') {
          block = null;
          index += 1;
        } else if (language !== 'lua' && current === '*' && next === '/') {
          block = null;
          index += 1;
        }
        continue;
      }
      if (block === 'lua-string') {
        if (current === ']' && next === ']') {
          block = null;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === quote) quote = null;
        continue;
      }

      if (language === 'lua') {
        if (current === '-' && next === '-') {
          if (line[index + 2] === '[' && line[index + 3] === '[') {
            const close = line.indexOf(']]', index + 4);
            if (close >= 0) {
              index = close + 1;
              continue;
            }
            block = 'comment';
          }
          break;
        }
        if (current === '[' && next === '[') {
          const close = line.indexOf(']]', index + 2);
          if (close >= 0) {
            index = close + 1;
            continue;
          }
          block = 'lua-string';
          index += 1;
          continue;
        }
      } else {
        if (current === '/' && next === '/') break;
        if (current === '/' && next === '*') {
          block = 'comment';
          index += 1;
          continue;
        }
      }

      if (current === "'" || current === '"' || (language !== 'lua' && current === '`')) {
        quote = current;
        continue;
      }
      mask[index] = true;
    }
    // Single/double quoted literals cannot legally span lines in these inputs.
    // Template literals can, so retain that state only for JavaScript backticks.
    if (quote !== '`') quote = null;
    masks.push(mask);
  }
  return masks;
}

function execInCode(expression: RegExp, line: string, mask: boolean[]): RegExpExecArray | null {
  let offset = 0;
  while (offset <= line.length) {
    const match = expression.exec(line.slice(offset));
    if (!match) return null;
    const start = offset + match.index;
    if (mask[start] === true) return match;
    offset = start + Math.max(1, match[0].length);
  }
  return null;
}

function applyCodeMask(line: string, mask: boolean[]): string {
  // Index by UTF-16 code unit, matching RegExp offsets and the mask produced above.
  // Rejoining adjacent surrogate code units preserves executable Unicode exactly.
  const masked = new Array<string>(line.length);
  for (let index = 0; index < line.length; index += 1) {
    masked[index] = mask[index] === true ? (line[index] ?? '') : ' ';
  }
  return masked.join('');
}

function pieceKindForSymbols(symbols: ScriptSymbol[]): z.infer<typeof scriptPieceSchema>['kind'] {
  if (symbols.some((symbol) => symbol.kind === 'function')) return 'function';
  if (symbols.some((symbol) => symbol.kind === 'command')) return 'command';
  if (symbols.some((symbol) => symbol.kind === 'export' && symbol.direction === 'public'))
    return 'export';
  if (
    symbols.some(
      (symbol) =>
        symbol.kind === 'event' &&
        (symbol.direction === 'incoming' || symbol.direction === 'outgoing'),
    )
  )
    return 'handler';
  return 'region';
}

function pieceLabelForSymbols(symbols: ScriptSymbol[], fallback: string): string {
  const ranked = [...symbols].sort((left, right) => {
    const rank = (symbol: ScriptSymbol) => {
      if (symbol.kind === 'function') return 0;
      if (symbol.kind === 'command') return 1;
      if (symbol.kind === 'export' && symbol.direction === 'public') return 2;
      if (symbol.kind === 'event' && symbol.direction === 'incoming') return 3;
      if (symbol.kind === 'event') return 4;
      if (symbol.kind === 'export') return 5;
      return 6;
    };
    return rank(left) - rank(right);
  });
  return ranked[0]?.name ?? fallback;
}

function pieceSummary(
  kind: z.infer<typeof scriptPieceSchema>['kind'],
  symbols: ScriptSymbol[],
): string {
  if (kind === 'preamble') return 'Setup and locals before the first contract or function.';
  if (kind === 'trailing') return 'Remainder of the file after the last structural anchor.';
  const counts = new Map<string, number>();
  for (const symbol of symbols) {
    counts.set(symbol.kind, (counts.get(symbol.kind) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([kindName, count]) =>
    count === 1 ? `1 ${kindName}` : `${count} ${kindName}s`,
  );
  if (parts.length === 0) return 'No named contracts in this range.';
  return parts.join(' · ');
}

/**
 * Break a script into ordered structural pieces using symbol lines as anchors.
 * Ranges run from each anchor line to the line before the next anchor (or EOF).
 * Dynamic / multi-line bodies are not AST-parsed — end lines are structural estimates.
 */
export function buildScriptPieces(
  relativePath: string,
  totalLines: number,
  symbols: ScriptSymbol[],
): ScriptPiece[] {
  const safeLines = Math.max(totalLines, 1);
  if (symbols.length === 0) {
    return [
      scriptPieceSchema.parse({
        id: `${relativePath}:whole`,
        label: relativePath.split(/[\\/]/).at(-1) ?? relativePath,
        kind: 'region',
        startLine: 1,
        endLine: safeLines,
        lineCount: safeLines,
        weight: 1,
        summary: 'No statically named contracts found.',
        symbols: [],
      }),
    ];
  }

  const anchorLines = [...new Set(symbols.map((symbol) => symbol.line))].sort((a, b) => a - b);
  const pieces: ScriptPiece[] = [];

  const pushPiece = (
    kind: z.infer<typeof scriptPieceSchema>['kind'],
    label: string,
    startLine: number,
    endLine: number,
    pieceSymbols: ScriptSymbol[],
    idSuffix: string,
  ) => {
    if (endLine < startLine) return;
    const lineCount = endLine - startLine + 1;
    pieces.push(
      scriptPieceSchema.parse({
        id: `${relativePath}:${idSuffix}:${startLine}-${endLine}`,
        label,
        kind,
        startLine,
        endLine,
        lineCount,
        weight: lineCount / safeLines,
        summary: pieceSummary(kind, pieceSymbols),
        symbols: pieceSymbols,
      }),
    );
  };

  const firstAnchor = anchorLines[0] ?? 1;
  if (firstAnchor > 1) {
    const preambleSymbols = symbols.filter((symbol) => symbol.line < firstAnchor);
    pushPiece('preamble', 'Preamble', 1, firstAnchor - 1, preambleSymbols, 'preamble');
  }

  for (let index = 0; index < anchorLines.length; index += 1) {
    const startLine = anchorLines[index] ?? 1;
    const nextAnchor = anchorLines[index + 1];
    const endLine = nextAnchor ? nextAnchor - 1 : safeLines;
    const pieceSymbols = symbols.filter(
      (symbol) => symbol.line >= startLine && symbol.line <= endLine,
    );
    const kind = pieceKindForSymbols(pieceSymbols);
    const label = pieceLabelForSymbols(pieceSymbols, `Lines ${startLine}–${endLine}`);
    pushPiece(kind, label, startLine, endLine, pieceSymbols, kind);
  }

  return pieces;
}

export function analyzeScript(relativePath: string, source: string): ScriptAnalysis {
  const extension = relativePath.toLowerCase().split('.').at(-1);
  const language =
    extension === 'lua'
      ? 'lua'
      : extension === 'ts' || extension === 'tsx'
        ? 'typescript'
        : 'javascript';
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const codeMasks = buildCodeMasks(lines, language);
  const codeOnlySource = lines
    .map((line, lineIndex) => applyCodeMask(line, codeMasks[lineIndex] ?? []))
    .join('\n');
  const symbols: ScriptSymbol[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const seenWarnings = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const codeMask = codeMasks[index] ?? [];
    for (const group of patterns)
      for (const expression of group.expressions) {
        const match = execInCode(expression, line, codeMask);
        if (!match) continue;
        const name = match[1];
        if (!name) continue;
        const key = `${group.kind}:${group.direction}:${name}:${index + 1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        symbols.push({
          name,
          kind: group.kind,
          direction: group.direction,
          line: index + 1,
          evidence: {
            sourceFile: relativePath,
            startLine: index + 1,
            endLine: index + 1,
            extractionRule: group.rule,
            confidence: 'exact',
          },
        });
      }

    for (const dynamic of dynamicNamePatterns) {
      const match = execInCode(dynamic.expression, line, codeMask);
      if (!match) continue;
      const warning = `Unresolved dynamic ${dynamic.label} near line ${index + 1}`;
      if (seenWarnings.has(warning)) continue;
      seenWarnings.add(warning);
      warnings.push(warning);
    }

    const functionExpression =
      language === 'lua'
        ? /^\s*(?:local\s+)?function\s+([A-Za-z_][\w.:]*)/
        : /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\()/;
    const functionMatch = execInCode(functionExpression, line, codeMask);
    const functionName = functionMatch?.[1] ?? functionMatch?.[2];
    if (functionName)
      symbols.push({
        name: functionName,
        kind: 'function',
        direction: 'local',
        line: index + 1,
        evidence: {
          sourceFile: relativePath,
          startLine: index + 1,
          endLine: index + 1,
          extractionRule: 'function-definition',
          confidence: 'exact',
        },
      });
  }
  const functionDefinitions = symbols
    .filter((symbol) => symbol.kind === 'function')
    .sort((left, right) => left.line - right.line);
  const references: ScriptReference[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const codeMask = codeMasks[index] ?? [];
    for (const definition of functionDefinitions) {
      const escapedName = definition.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const call = new RegExp(`\\b${escapedName}\\s*\\(`);
      const match = execInCode(call, line, codeMask);
      if (!match || definition.line === index + 1) continue;
      const caller =
        [...functionDefinitions].reverse().find((item) => item.line < index + 1)?.name ?? null;
      references.push({
        name: definition.name,
        kind: 'function-call',
        line: index + 1,
        caller,
        evidence: {
          sourceFile: relativePath,
          startLine: index + 1,
          endLine: index + 1,
          extractionRule: 'same-file-function-call',
          confidence: 'heuristic',
        },
      });
    }
  }
  if (language === 'lua') {
    for (const loop of analyzeLuaWhileLoops(source)) {
      if (loop.mayRunContinuously) {
        warnings.push(
          loop.unconditional
            ? `Continuous loop has no visible yield near line ${loop.startLine}`
            : `Conditional loop may execute continuously without yielding near line ${loop.startLine}`,
        );
      }
      if (loop.hasNetworkEmission && !loop.hasYield) {
        warnings.push(
          `Network event is emitted from an unyielded loop near line ${loop.startLine}`,
        );
      }
    }
  }
  if (/\bsetInterval\s*\([^,]+,\s*(?:0|1|5|10)\s*\)/s.test(codeOnlySource)) {
    warnings.push('Very short setInterval detected; verify that this work must run continuously.');
  }
  if (
    /\b(?:setTick|Wait\s*\(\s*0\s*\))/.test(codeOnlySource) &&
    /\bGetGamePool\s*\(/.test(codeOnlySource)
  ) {
    warnings.push('Broad entity enumeration appears in a frame-sensitive path.');
  }
  if (source.length > 1_000_000)
    warnings.push('Large script; only deterministic symbol extraction was performed.');
  if (
    /RegisterNetEvent|onNet\s*\(/.test(codeOnlySource) &&
    !/type\s*\(|typeof\s+|z\.object|validate/i.test(codeOnlySource)
  )
    warnings.push(
      'Network handlers were found; manually verify server-side payload validation and authorization.',
    );
  const pieces = buildScriptPieces(relativePath, lines.length, symbols);
  return scriptAnalysisSchema.parse({
    relativePath,
    language,
    lines: lines.length,
    symbols,
    references,
    pieces,
    warnings,
  });
}

export function buildResourceAnalysis(
  files: ScriptAnalysis[],
  generatedAt = new Date(),
): ResourceAnalysis {
  const nodes = new Map<string, z.infer<typeof graphNodeSchema>>();
  const edges: z.infer<typeof graphEdgeSchema>[] = [];
  const addNode = (node: z.infer<typeof graphNodeSchema>) => nodes.set(node.id, node);
  for (const file of files) {
    const fileId = `file:${file.relativePath}`;
    addNode({ id: fileId, label: file.relativePath, kind: 'file' });
    for (const symbol of file.symbols) {
      const nodeId =
        symbol.kind === 'function'
          ? `function:${file.relativePath}:${symbol.name}`
          : symbol.kind === 'command'
            ? `command:${symbol.name}`
            : `${symbol.kind}:${symbol.name}`;
      addNode({ id: nodeId, label: symbol.name, kind: symbol.kind });
      const kind =
        symbol.direction === 'incoming'
          ? 'listens'
          : symbol.direction === 'outgoing'
            ? 'emits'
            : symbol.kind === 'dependency'
              ? 'depends-on'
              : 'defines';
      edges.push({ from: fileId, to: nodeId, kind });
    }
    for (const reference of file.references) {
      const target = `function:${file.relativePath}:${reference.name}`;
      const caller = reference.caller
        ? `function:${file.relativePath}:${reference.caller}`
        : fileId;
      if (nodes.has(target)) edges.push({ from: caller, to: target, kind: 'calls' });
    }
  }
  const symbols = files.flatMap((file) => file.symbols);
  return resourceAnalysisSchema.parse({
    generatedAt: generatedAt.toISOString(),
    files,
    nodes: [...nodes.values()],
    edges,
    summary: {
      scripts: files.length,
      lines: files.reduce((sum, file) => sum + file.lines, 0),
      events: symbols.filter((symbol) => symbol.kind === 'event').length,
      exports: symbols.filter((symbol) => symbol.kind === 'export').length,
      commands: symbols.filter((symbol) => symbol.kind === 'command').length,
      pieces: files.reduce((sum, file) => sum + file.pieces.length, 0),
    },
  });
}

export function analysisMarkdown(analysis: ResourceAnalysis): string {
  const rows = analysis.files.flatMap((file) =>
    file.symbols.map(
      (symbol) =>
        `| ${symbol.kind} | \`${symbol.name.replaceAll('|', '\\|')}\` | \`${file.relativePath}:${symbol.line}\` | ${symbol.direction} |`,
    ),
  );
  return [
    '# Cortex Script Evidence',
    '',
    `Generated: ${analysis.generatedAt}`,
    '',
    `Scripts: ${analysis.summary.scripts} · Lines: ${analysis.summary.lines} · Events: ${analysis.summary.events} · Exports: ${analysis.summary.exports} · Commands: ${analysis.summary.commands} · Pieces: ${analysis.summary.pieces}`,
    '',
    '| Kind | Symbol | Evidence | Direction |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## Structure',
    '',
    ...analysis.files.flatMap((file) => [
      `### \`${file.relativePath}\``,
      '',
      ...file.pieces.map(
        (piece) =>
          `- **${piece.label}** (${piece.kind}) · L${piece.startLine}–${piece.endLine} · ${piece.summary}`,
      ),
      ...file.references.map(
        (reference) =>
          `- **${reference.caller ?? file.relativePath}** calls **${reference.name}** at L${reference.line}`,
      ),
      '',
    ]),
    '## Coverage',
    '',
    '**Extracted (static string literals only):**',
    '- Net/local event registration and emission (`RegisterNetEvent`, `AddEventHandler`, `Trigger*Event`, `on`/`emit`)',
    '- NUI callback registration (`RegisterNUICallback` / `RegisterNuiCallback`)',
    '- NUI messages when `action` is a same-line string (`SendNUIMessage`)',
    '- Export definitions and cross-resource export references',
    '- ox_lib callbacks (`lib.callback.register`, `lib.callback`)',
    '- Command / key-mapping registration',
    '- Local function definitions',
    '',
    '**Not extracted:**',
    '- Dynamic names (variables or expressions) — recorded as per-file warnings, not symbols',
    '- Runtime / executed behavior (no script execution)',
    '- Multi-line table fields for `SendNUIMessage` when `action` is not on the same line',
    '- Full dependency graphs beyond literal event/export/callback edges',
    '',
    '> Static extraction only. Dynamic names and runtime behavior require manual review.',
    '',
  ].join('\n');
}

export {
  PROBE_RULE_META,
  PROBE_RULE_SET_VERSION,
  buildProbeFindings,
  buildProbeHotspots,
  countDynamicReferences,
  probeFindingFingerprint,
  probeFindingSchema,
  probeOverallState,
  ruleMeta as probeRuleMeta,
  type BuildProbeFindingsOptions,
  type ProbeCategory,
  type ProbeConfidence,
  type ProbeFinding,
  type ProbeHotspot,
  type ProbeRuleMeta,
  type ProbeSeverity,
  type ProbeWireLink,
} from './probe-findings';
