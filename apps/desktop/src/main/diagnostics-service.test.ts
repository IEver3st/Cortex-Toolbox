import { describe, expect, it } from 'vitest';
import { formatBugReportBody, type DiagnosticLogEntry } from './diagnostics-service';

describe('formatBugReportBody', () => {
  const logs: DiagnosticLogEntry[] = [
    { at: '2026-07-17T00:00:00.000Z', level: 'error', message: 'Could not open manifest.' },
  ];
  const context = {
    appVersion: '0.1.0',
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
        title: 'Open fails',
        description: 'Opening a resource shows an error.',
        steps: '1. Open a resource.\n2. Select the manifest.',
        includeDiagnostics: true,
      },
      context,
      logs,
    );
    expect(body).toContain('## What happened');
    expect(body).toContain('Cortex: 0.1.0 (development)');
    expect(body).toContain('Could not open manifest.');
  });

  it('does not include diagnostic events when opted out', () => {
    const body = formatBugReportBody(
      {
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
});
