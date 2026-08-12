import { Minimatch } from 'minimatch';
import { z } from 'zod';
import type { ParsedManifest } from './manifest';
import type { ResourceFile } from './tree';

export const findingSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  ruleId: z.string(),
  file: z.string(),
  line: z.number().int().positive().nullable(),
  explanation: z.string(),
  remediation: z.string(),
  documentation: z.string(),
  suppressed: z.boolean(),
});
export type Finding = z.infer<typeof findingSchema>;

const roles = ['clientScripts', 'serverScripts', 'sharedScripts', 'files'] as const;

export type ManifestReferenceKind =
  'client_script' | 'server_script' | 'shared_script' | 'file' | 'ui_page' | 'data_file';

export interface MissingManifestReference {
  kind: ManifestReferenceKind;
  value: string;
  line: number;
}

const ROLE_REFERENCE_KINDS: Record<(typeof roles)[number], ManifestReferenceKind> = {
  clientScripts: 'client_script',
  serverScripts: 'server_script',
  sharedScripts: 'shared_script',
  files: 'file',
};

const SCRIPT_EXTENSIONS = new Set(['.lua', '.js', '.mjs', '.cjs', '.ts', '.tsx']);

export function isAbsoluteManifestReference(reference: string): boolean {
  const value = reference.trim();
  if (!value) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return true;
  if (/^\\\\[^\\/]+[\\/]/.test(value) || /^\/\/[^\\/]+[\\/]/.test(value)) return true;
  if (value.startsWith('/') || value.startsWith('\\')) return true;
  return false;
}

export function findMissingManifestReferences(
  files: Pick<ResourceFile, 'relativePath'>[],
  manifest: ParsedManifest,
): MissingManifestReference[] {
  const names = files.map((file) => file.relativePath.replaceAll('\\', '/'));
  const exactNames = new Set(names);
  const matchers = new Map<string, (name: string) => boolean>();
  const hasReference = (reference: string): boolean => {
    const normalized = reference.replaceAll('\\', '/').replace(/^\.\//, '');
    if (exactNames.has(normalized)) return true;
    let matches = matchers.get(normalized);
    if (!matches) {
      const matcher = new Minimatch(normalized, { nocase: false, dot: true });
      matches = (name) => matcher.match(name);
      matchers.set(normalized, matches);
    }
    return names.some(matches);
  };
  const references: MissingManifestReference[] = [];
  for (const role of roles) {
    for (const reference of manifest[role]) {
      if (!hasReference(reference.value)) {
        references.push({
          kind: ROLE_REFERENCE_KINDS[role],
          value: reference.value,
          line: reference.range.line,
        });
      }
    }
  }
  if (manifest.uiPage && !hasReference(manifest.uiPage.value)) {
    references.push({
      kind: 'ui_page',
      value: manifest.uiPage.value,
      line: manifest.uiPage.range.line,
    });
  }
  for (const dataFile of manifest.dataFiles) {
    if (!hasReference(dataFile.path.value)) {
      references.push({
        kind: 'data_file',
        value: dataFile.path.value,
        line: dataFile.path.range.line,
      });
    }
  }
  return references;
}

const SENSITIVE_CONTENT_PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i },
  {
    id: 'api-key-assignment',
    re: /(?:api[_-]?key|apikey|access[_-]?token|secret[_-]?key)\s*[=:]\s*['"]?[^\s'"]{8,}/i,
  },
  { id: 'password-assignment', re: /password\s*[=:]\s*['"]?[^\s'"]+/i },
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    id: 'bearer-token',
    re: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/,
  },
];

function detectSensitiveContent(content: string): string | null {
  for (const pattern of SENSITIVE_CONTENT_PATTERNS) if (pattern.re.test(content)) return pattern.id;
  return null;
}

export function auditResource(
  files: ResourceFile[],
  manifest: ParsedManifest | null,
  manifestName: string | null,
  suppressions: string[] = [],
  fileContents: Record<string, string> = {},
): Finding[] {
  const findings: Finding[] = [];
  const names = files.map((file) => file.relativePath);
  const insensitiveNames = new Map(names.map((name) => [name.toLowerCase(), name]));
  const add = (finding: Omit<Finding, 'suppressed' | 'documentation'>): void => {
    findings.push({
      ...finding,
      suppressed: suppressions.includes(finding.ruleId),
      documentation: `docs/rules/${finding.ruleId}.md`,
    });
  };
  if (!manifest)
    add({
      severity: 'error',
      ruleId: 'manifest/missing',
      file: '.',
      line: null,
      explanation: 'No fxmanifest.lua or __resource.lua was found.',
      remediation: 'Create an fxmanifest.lua using documented fields.',
    });
  if (manifestName === '__resource.lua')
    add({
      severity: 'warning',
      ruleId: 'manifest/legacy',
      file: manifestName,
      line: 1,
      explanation: 'The resource uses the legacy manifest name.',
      remediation: 'Review and migrate the manifest to fxmanifest.lua.',
    });
  if (manifest) {
    const missingReferences = new Set(
      findMissingManifestReferences(files, manifest).map(
        (reference) => `${reference.kind}:${reference.line}:${reference.value}`,
      ),
    );
    if (!manifest.fxVersion)
      add({
        severity: 'error',
        ruleId: 'manifest/missing-fx-version',
        file: manifestName ?? 'fxmanifest.lua',
        line: null,
        explanation: 'The manifest does not declare fx_version.',
        remediation:
          "Declare fx_version 'cerulean' unless compatibility requires another documented value.",
      });
    if (!manifest.game)
      add({
        severity: 'error',
        ruleId: 'manifest/missing-game',
        file: manifestName ?? 'fxmanifest.lua',
        line: null,
        explanation: 'The manifest does not declare a target game.',
        remediation: "Declare game 'gta5' for a FiveM resource.",
      });
    const referenceKeys = new Set<string>();
    for (const role of roles)
      for (const reference of manifest[role]) {
        const referenceKey = `${role}:${reference.value}`;
        if (referenceKeys.has(referenceKey))
          add({
            severity: 'info',
            ruleId: 'manifest/duplicate-reference',
            file: manifestName ?? 'fxmanifest.lua',
            line: reference.range.line,
            explanation: `${reference.value} is listed more than once in ${role}.`,
            remediation: 'Remove the duplicate declaration.',
          });
        referenceKeys.add(referenceKey);
        if (isAbsoluteManifestReference(reference.value))
          add({
            severity: 'error',
            ruleId: 'paths/absolute-reference',
            file: manifestName ?? 'fxmanifest.lua',
            line: reference.range.line,
            explanation: `Manifest reference ${reference.value} is an absolute path and is not portable.`,
            remediation: 'Use a path relative to the resource root.',
          });
        if (
          missingReferences.has(
            `${ROLE_REFERENCE_KINDS[role]}:${reference.range.line}:${reference.value}`,
          )
        )
          add({
            severity: 'error',
            ruleId: 'manifest/missing-reference',
            file: manifestName ?? 'fxmanifest.lua',
            line: reference.range.line,
            explanation: `No file matches ${reference.value}.`,
            remediation: 'Correct the path or include the missing file.',
          });
        const insensitive = insensitiveNames.get(reference.value.toLowerCase());
        if (insensitive && insensitive !== reference.value)
          add({
            severity: 'warning',
            ruleId: 'paths/case-mismatch',
            file: manifestName ?? 'fxmanifest.lua',
            line: reference.range.line,
            explanation: `${reference.value} differs in case from ${insensitive}.`,
            remediation: 'Match the on-disk casing for cross-platform reliability.',
          });
      }
    if (manifest.uiPage) {
      if (isAbsoluteManifestReference(manifest.uiPage.value))
        add({
          severity: 'error',
          ruleId: 'paths/absolute-reference',
          file: manifestName ?? 'fxmanifest.lua',
          line: manifest.uiPage.range.line,
          explanation: `Manifest reference ${manifest.uiPage.value} is an absolute path and is not portable.`,
          remediation: 'Use a path relative to the resource root.',
        });
      if (missingReferences.has(`ui_page:${manifest.uiPage.range.line}:${manifest.uiPage.value}`))
        add({
          severity: 'error',
          ruleId: 'manifest/missing-ui-page',
          file: manifestName ?? 'fxmanifest.lua',
          line: manifest.uiPage.range.line,
          explanation: `The ui_page target ${manifest.uiPage.value} does not exist.`,
          remediation: 'Correct ui_page or add the missing NUI entry point.',
        });
    }
    for (const dataFile of manifest.dataFiles) {
      if (isAbsoluteManifestReference(dataFile.path.value))
        add({
          severity: 'error',
          ruleId: 'paths/absolute-reference',
          file: manifestName ?? 'fxmanifest.lua',
          line: dataFile.path.range.line,
          explanation: `Manifest reference ${dataFile.path.value} is an absolute path and is not portable.`,
          remediation: 'Use a path relative to the resource root.',
        });
      if (missingReferences.has(`data_file:${dataFile.path.range.line}:${dataFile.path.value}`))
        add({
          severity: 'error',
          ruleId: 'manifest/missing-reference',
          file: manifestName ?? 'fxmanifest.lua',
          line: dataFile.path.range.line,
          explanation: `No file matches ${dataFile.path.value}.`,
          remediation: 'Correct the data_file path or include the missing stream/resource file.',
        });
    }
    for (const unsupported of manifest.unsupported)
      add({
        severity: 'info',
        ruleId: 'manifest/unsupported-syntax',
        file: manifestName ?? 'fxmanifest.lua',
        line: unsupported.line,
        explanation: unsupported.reason,
        remediation: 'Review this line manually; Cortex did not execute it.',
      });
  }
  for (const file of files) {
    if (file.bytes > 50 * 1024 * 1024)
      add({
        severity: 'warning',
        ruleId: 'files/oversized',
        file: file.relativePath,
        line: null,
        explanation: `The file is ${(file.bytes / 1024 / 1024).toFixed(1)} MB.`,
        remediation: 'Confirm this file belongs in the distributable package.',
      });
    if (file.bytes === 0 && SCRIPT_EXTENSIONS.has(file.extension))
      add({
        severity: 'error',
        ruleId: 'files/empty-script',
        file: file.relativePath,
        line: null,
        explanation: 'The script file is empty (0 bytes).',
        remediation: 'Remove the file or restore its intended contents.',
      });
    if (file.extension === '.map' || file.name.endsWith('.map'))
      add({
        severity: 'warning',
        ruleId: 'files/source-map',
        file: file.relativePath,
        line: null,
        explanation: 'A source map file is present in the resource inventory.',
        remediation: 'Exclude source maps from release packages unless intentionally shipped.',
      });
    if (/\.(env|pem|p12|key)$/i.test(file.name))
      add({
        severity: 'error',
        ruleId: 'secrets/sensitive-file',
        file: file.relativePath,
        line: null,
        explanation: 'The filename indicates potentially sensitive material.',
        remediation: 'Exclude the file and rotate any exposed credential.',
      });
    if (/\.(exe|dll|bat|cmd|ps1|sh)$/i.test(file.name))
      add({
        severity: 'warning',
        ruleId: 'files/executable',
        file: file.relativePath,
        line: null,
        explanation: 'The package contains an executable or command file.',
        remediation:
          'Confirm the file is intentional and never execute imported workspace content through Cortex.',
      });
    if (/\.(log|tmp|bak|swp)$/i.test(file.name))
      add({
        severity: 'info',
        ruleId: 'files/development-artifact',
        file: file.relativePath,
        line: null,
        explanation: 'This looks like a local development artifact.',
        remediation: 'Exclude it from release packages unless it is intentionally shipped.',
      });

    const content = fileContents[file.relativePath];
    if (content !== undefined) {
      if (file.extension === '.json') {
        try {
          JSON.parse(content);
        } catch {
          add({
            severity: 'error',
            ruleId: 'files/invalid-json',
            file: file.relativePath,
            line: null,
            explanation: 'The JSON file could not be parsed.',
            remediation: 'Fix the JSON syntax or remove the file from the package.',
          });
        }
      }
      const sensitiveKind = detectSensitiveContent(content);
      if (sensitiveKind)
        add({
          severity: 'error',
          ruleId: 'secrets/sensitive-content',
          file: file.relativePath,
          line: null,
          explanation: `File content matches a credential-like pattern (${sensitiveKind}). The matched value is redacted.`,
          remediation:
            'Remove secrets from the resource, load them from server config, and rotate any exposed credentials.',
        });
    }
  }
  return findings.sort(
    (a, b) =>
      ({ error: 0, warning: 1, info: 2 })[a.severity] -
        { error: 0, warning: 1, info: 2 }[b.severity] || a.file.localeCompare(b.file),
  );
}
