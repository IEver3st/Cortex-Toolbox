import { describe, expect, it } from 'vitest';
import { assertAiReadablePath, isSensitiveAiPath, normalizeAiWorkspacePath } from './paths';
import { decideAiPermission } from './permissions';

describe('AI workspace sandbox', () => {
  it('accepts normal workspace-relative paths', () => {
    expect(normalizeAiWorkspacePath('resources\\police\\handling.meta')).toBe(
      'resources/police/handling.meta',
    );
    expect(assertAiReadablePath('./client/main.lua')).toBe('client/main.lua');
  });

  it.each([
    '../outside.txt',
    'data/../../outside.txt',
    'C:\\secrets.txt',
    '/etc/passwd',
    'file://x',
  ])('rejects escaping or absolute path %s', (path) =>
    expect(() => normalizeAiWorkspacePath(path)).toThrow(),
  );

  it('excludes sensitive files by default', () => {
    expect(isSensitiveAiPath('.env')).toBe(true);
    expect(isSensitiveAiPath('.env.production')).toBe(true);
    expect(isSensitiveAiPath('certs/server.pem')).toBe(true);
    expect(isSensitiveAiPath('data/handling.meta')).toBe(false);
    expect(() => assertAiReadablePath('credentials.json')).toThrow(/Sensitive files/);
  });

  it('enforces read-only and session-scoped write permissions', () => {
    expect(decideAiPermission('read-only', 'propose-change').allowed).toBe(false);
    expect(decideAiPermission('ask-before-changes', 'apply-change').requiresConfirmation).toBe(
      true,
    );
    expect(decideAiPermission('allow-session', 'apply-change').requiresConfirmation).toBe(false);
    expect(decideAiPermission('allow-session', 'destructive').requiresConfirmation).toBe(true);
  });
});
