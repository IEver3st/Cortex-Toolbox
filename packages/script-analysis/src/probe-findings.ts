import { z } from 'zod';
import { analyzeLuaWhileLoops } from './lua-loop-analysis';

interface ProbeScriptSymbol {
  name: string;
  kind: 'function' | 'event' | 'export' | 'command' | 'dependency';
  direction: 'local' | 'incoming' | 'outgoing' | 'public' | 'dependency';
  line: number;
}

interface ProbeScriptPiece {
  kind: string;
  label: string;
  startLine: number;
  endLine: number;
  lineCount: number;
}

interface ProbeScriptAnalysis {
  relativePath: string;
  symbols: ProbeScriptSymbol[];
  references: { name: string }[];
  pieces: ProbeScriptPiece[];
  warnings: string[];
}

interface ProbeResourceAnalysis {
  files: ProbeScriptAnalysis[];
  edges: { from: string; to: string; kind: string }[];
}

export const probeSeveritySchema = z.enum(['high', 'medium', 'low', 'info']);
export const probeCategorySchema = z.enum([
  'performance',
  'event-safety',
  'reliability',
  'unused',
  'maintainability',
  'manual-review',
]);
export const probeConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const probeWireLinkSchema = z.object({
  symbolKind: z.enum(['event', 'export', 'command', 'function']),
  symbolName: z.string(),
});

export const probeFindingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  severity: probeSeveritySchema,
  category: probeCategorySchema,
  confidence: probeConfidenceSchema,
  title: z.string(),
  explanation: z.string(),
  impact: z.string(),
  remediation: z.string(),
  file: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  evidence: z.array(z.string()),
  inferred: z.boolean().optional(),
  wireLink: probeWireLinkSchema.optional(),
});

export type ProbeSeverity = z.infer<typeof probeSeveritySchema>;
export type ProbeCategory = z.infer<typeof probeCategorySchema>;
export type ProbeConfidence = z.infer<typeof probeConfidenceSchema>;
export type ProbeWireLink = z.infer<typeof probeWireLinkSchema>;
export type ProbeFinding = z.infer<typeof probeFindingSchema>;

export interface ProbeRuleMeta {
  title: string;
  category: ProbeCategory;
  impact: string;
}

export const PROBE_RULE_META: Record<string, ProbeRuleMeta> = {
  'probe/performance/busy-loop-no-yield': {
    title: 'Busy loop may run continuously',
    category: 'performance',
    impact:
      'A tight loop without a guaranteed yield can consume scheduler time and raise frame or tick cost.',
  },
  'probe/performance/network-in-loop': {
    title: 'Network traffic inside a perpetual loop',
    category: 'performance',
    impact: 'Repeated emissions from a hot loop can flood the network and amplify server load.',
  },
  'probe/performance/short-interval': {
    title: 'Very short timer interval',
    category: 'performance',
    impact:
      'Sub-100ms intervals often behave like polling and may be cheaper as an event-driven flow.',
  },
  'probe/performance/entity-enum-hot-path': {
    title: 'Broad entity enumeration in a hot path',
    category: 'performance',
    impact: 'Enumerating large pools every frame or tick is a common FiveM performance bottleneck.',
  },
  'probe/performance/short-wait-loop': {
    title: 'Extremely short wait inside a loop',
    category: 'performance',
    impact: 'Wait(0) or Wait(1) loops can still behave like busy polling depending on workload.',
  },
  'probe/performance/json-in-loop': {
    title: 'JSON work inside a repeated loop',
    category: 'performance',
    impact: 'Encoding or decoding inside hot loops adds avoidable CPU and allocation churn.',
  },
  'probe/performance/debug-in-loop': {
    title: 'Debug printing inside a repeated loop',
    category: 'performance',
    impact: 'Console output in hot paths is expensive and can flood logs during playtests.',
  },
  'probe/performance/oversized-handler': {
    title: 'Oversized handler region',
    category: 'performance',
    impact:
      'Large handlers are harder to reason about and often hide unrelated work that should be split.',
  },
  'probe/event-safety/missing-validation': {
    title: 'Network handlers without visible validation',
    category: 'event-safety',
    impact:
      'Client-provided payloads may reach privileged logic without schema or authorization checks.',
  },
  'probe/event-safety/duplicate-registration': {
    title: 'Duplicate event registration',
    category: 'event-safety',
    impact:
      'Registering the same event more than once can duplicate handlers and create unpredictable behavior.',
  },
  'probe/manual-review/dynamic-reference': {
    title: 'Dynamic reference requires manual review',
    category: 'manual-review',
    impact:
      'Cortex cannot resolve the target name statically, so call flow and usage remain uncertain.',
  },
  'probe/maintainability/large-script': {
    title: 'Very large script file',
    category: 'maintainability',
    impact: 'Large files slow review and make risky regions harder to spot during refactors.',
  },
  'probe/unused/function-no-callers': {
    title: 'Function with no discoverable callers',
    category: 'unused',
    impact:
      'Dead helpers increase maintenance cost unless retained intentionally or invoked dynamically.',
  },
  'probe/unused/handler-no-caller': {
    title: 'Event handler with no discoverable emitter',
    category: 'unused',
    impact: 'The handler may be unused, test-only, or triggered through unresolved dynamic events.',
  },
  'probe/reliability/duplicate-polling': {
    title: 'Duplicate polling loop pattern',
    category: 'reliability',
    impact:
      'Multiple perpetual loops doing similar work can race and make behavior harder to predict.',
  },
};

export const PROBE_RULE_SET_VERSION = '2026.07.1';

const WARNING_RULES: {
  pattern: RegExp;
  ruleId: string;
  severity: ProbeSeverity;
  category: ProbeCategory;
  confidence: ProbeConfidence;
  title: string;
  impact: string;
  remediation: string;
  inferred?: boolean;
}[] = [
  {
    pattern: /Continuous loop has no visible yield near line (\d+)/,
    ruleId: 'probe/performance/busy-loop-no-yield',
    severity: 'high',
    category: 'performance',
    confidence: 'high',
    title: 'Busy loop may run continuously',
    impact: 'Cortex found an unconditional loop whose visible body contains no scheduler yield.',
    remediation:
      'Add a bounded Wait, replace polling with an event, or document why the loop must be tight.',
  },
  {
    pattern: /Conditional loop may execute continuously without yielding near line (\d+)/,
    ruleId: 'probe/performance/busy-loop-no-yield',
    severity: 'medium',
    category: 'performance',
    confidence: 'medium',
    title: 'Conditional loop may run continuously',
    impact:
      'Cortex found a conditional loop with work in its body but no visible yield, condition mutation, or exit.',
    remediation:
      'Add a bounded Wait, mutate the loop condition in the body, or replace polling with an event.',
    inferred: true,
  },
  {
    pattern: /Network event is emitted from an unyielded loop near line (\d+)/,
    ruleId: 'probe/performance/network-in-loop',
    severity: 'high',
    category: 'performance',
    confidence: 'high',
    title: 'Network traffic inside a perpetual loop',
    impact: 'Cortex found a Trigger*Event or emit call inside a loop with no visible yield.',
    remediation:
      'Debounce emissions, move work behind server authority, or trigger from discrete state changes.',
  },
  {
    pattern: /Very short setInterval detected/,
    ruleId: 'probe/performance/short-interval',
    severity: 'medium',
    category: 'performance',
    confidence: 'medium',
    title: 'Very short timer interval',
    impact: 'Cortex found setInterval with a 0–10ms delay.',
    remediation: 'Increase the interval or replace the timer with an event-driven workflow.',
  },
  {
    pattern: /Broad entity enumeration appears in a frame-sensitive path/,
    ruleId: 'probe/performance/entity-enum-hot-path',
    severity: 'medium',
    category: 'performance',
    confidence: 'medium',
    title: 'Broad entity enumeration in a hot path',
    impact: 'Cortex found GetGamePool near Wait(0), setTick, or similar hot-path markers.',
    remediation: 'Cache results, narrow the query, or move enumeration off the hottest path.',
    inferred: true,
  },
  {
    pattern: /Large script; only deterministic symbol extraction was performed/,
    ruleId: 'probe/maintainability/large-script',
    severity: 'info',
    category: 'maintainability',
    confidence: 'high',
    title: 'Very large script file',
    impact: 'Files over 1 MB receive reduced static inspection depth.',
    remediation: 'Split large scripts into focused modules when practical.',
  },
  {
    pattern: /Network handlers were found; manually verify/,
    ruleId: 'probe/event-safety/missing-validation',
    severity: 'medium',
    category: 'event-safety',
    confidence: 'low',
    title: 'Network handlers without visible validation',
    impact:
      'Cortex found net event handlers but no obvious validation helpers (type checks, zod, or similar).',
    remediation:
      'Validate payload shape and authorization on the server. Static checks do not replace runtime testing.',
    inferred: true,
  },
  {
    pattern: /Unresolved dynamic (.+) near line (\d+)/,
    ruleId: 'probe/manual-review/dynamic-reference',
    severity: 'low',
    category: 'manual-review',
    confidence: 'low',
    title: 'Dynamic reference requires manual review',
    impact: 'Dynamic loading or constructed names cannot be ruled out.',
    remediation: 'Trace the runtime value or constrain names to static literals where possible.',
    inferred: true,
  },
];

function findingId(ruleId: string, file: string, startLine: number, endLine: number): string {
  return `${ruleId}|${file}|${startLine}|${endLine}`;
}

function pushFinding(
  findings: ProbeFinding[],
  seen: Set<string>,
  input: Omit<ProbeFinding, 'id'> & { id?: string },
): void {
  const id = input.id ?? findingId(input.ruleId, input.file, input.startLine, input.endLine);
  if (seen.has(id)) return;
  seen.add(id);
  findings.push(probeFindingSchema.parse({ ...input, id }));
}

function lineFromWarning(warning: string, fallback = 1): number {
  const match = /near line (\d+)/.exec(warning);
  return match ? Number(match[1]) : fallback;
}

function mapWarnings(file: ProbeScriptAnalysis, findings: ProbeFinding[], seen: Set<string>): void {
  for (const warning of file.warnings) {
    for (const rule of WARNING_RULES) {
      const match = rule.pattern.exec(warning);
      if (!match) continue;
      const line = match[2] ? Number(match[2]) : lineFromWarning(warning);
      pushFinding(findings, seen, {
        ruleId: rule.ruleId,
        severity: rule.severity,
        category: rule.category,
        confidence: rule.confidence,
        title: rule.title,
        explanation: warning,
        impact: rule.impact,
        remediation: rule.remediation,
        file: file.relativePath,
        startLine: line,
        endLine: line,
        evidence: [warning],
        inferred: rule.inferred,
      });
      break;
    }
  }
}

function detectLoopPatterns(
  file: ProbeScriptAnalysis,
  source: string,
  findings: ProbeFinding[],
  seen: Set<string>,
): void {
  const loops = analyzeLuaWhileLoops(source);
  for (const loop of loops) {
    const loopLabel = loop.unconditional ? 'while true loop' : `while ${loop.condition} loop`;

    if (loop.hasShortWait) {
      pushFinding(findings, seen, {
        ruleId: 'probe/performance/short-wait-loop',
        severity: 'medium',
        category: 'performance',
        confidence: 'medium',
        title: PROBE_RULE_META['probe/performance/short-wait-loop']!.title,
        explanation: `Cortex found Wait(0) or Wait(1) inside a repeated loop near line ${loop.startLine}.`,
        impact: PROBE_RULE_META['probe/performance/short-wait-loop']!.impact,
        remediation: 'Increase the wait interval or replace polling with discrete events.',
        file: file.relativePath,
        startLine: loop.startLine,
        endLine: loop.endLine,
        evidence: [`${loopLabel} at line ${loop.startLine}`, 'Wait(0) or Wait(1) in loop body'],
        inferred: true,
      });
    }

    if (loop.mayRunContinuously && loop.hasJsonWork) {
      pushFinding(findings, seen, {
        ruleId: 'probe/performance/json-in-loop',
        severity: 'medium',
        category: 'performance',
        confidence: 'high',
        title: PROBE_RULE_META['probe/performance/json-in-loop']!.title,
        explanation: `Cortex found json.encode or json.decode inside a hot loop near line ${loop.startLine}.`,
        impact: PROBE_RULE_META['probe/performance/json-in-loop']!.impact,
        remediation: 'Move serialization outside the loop or cache encoded payloads.',
        file: file.relativePath,
        startLine: loop.startLine,
        endLine: loop.endLine,
        evidence: [`${loopLabel} at line ${loop.startLine}`, 'json.encode/decode in loop body'],
      });
    }

    if (loop.mayRunContinuously && loop.hasDebugPrint) {
      pushFinding(findings, seen, {
        ruleId: 'probe/performance/debug-in-loop',
        severity: 'low',
        category: 'performance',
        confidence: 'high',
        title: PROBE_RULE_META['probe/performance/debug-in-loop']!.title,
        explanation: `Cortex found print() inside a hot loop near line ${loop.startLine}.`,
        impact: PROBE_RULE_META['probe/performance/debug-in-loop']!.impact,
        remediation: 'Remove debug prints from hot loops or guard them behind a debug flag.',
        file: file.relativePath,
        startLine: loop.startLine,
        endLine: loop.endLine,
        evidence: [`${loopLabel} at line ${loop.startLine}`, 'print() in loop body'],
      });
    }
  }

  const loopCount = loops.filter((loop) => loop.mayRunContinuously || loop.hasShortWait).length;
  if (loopCount >= 2) {
    pushFinding(findings, seen, {
      ruleId: 'probe/reliability/duplicate-polling',
      severity: 'low',
      category: 'reliability',
      confidence: 'medium',
      title: PROBE_RULE_META['probe/reliability/duplicate-polling']!.title,
      explanation: `Cortex found ${loopCount} repeated polling loops in this file.`,
      impact: PROBE_RULE_META['probe/reliability/duplicate-polling']!.impact,
      remediation: 'Consolidate polling into one loop or convert repeated checks to events.',
      file: file.relativePath,
      startLine: 1,
      endLine: Math.max(1, source.replaceAll('\r\n', '\n').split('\n').length),
      evidence: [`${loopCount} polling loops detected`],
      inferred: true,
    });
  }
}

function detectOversizedHandlers(
  file: ProbeScriptAnalysis,
  findings: ProbeFinding[],
  seen: Set<string>,
): void {
  const threshold = 80;
  for (const piece of file.pieces) {
    if (piece.kind !== 'handler' && piece.kind !== 'function') continue;
    if (piece.lineCount < threshold) continue;
    pushFinding(findings, seen, {
      ruleId: 'probe/performance/oversized-handler',
      severity: piece.lineCount >= 140 ? 'medium' : 'low',
      category: 'performance',
      confidence: 'medium',
      title: PROBE_RULE_META['probe/performance/oversized-handler']!.title,
      explanation: `Cortex measured ${piece.lineCount} lines in ${piece.kind} "${piece.label}" (L${piece.startLine}–${piece.endLine}).`,
      impact: PROBE_RULE_META['probe/performance/oversized-handler']!.impact,
      remediation: 'Split validation, side effects, and unrelated helpers into focused functions.',
      file: file.relativePath,
      startLine: piece.startLine,
      endLine: piece.endLine,
      evidence: [`${piece.lineCount} lines`, `${piece.kind} region`],
      inferred: true,
    });
  }
}

function detectDuplicateEvents(
  file: ProbeScriptAnalysis,
  findings: ProbeFinding[],
  seen: Set<string>,
): void {
  const incoming = file.symbols.filter(
    (symbol) => symbol.kind === 'event' && symbol.direction === 'incoming',
  );
  const counts = new Map<string, ProbeScriptSymbol[]>();
  for (const symbol of incoming) {
    const list = counts.get(symbol.name) ?? [];
    list.push(symbol);
    counts.set(symbol.name, list);
  }
  for (const [name, symbols] of counts) {
    if (symbols.length < 2) continue;
    const first = symbols[0]!;
    pushFinding(findings, seen, {
      ruleId: 'probe/event-safety/duplicate-registration',
      severity: 'medium',
      category: 'event-safety',
      confidence: 'high',
      title: PROBE_RULE_META['probe/event-safety/duplicate-registration']!.title,
      explanation: `Cortex found ${symbols.length} registrations for event "${name}".`,
      impact: PROBE_RULE_META['probe/event-safety/duplicate-registration']!.impact,
      remediation:
        'Register once and route internally, or confirm duplicate handlers are intentional.',
      file: file.relativePath,
      startLine: first.line,
      endLine: symbols.at(-1)?.line ?? first.line,
      evidence: symbols.map((symbol) => `registration at line ${symbol.line}`),
      wireLink: { symbolKind: 'event', symbolName: name },
    });
  }
}

function detectUnusedFunctions(
  analysis: ProbeResourceAnalysis,
  findings: ProbeFinding[],
  seen: Set<string>,
): void {
  const called = new Set(
    analysis.edges.filter((edge) => edge.kind === 'calls').map((edge) => edge.to),
  );
  const publicSymbols = new Set(
    analysis.files.flatMap((file) =>
      file.symbols
        .filter(
          (symbol) =>
            symbol.kind === 'export' ||
            symbol.kind === 'command' ||
            (symbol.kind === 'event' && symbol.direction === 'incoming'),
        )
        .map((symbol) => symbol.name),
    ),
  );

  for (const file of analysis.files) {
    for (const symbol of file.symbols) {
      if (symbol.kind !== 'function') continue;
      if (publicSymbols.has(symbol.name)) continue;
      const nodeId = `function:${file.relativePath}:${symbol.name}`;
      const sameFileCalls = file.references.some((ref) => ref.name === symbol.name);
      if (sameFileCalls || called.has(nodeId)) continue;
      pushFinding(findings, seen, {
        ruleId: 'probe/unused/function-no-callers',
        severity: 'low',
        category: 'unused',
        confidence: 'medium',
        title: PROBE_RULE_META['probe/unused/function-no-callers']!.title,
        explanation: `No direct reference was found for function "${symbol.name}" in static analysis.`,
        impact: PROBE_RULE_META['probe/unused/function-no-callers']!.impact,
        remediation:
          'Remove the helper, export it intentionally, or mark it retained if invoked dynamically.',
        file: file.relativePath,
        startLine: symbol.line,
        endLine: symbol.line,
        evidence: [
          'Searched same-file call sites and graph call edges',
          'No matching caller found',
          'Dynamic loading cannot be ruled out',
        ],
        inferred: true,
        wireLink: { symbolKind: 'function', symbolName: symbol.name },
      });
    }
  }
}

function detectHandlersWithoutEmitters(
  analysis: ProbeResourceAnalysis,
  findings: ProbeFinding[],
  seen: Set<string>,
): void {
  const emitted = new Set(
    analysis.files.flatMap((file) =>
      file.symbols
        .filter((symbol) => symbol.kind === 'event' && symbol.direction === 'outgoing')
        .map((symbol) => symbol.name),
    ),
  );

  for (const file of analysis.files) {
    for (const symbol of file.symbols) {
      if (symbol.kind !== 'event' || symbol.direction !== 'incoming') continue;
      if (emitted.has(symbol.name)) continue;
      pushFinding(findings, seen, {
        ruleId: 'probe/unused/handler-no-caller',
        severity: 'low',
        category: 'unused',
        confidence: 'low',
        title: PROBE_RULE_META['probe/unused/handler-no-caller']!.title,
        explanation: `No static emitter was found for incoming event "${symbol.name}".`,
        impact: PROBE_RULE_META['probe/unused/handler-no-caller']!.impact,
        remediation:
          'Confirm another resource emits this event, or remove stale handlers during cleanup.',
        file: file.relativePath,
        startLine: symbol.line,
        endLine: symbol.line,
        evidence: [
          'Searched static event emissions in workspace scripts',
          'No matching Trigger*Event / emit call found',
          'Cross-resource or dynamic emissions may still exist',
        ],
        inferred: true,
        wireLink: { symbolKind: 'event', symbolName: symbol.name },
      });
    }
  }
}

export interface BuildProbeFindingsOptions {
  sources?: Record<string, string>;
}

export function buildProbeFindings(
  analysis: ProbeResourceAnalysis,
  options: BuildProbeFindingsOptions = {},
): ProbeFinding[] {
  const findings: ProbeFinding[] = [];
  const seen = new Set<string>();

  for (const file of analysis.files) {
    mapWarnings(file, findings, seen);
    detectOversizedHandlers(file, findings, seen);
    detectDuplicateEvents(file, findings, seen);
    const source = options.sources?.[file.relativePath];
    if (source) detectLoopPatterns(file, source, findings, seen);
  }

  detectUnusedFunctions(analysis, findings, seen);
  detectHandlersWithoutEmitters(analysis, findings, seen);

  const severityRank: Record<ProbeSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((left, right) => {
    const severityDelta = severityRank[left.severity] - severityRank[right.severity];
    if (severityDelta !== 0) return severityDelta;
    const fileDelta = left.file.localeCompare(right.file);
    if (fileDelta !== 0) return fileDelta;
    return left.startLine - right.startLine;
  });

  return findings;
}

export function probeFindingFingerprint(
  finding: Pick<ProbeFinding, 'ruleId' | 'file' | 'startLine' | 'endLine'>,
): string {
  return `${finding.ruleId}|${finding.file}|${finding.startLine}|${finding.endLine}`;
}

export function ruleMeta(ruleId: string): ProbeRuleMeta {
  return (
    PROBE_RULE_META[ruleId] ?? {
      title: ruleId,
      category: 'maintainability',
      impact: 'Review this finding and apply the suggested repair direction.',
    }
  );
}

export interface ProbeHotspot {
  file: string;
  score: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  loopSignals: number;
  dynamicSignals: number;
  largestHandlerLines: number;
}

export function buildProbeHotspots(
  analysis: ProbeResourceAnalysis,
  findings: ProbeFinding[],
): ProbeHotspot[] {
  const byFile = new Map<string, ProbeHotspot>();

  const ensure = (file: string): ProbeHotspot => {
    const existing = byFile.get(file);
    if (existing) return existing;
    const created: ProbeHotspot = {
      file,
      score: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      loopSignals: 0,
      dynamicSignals: 0,
      largestHandlerLines: 0,
    };
    byFile.set(file, created);
    return created;
  };

  for (const finding of findings) {
    const entry = ensure(finding.file);
    entry[finding.severity] += 1;
    entry.score +=
      finding.severity === 'high'
        ? 12
        : finding.severity === 'medium'
          ? 6
          : finding.severity === 'low'
            ? 2
            : 1;
    if (finding.ruleId.includes('dynamic')) entry.dynamicSignals += 1;
    if (finding.ruleId.includes('loop') || finding.ruleId.includes('polling'))
      entry.loopSignals += 1;
  }

  for (const file of analysis.files) {
    const entry = ensure(file.relativePath);
    for (const piece of file.pieces) {
      if (piece.kind === 'handler' || piece.kind === 'function') {
        entry.largestHandlerLines = Math.max(entry.largestHandlerLines, piece.lineCount);
      }
    }
    entry.score += Math.min(8, Math.floor(entry.largestHandlerLines / 40));
  }

  return [...byFile.values()]
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.high - left.high);
}

export function probeOverallState(
  counts: Record<ProbeSeverity, number>,
  incomplete: boolean,
): 'clear' | 'needs-review' | 'high-risk' | 'incomplete' {
  if (incomplete) return 'incomplete';
  if (counts.high > 0) return 'high-risk';
  if (counts.medium > 0 || counts.low > 0) return 'needs-review';
  return 'clear';
}

export function countDynamicReferences(analysis: ProbeResourceAnalysis): number {
  return analysis.files.reduce(
    (sum, file) =>
      sum + file.warnings.filter((warning) => warning.startsWith('Unresolved dynamic')).length,
    0,
  );
}
