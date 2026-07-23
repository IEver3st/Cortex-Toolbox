import { describe, expect, it } from 'vitest';
import { formatBugReportBody, type DiagnosticLogEntry } from './diagnostics-service';

describe('formatBugReportBody', () => {
  const logs: DiagnosticLogEntry[] = [
    { at: '2026-07-17T00:00:00.000Z', level: 'error', message: 'Could not open manifest.' },
  ];
  const context = {
    appVersion: '1.0.0',
    releaseChannel: 'development',
    platform: 'win32',
    architecture: 'x64',
    electronVersion: '43.1.0',
    nodeVersion: '24.0.0',
    workspaceOpen: true,
  };

  it('includes the report, environment, and opted-in diagnostic logs', () => {
    const body = formatBugReportBody(
      {
        reportType: 'bug',
        title: 'Open fails',
        description: 'Opening a resource shows an error.',
        steps: '1. Open a resource.\n2. Select the manifest.',
        includeDiagnostics: true,
      },
      context,
      logs,
    );
    expect(body).toContain('## What happened');
    expect(body).toContain('Cortex: 1.0.0 (development)');
    expect(body).toContain('Could not open manifest.');
  });

  it('formats feature requests with description and use case sections', () => {
    const body = formatBugReportBody(
      {
        reportType: 'feature',
        title: 'Export audit results',
        description: 'I want to export audit findings.',
        steps: 'Share results with teammates after a review.',
        includeDiagnostics: false,
      },
      context,
      logs,
    );
    expect(body).toContain('## Description');
    expect(body).toContain('## Use case');
    expect(body).not.toContain('## Steps to reproduce');
  });

  it('formats module requests with module details', () => {
    const body = formatBugReportBody(
      {
        reportType: 'module',
        title: 'Vehicle tuning inspector',
        description: 'A module for handling.meta workflows.',
        steps: 'Compare handling values and validate against presets.',
        includeDiagnostics: false,
      },
      context,
      logs,
    );
    expect(body).toContain('## Module details');
    expect(body).not.toContain('## What happened');
  });

  it('does not include diagnostic events when opted out', () => {
    const body = formatBugReportBody(
      {
        reportType: 'bug',
        title: 'Open fails',
        description: 'Opening a resource shows an error.',
        steps: '',
        includeDiagnostics: false,
      },
      context,
      logs,
    );
    expect(body).not.toContain('## Cortex diagnostic log');
  });

  it('redacts secrets from user-entered report fields', () => {
    const body = formatBugReportBody(
      {
        reportType: 'bug',
        title: 'Request fails',
        description: 'authorization=github_pat_exampleSecretValue',
        steps: 'Use bearer ghp_exampleSecretValue and retry.',
        includeDiagnostics: false,
      },
      context,
      logs,
    );
    expect(body).not.toContain('github_pat_exampleSecretValue');
    expect(body).not.toContain('ghp_exampleSecretValue');
    expect(body).toContain('[REDACTED]');
  });
});
