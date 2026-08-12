import { describe, expect, it } from 'vitest';
import { auditResource, isAbsoluteManifestReference } from './audit';
import { parseManifest } from './manifest';

describe('resource auditor', () => {
  it('detects missing references', () => {
    const findings = auditResource(
      [],
      parseManifest("fx_version 'cerulean'\nclient_script 'missing.lua'"),
      'fxmanifest.lua',
    );
    expect(findings.some((x) => x.ruleId === 'manifest/missing-reference')).toBe(true);
  });
  it('detects missing NUI, file, and data_file references through one reference model', () => {
    const findings = auditResource(
      [],
      parseManifest(
        [
          "fx_version 'cerulean'",
          "game 'gta5'",
          "ui_page 'html/index.html'",
          "files { 'html/index.html', 'stream/*.ytyp' }",
          "data_file 'DLC_ITYP_REQUEST' 'stream/*.ytyp'",
        ].join('\n'),
      ),
      'fxmanifest.lua',
    );
    expect(findings.some((finding) => finding.ruleId === 'manifest/missing-ui-page')).toBe(true);
    expect(
      findings.filter((finding) => finding.ruleId === 'manifest/missing-reference'),
    ).toHaveLength(3);
  });
  it('does not market absence as success', () =>
    expect(auditResource([], null, null)[0]?.ruleId).toBe('manifest/missing'));
  it('does not report a case mismatch for an exact path', () => {
    const findings = auditResource(
      [{ relativePath: 'client/main.lua', name: 'main.lua', extension: '.lua', bytes: 1 }],
      parseManifest("fx_version 'cerulean'\ngame 'gta5'\nclient_script 'client/main.lua'"),
      'fxmanifest.lua',
    );
    expect(findings.some((finding) => finding.ruleId === 'paths/case-mismatch')).toBe(false);
  });

  it('flags empty scripts', () => {
    const findings = auditResource(
      [{ relativePath: 'client/empty.lua', name: 'empty.lua', extension: '.lua', bytes: 0 }],
      parseManifest("fx_version 'cerulean'\ngame 'gta5'\nclient_script 'client/empty.lua'"),
      'fxmanifest.lua',
    );
    expect(findings.some((f) => f.ruleId === 'files/empty-script' && f.severity === 'error')).toBe(
      true,
    );
  });

  it('flags source maps', () => {
    const findings = auditResource(
      [{ relativePath: 'dist/app.js.map', name: 'app.js.map', extension: '.map', bytes: 12 }],
      parseManifest("fx_version 'cerulean'\ngame 'gta5'"),
      'fxmanifest.lua',
    );
    expect(findings.some((f) => f.ruleId === 'files/source-map')).toBe(true);
  });

  it('flags absolute manifest references', () => {
    const findings = auditResource(
      [],
      parseManifest(
        "fx_version 'cerulean'\ngame 'gta5'\nclient_script 'C:/scripts/main.lua'\nserver_script '/opt/res/server.lua'",
      ),
      'fxmanifest.lua',
    );
    const absolute = findings.filter((f) => f.ruleId === 'paths/absolute-reference');
    expect(absolute.length).toBeGreaterThanOrEqual(2);
    expect(absolute.every((f) => f.severity === 'error')).toBe(true);
  });

  it('flags invalid JSON when content is provided', () => {
    const findings = auditResource(
      [{ relativePath: 'data/config.json', name: 'config.json', extension: '.json', bytes: 5 }],
      parseManifest("fx_version 'cerulean'\ngame 'gta5'\nfile 'data/config.json'"),
      'fxmanifest.lua',
      [],
      { 'data/config.json': '{ not json' },
    );
    expect(findings.some((f) => f.ruleId === 'files/invalid-json' && f.severity === 'error')).toBe(
      true,
    );
  });

  it('flags sensitive content without leaking the secret', () => {
    const secret = ['test', 'credential', 'value'].join('-');
    const findings = auditResource(
      [{ relativePath: 'config.lua', name: 'config.lua', extension: '.lua', bytes: 40 }],
      parseManifest("fx_version 'cerulean'\ngame 'gta5'\nclient_script 'config.lua'"),
      'fxmanifest.lua',
      [],
      { 'config.lua': `password = "${secret}"` },
    );
    const hit = findings.find((f) => f.ruleId === 'secrets/sensitive-content');
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe('error');
    expect(hit?.explanation).not.toContain(secret);
    expect(hit?.explanation.toLowerCase()).toMatch(/redacted|credential/);
  });

  it('keeps existing callers working without fileContents', () => {
    const findings = auditResource(
      [{ relativePath: 'client/main.lua', name: 'main.lua', extension: '.lua', bytes: 1 }],
      parseManifest("fx_version 'cerulean'\ngame 'gta5'\nclient_script 'client/main.lua'"),
      'fxmanifest.lua',
    );
    expect(findings.every((f) => f.ruleId !== 'files/invalid-json')).toBe(true);
    expect(findings.every((f) => f.ruleId !== 'secrets/sensitive-content')).toBe(true);
  });
});

describe('isAbsoluteManifestReference', () => {
  it('detects drive, UNC, and root-absolute forms', () => {
    expect(isAbsoluteManifestReference('C:\\foo\\bar.lua')).toBe(true);
    expect(isAbsoluteManifestReference('D:/res/client.lua')).toBe(true);
    expect(isAbsoluteManifestReference('\\\\server\\share\\a.lua')).toBe(true);
    expect(isAbsoluteManifestReference('/opt/resource/a.lua')).toBe(true);
    expect(isAbsoluteManifestReference('client/main.lua')).toBe(false);
    expect(isAbsoluteManifestReference('./client/main.lua')).toBe(false);
    expect(isAbsoluteManifestReference('../shared/util.lua')).toBe(false);
  });
});
