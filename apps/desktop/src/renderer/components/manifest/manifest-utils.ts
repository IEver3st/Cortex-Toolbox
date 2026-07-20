import { parseManifest, type ParsedManifest } from '@cortex/resource-parser/manifest';

export interface ManifestWorkspaceFile {
  relativePath: string;
  extension: string;
}

function hasReference(reference: string, names: readonly string[]): boolean {
  if (names.includes(reference)) return true;
  if (!isGlobPath(reference)) return false;
  return countPatternMatches(reference, names) > 0;
}

function isAbsoluteManifestReference(reference: string): boolean {
  const value = reference.trim();
  if (!value) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return true;
  if (/^\\\\[^\\/]+[\\/]/.test(value) || /^\/\/[^\\/]+[\\/]/.test(value)) return true;
  return value.startsWith('/') || value.startsWith('\\');
}

function ruleTitle(ruleId: string): string {
  const parts = ruleId.split('/');
  return parts.at(-1)?.replaceAll('-', ' ') ?? ruleId;
}

function addProblem(
  problems: ManifestProblem[],
  suppressions: string[],
  problem: ManifestProblem,
): void {
  if (problem.ruleId && suppressions.includes(problem.ruleId)) return;
  problems.push(problem);
}

function auditManifestClient(
  parsed: ParsedManifest,
  files: ManifestWorkspaceFile[],
  manifestName: string,
  suppressions: string[] = [],
): ManifestProblem[] {
  const problems: ManifestProblem[] = [];
  const names = files.map((file) => file.relativePath);
  const insensitiveNames = new Map(names.map((name) => [name.toLowerCase(), name]));
  const roles = ['clientScripts', 'serverScripts', 'sharedScripts', 'files'] as const;

  if (manifestName === '__resource.lua') {
    addProblem(problems, suppressions, {
      id: 'manifest-legacy',
      severity: 'warning',
      line: 1,
      title: ruleTitle('manifest/legacy'),
      explanation: 'The resource uses the legacy manifest name.',
      ruleId: 'manifest/legacy',
    });
  }

  if (!parsed.fxVersion) {
    addProblem(problems, suppressions, {
      id: 'missing-fx-version',
      severity: 'error',
      line: null,
      title: ruleTitle('manifest/missing-fx-version'),
      explanation: 'The manifest does not declare fx_version.',
      ruleId: 'manifest/missing-fx-version',
    });
  }
  if (!parsed.game) {
    addProblem(problems, suppressions, {
      id: 'missing-game',
      severity: 'error',
      line: null,
      title: ruleTitle('manifest/missing-game'),
      explanation: 'The manifest does not declare a target game.',
      ruleId: 'manifest/missing-game',
    });
  }

  const referenceKeys = new Set<string>();
  for (const role of roles) {
    for (const reference of parsed[role]) {
      const referenceKey = `${role}:${reference.value}`;
      if (referenceKeys.has(referenceKey)) {
        addProblem(problems, suppressions, {
          id: `duplicate-${referenceKey}-${reference.range.line}`,
          severity: 'note',
          line: reference.range.line,
          title: ruleTitle('manifest/duplicate-reference'),
          explanation: `${reference.value} is listed more than once in ${role}.`,
          ruleId: 'manifest/duplicate-reference',
        });
      }
      referenceKeys.add(referenceKey);

      if (isAbsoluteManifestReference(reference.value)) {
        addProblem(problems, suppressions, {
          id: `absolute-${reference.range.line}-${reference.value}`,
          severity: 'error',
          line: reference.range.line,
          title: ruleTitle('paths/absolute-reference'),
          explanation: `Manifest reference ${reference.value} is an absolute path and is not portable.`,
          ruleId: 'paths/absolute-reference',
        });
      }
      if (!hasReference(reference.value, names)) {
        addProblem(problems, suppressions, {
          id: `missing-ref-${reference.range.line}-${reference.value}`,
          severity: 'error',
          line: reference.range.line,
          title: ruleTitle('manifest/missing-reference'),
          explanation: `No file matches ${reference.value}.`,
          ruleId: 'manifest/missing-reference',
        });
      }
      const insensitive = insensitiveNames.get(reference.value.toLowerCase());
      if (insensitive && insensitive !== reference.value) {
        addProblem(problems, suppressions, {
          id: `case-${reference.range.line}-${reference.value}`,
          severity: 'warning',
          line: reference.range.line,
          title: ruleTitle('paths/case-mismatch'),
          explanation: `${reference.value} differs in case from ${insensitive}.`,
          ruleId: 'paths/case-mismatch',
        });
      }
    }
  }

  if (parsed.uiPage) {
    if (isAbsoluteManifestReference(parsed.uiPage.value)) {
      addProblem(problems, suppressions, {
        id: `absolute-ui-${parsed.uiPage.range.line}`,
        severity: 'error',
        line: parsed.uiPage.range.line,
        title: ruleTitle('paths/absolute-reference'),
        explanation: `Manifest reference ${parsed.uiPage.value} is an absolute path and is not portable.`,
        ruleId: 'paths/absolute-reference',
      });
    }
    if (!hasReference(parsed.uiPage.value, names)) {
      addProblem(problems, suppressions, {
        id: `missing-ui-${parsed.uiPage.range.line}`,
        severity: 'error',
        line: parsed.uiPage.range.line,
        title: ruleTitle('manifest/missing-ui-page'),
        explanation: `The ui_page target ${parsed.uiPage.value} does not exist.`,
        ruleId: 'manifest/missing-ui-page',
      });
    }
  }

  for (const dataFile of parsed.dataFiles) {
    if (isAbsoluteManifestReference(dataFile.path.value)) {
      addProblem(problems, suppressions, {
        id: `absolute-data-${dataFile.path.range.line}`,
        severity: 'error',
        line: dataFile.path.range.line,
        title: ruleTitle('paths/absolute-reference'),
        explanation: `Manifest reference ${dataFile.path.value} is an absolute path and is not portable.`,
        ruleId: 'paths/absolute-reference',
      });
    }
    if (!hasReference(dataFile.path.value, names)) {
      addProblem(problems, suppressions, {
        id: `missing-data-${dataFile.path.range.line}`,
        severity: 'error',
        line: dataFile.path.range.line,
        title: ruleTitle('manifest/missing-reference'),
        explanation: `No file matches ${dataFile.path.value}.`,
        ruleId: 'manifest/missing-reference',
      });
    }
  }

  return problems;
}

export function findingsToProblems(
  findings: {
    severity: 'error' | 'warning' | 'info';
    ruleId: string;
    file: string;
    line: number | null;
    explanation: string;
    suppressed: boolean;
  }[],
  manifestName: string,
): ManifestProblem[] {
  return findings
    .filter(
      (finding) => !finding.suppressed && (finding.file === manifestName || finding.file === '.'),
    )
    .map((finding) => ({
      id: `${finding.ruleId}-${finding.line ?? 0}-${finding.explanation}`,
      severity:
        finding.severity === 'error'
          ? 'error'
          : finding.severity === 'warning'
            ? 'warning'
            : 'note',
      line: finding.line,
      title: ruleTitle(finding.ruleId),
      explanation: finding.explanation,
      ruleId: finding.ruleId,
    }));
}

export function countPatternMatches(pattern: string, files: readonly string[]): number {
  try {
    const regex = new RegExp(
      `^${pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}$`,
    );
    return files.filter((file) => regex.test(file)).length;
  } catch {
    return 0;
  }
}

export type ManifestView = 'source' | 'structured';

export type DocumentStatus = 'saved' | 'unsaved' | 'valid' | 'needs-review' | 'invalid';

export type ProblemSeverity = 'error' | 'warning' | 'review' | 'note';

export interface ManifestProblem {
  id: string;
  severity: ProblemSeverity;
  line: number | null;
  title: string;
  explanation: string;
  ruleId?: string;
}

export type PathPresence = 'present' | 'missing' | 'pattern' | 'external';

export interface ManifestPathEntry {
  id: string;
  group: 'shared' | 'client' | 'server' | 'files' | 'dependencies' | 'data';
  label: string;
  value: string;
  line: number | null;
  presence: PathPresence;
  matchCount: number | null;
}

export function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isGlobPath(value: string): boolean {
  return /[*?[\]]/.test(value);
}

export function isExternalPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true;
  if (/^\\\\[^\\/]+[\\/]/.test(trimmed) || /^\/\/[^\\/]+[\\/]/.test(trimmed)) return true;
  return trimmed.startsWith('/') || trimmed.startsWith('\\');
}
export function pathPresence(
  value: string,
  fileIndex: Set<string>,
  allPaths: readonly string[],
): { presence: PathPresence; matchCount: number | null } {
  if (isExternalPath(value)) return { presence: 'external', matchCount: null };
  if (isGlobPath(value)) {
    return { presence: 'pattern', matchCount: countPatternMatches(value, allPaths) };
  }
  return {
    presence: fileIndex.has(normalizePath(value)) ? 'present' : 'missing',
    matchCount: null,
  };
}

export function emptyParsed(): ParsedManifest {
  return {
    fxVersion: null,
    game: null,
    author: null,
    description: null,
    version: null,
    clientScripts: [],
    serverScripts: [],
    sharedScripts: [],
    files: [],
    dependencies: [],
    dataFiles: [],
    uiPage: null,
    unsupported: [],
  };
}

export function safeParseManifest(source: string): ParsedManifest {
  try {
    return parseManifest(source);
  } catch {
    return emptyParsed();
  }
}

export function detectLineEnding(source: string): 'CRLF' | 'LF' | 'Mixed' {
  const hasCrLf = source.includes('\r\n');
  const hasLfOnly = /(?<!\r)\n/.test(source);
  if (hasCrLf && hasLfOnly) return 'Mixed';
  if (hasCrLf) return 'CRLF';
  return 'LF';
}

export function detectEncoding(source: string): string {
  if (source.charCodeAt(0) === 0xfeff) return 'UTF-8 with BOM';
  return 'UTF-8';
}

export function buildManifestProblems(
  parsed: ParsedManifest,
  files: ManifestWorkspaceFile[],
  manifestName: string,
  suppressions: string[] = [],
  extra: ManifestProblem[] = [],
): ManifestProblem[] {
  const problems: ManifestProblem[] = [
    ...auditManifestClient(parsed, files, manifestName, suppressions),
    ...extra,
  ];
  for (const entry of parsed.unsupported) {
    problems.push({
      id: `review-${entry.line}-${entry.text}`,
      severity: 'review',
      line: entry.line,
      title: 'Manual review',
      explanation: entry.reason,
      ruleId: 'manifest/manual-review',
    });
  }
  return problems.sort((left, right) => {
    const rank = (value: ProblemSeverity) =>
      value === 'error' ? 0 : value === 'warning' ? 1 : value === 'review' ? 2 : 3;
    const bySeverity = rank(left.severity) - rank(right.severity);
    if (bySeverity !== 0) return bySeverity;
    return (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER);
  });
}

export function buildPathEntries(
  parsed: ParsedManifest,
  fileIndex: Set<string>,
  allPaths: readonly string[],
): ManifestPathEntry[] {
  const entries: ManifestPathEntry[] = [];
  const push = (
    group: ManifestPathEntry['group'],
    label: string,
    value: string,
    line: number | null,
  ) => {
    const { presence, matchCount } = pathPresence(value, fileIndex, allPaths);
    entries.push({
      id: `${group}-${line ?? 0}-${value}`,
      group,
      label,
      value,
      line,
      presence,
      matchCount,
    });
  };
  for (const entry of parsed.sharedScripts) push('shared', 'Shared', entry.value, entry.range.line);
  for (const entry of parsed.clientScripts) push('client', 'Client', entry.value, entry.range.line);
  for (const entry of parsed.serverScripts) push('server', 'Server', entry.value, entry.range.line);
  for (const entry of parsed.files) push('files', 'File', entry.value, entry.range.line);
  for (const entry of parsed.dependencies) {
    push('dependencies', 'Dependency', entry.value, entry.range.line);
  }
  for (const entry of parsed.dataFiles) {
    push('data', entry.type.value, entry.path.value, entry.path.range.line);
  }
  if (parsed.uiPage) push('files', 'UI page', parsed.uiPage.value, parsed.uiPage.range.line);
  return entries;
}

export function computeDocumentStatus(
  dirty: boolean,
  problems: ManifestProblem[],
  validated: boolean,
): DocumentStatus {
  const hasErrors = problems.some((item) => item.severity === 'error');
  const hasReview = problems.some((item) => item.severity === 'review');
  if (dirty) return 'unsaved';
  if (hasErrors) return 'invalid';
  if (hasReview) return 'needs-review';
  if (validated) return 'valid';
  return 'saved';
}

export function statusLabel(status: DocumentStatus): string {
  switch (status) {
    case 'saved':
      return 'Saved';
    case 'unsaved':
      return 'Unsaved';
    case 'valid':
      return 'Valid';
    case 'needs-review':
      return 'Needs review';
    case 'invalid':
      return 'Invalid';
  }
}

export function buildDocumentSummary(
  parsed: ParsedManifest,
  pathEntries: ManifestPathEntry[],
): string {
  const parts: string[] = [];
  if (parsed.fxVersion?.value) parts.push(parsed.fxVersion.value);
  if (parsed.game?.value) parts.push(parsed.game.value);
  if (parsed.version?.value) parts.push(`Version ${parsed.version.value}`);
  const scriptCount =
    parsed.clientScripts.length + parsed.serverScripts.length + parsed.sharedScripts.length;
  if (scriptCount > 0) parts.push(`${scriptCount} script${scriptCount === 1 ? '' : 's'}`);
  const fileCount = parsed.files.length + (parsed.uiPage ? 1 : 0);
  if (fileCount > 0) parts.push(`${fileCount} file${fileCount === 1 ? '' : 's'}`);
  const missingCount = pathEntries.filter((entry) => entry.presence === 'missing').length;
  if (missingCount > 0) {
    parts.push(`${missingCount} missing path${missingCount === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Empty manifest';
}

export function computeLineDiff(
  baseline: string,
  source: string,
): { added: string[]; removed: string[] } {
  const before = new Map<string, number>();
  for (const line of baseline.split(/\r?\n/)) {
    before.set(line, (before.get(line) ?? 0) + 1);
  }
  const after = new Map<string, number>();
  for (const line of source.split(/\r?\n/)) {
    after.set(line, (after.get(line) ?? 0) + 1);
  }
  const added: string[] = [];
  const removed: string[] = [];
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const line of keys) {
    const left = before.get(line) ?? 0;
    const right = after.get(line) ?? 0;
    for (let i = 0; i < right - left; i++) added.push(line);
    for (let i = 0; i < left - right; i++) removed.push(line);
  }
  return { added, removed };
}

export function keyedDiffLines(lines: string[], prefix: string): { key: string; line: string }[] {
  const occurrences = new Map<string, number>();
  return lines.map((line) => {
    const occurrence = (occurrences.get(line) ?? 0) + 1;
    occurrences.set(line, occurrence);
    return { key: `${prefix}-${line}-${occurrence}`, line };
  });
}
