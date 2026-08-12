import type { MainEnv } from './config/env';
import type { ReportType } from '../shared/contracts';

export interface DiagnosticLogEntry {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type { ReportType } from '../shared/contracts';

export interface BugReportInput {
  reportType: ReportType;
  title: string;
  description: string;
  steps: string;
  includeDiagnostics: boolean;
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  bug: 'Bug',
  feature: 'Feature',
  module: 'Module',
};

const REPORT_TYPE_ISSUE_LABELS: Record<ReportType, string> = {
  bug: 'bug',
  feature: 'enhancement',
  module: 'module-request',
};

export interface ReportContext {
  appVersion: string;
  releaseChannel: string;
  platform: string;
  architecture: string;
  electronVersion: string;
  nodeVersion: string;
  workspaceOpen: boolean;
}

interface GitHubIssueResponse {
  number?: number;
  html_url?: string;
  message?: string;
}

const MAX_LOGS = 200;
const MAX_LOG_MESSAGE_LENGTH = 2_000;
const MAX_ISSUE_BODY_LENGTH = 30_000;

function cleanText(value: string, maximum = MAX_LOG_MESSAGE_LENGTH): string {
  return value
    .replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(
      /((?:token|secret|password|authorization|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi,
      '$1[REDACTED]',
    )
    .replace(/\b(?:ghp|github_pat)_[A-Za-z0-9_]+\b/g, '[REDACTED]')
    .replace(/\bsk-or-[A-Za-z0-9_-]+\b/gi, '[REDACTED]')
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/gi, '[REDACTED]')
    .replace(/\bwhsec_[A-Za-z0-9_-]+\b/gi, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(
      /\b(?:client|environment|price|prod|bpc|acct|cus|sub)_[A-Za-z0-9_-]{12,}\b/gi,
      '[REDACTED]',
    )
    .replace(/https:\/\/[A-Za-z0-9.-]+\.workers\.dev\b/gi, '[REDACTED_ENDPOINT]')
    .slice(0, maximum);
}

function parseLabels(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  ].slice(0, 10);
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 22)}\n[truncated by Cortex]`;
}

function reportDetailSections(input: BugReportInput): string[] {
  const description = cleanText(input.description, 8_000);
  const steps = cleanText(input.steps, 8_000);
  if (input.reportType === 'feature') {
    return ['## Description', description, '## Use case', steps || 'Not provided.'];
  }
  if (input.reportType === 'module') {
    return ['## Description', description, '## Module details', steps || 'Not provided.'];
  }
  return ['## What happened', description, '## Steps to reproduce', steps || 'Not provided.'];
}

export function formatBugReportBody(
  input: BugReportInput,
  context: ReportContext,
  logs: DiagnosticLogEntry[],
): string {
  const sections = [
    ...reportDetailSections(input),
    '## Environment',
    [
      `- Cortex: ${context.appVersion} (${context.releaseChannel})`,
      `- Platform: ${context.platform} (${context.architecture})`,
      `- Electron: ${context.electronVersion}`,
      `- Node: ${context.nodeVersion}`,
      `- Workspace open: ${context.workspaceOpen ? 'yes' : 'no'}`,
    ].join('\n'),
  ];
  if (input.includeDiagnostics) {
    const renderedLogs = logs.length
      ? logs.map((entry) => `${entry.at} [${entry.level}] ${entry.message}`).join('\n')
      : 'No application events were recorded during this session.';
    sections.push('## Cortex diagnostic log', '```text\n' + renderedLogs + '\n```');
  }
  return truncate(sections.join('\n\n'), MAX_ISSUE_BODY_LENGTH);
}

export class DiagnosticsService {
  private readonly logs: DiagnosticLogEntry[] = [];

  record(level: DiagnosticLogEntry['level'], message: string): void {
    const entry = { at: new Date().toISOString(), level, message: cleanText(message) };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
  }

  capturePinoChunk(chunk: unknown): void {
    const raw = String(chunk).trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        level?: number;
        msg?: unknown;
        err?: { message?: unknown };
      };
      const level: DiagnosticLogEntry['level'] =
        (parsed.level ?? 30) >= 50 ? 'error' : (parsed.level ?? 30) >= 40 ? 'warn' : 'info';
      const message = [parsed.msg, parsed.err?.message]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(': ');
      this.record(level, message || 'Application event');
    } catch {
      this.record('info', raw);
    }
  }

  list(): DiagnosticLogEntry[] {
    return [...this.logs];
  }
}

export class GitHubBugReportService {
  constructor(
    private readonly env: MainEnv,
    private readonly diagnostics: DiagnosticsService,
    private readonly context: () => ReportContext,
  ) {}

  status() {
    const repository =
      this.env.CORTEX_GITHUB_OWNER && this.env.CORTEX_GITHUB_REPOSITORY
        ? `${this.env.CORTEX_GITHUB_OWNER}/${this.env.CORTEX_GITHUB_REPOSITORY}`
        : null;
    return {
      configured: Boolean(repository && this.env.CORTEX_GITHUB_REPORT_TOKEN),
      repository,
      appVersion: this.context().appVersion,
      logCount: this.diagnostics.list().length,
    };
  }

  async submit(input: BugReportInput): Promise<{ issueNumber: number; issueUrl: string }> {
    const status = this.status();
    if (!status.configured || !status.repository) {
      throw new Error(
        'Bug reporting is not configured. Set CORTEX_GITHUB_OWNER, CORTEX_GITHUB_REPOSITORY, and CORTEX_GITHUB_REPORT_TOKEN.',
      );
    }
    const response = await fetch(`https://api.github.com/repos/${status.repository}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.env.CORTEX_GITHUB_REPORT_TOKEN}`,
        'User-Agent': `Cortex-ToolBox/${status.appVersion}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: `[${REPORT_TYPE_LABELS[input.reportType]}] ${cleanText(input.title, 120)}`,
        body: formatBugReportBody(input, this.context(), this.diagnostics.list()),
        labels: [
          ...new Set([
            ...parseLabels(this.env.CORTEX_GITHUB_REPORT_LABELS),
            REPORT_TYPE_ISSUE_LABELS[input.reportType],
          ]),
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => ({}))) as GitHubIssueResponse;
    if (!response.ok) {
      if (response.status === 401)
        throw new Error('GitHub rejected the reporting token. Check the token and try again.');
      if (response.status === 403)
        throw new Error(
          'GitHub denied issue creation. Give the token repository Issues write permission.',
        );
      if (response.status === 404)
        throw new Error(
          'GitHub could not find the configured repository. Check the owner and repository values.',
        );
      throw new Error(
        `GitHub could not create the issue (${response.status}). ${payload.message ?? ''}`.trim(),
      );
    }
    if (!payload.number || !payload.html_url)
      throw new Error('GitHub returned an incomplete issue response.');
    this.diagnostics.record('info', `Created GitHub issue #${payload.number}.`);
    return { issueNumber: payload.number, issueUrl: payload.html_url };
  }
}
