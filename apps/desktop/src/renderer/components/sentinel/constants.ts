import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

export type Severity = 'error' | 'warning' | 'info';
export type SeverityFilter = 'all' | Severity;
export type CategoryFilter = 'all' | 'Manifest' | 'Paths' | 'Files' | 'Secrets';
export type SortMode = 'severity' | 'file';

export interface AuditFinding {
  severity: Severity;
  ruleId: string;
  file: string;
  line: number | null;
  explanation: string;
  remediation: string;
  documentation: string;
  suppressed: boolean;
}

export interface RuleMeta {
  title: string;
  category: 'Manifest' | 'Paths' | 'Files' | 'Secrets';
  impact: string;
}

export const STAGE_DEFS = [
  { id: 'manifest', label: 'Reading manifest' },
  { id: 'paths', label: 'Resolving declared paths' },
  { id: 'hygiene', label: 'Inspecting package hygiene' },
  { id: 'secrets', label: 'Sampling sensitive file patterns' },
  { id: 'report', label: 'Producing report' },
] as const;

export const RULE_META: Record<string, RuleMeta> = {
  'manifest/missing': {
    title: 'Manifest file missing',
    category: 'Manifest',
    impact: 'Resource cannot load in FiveM without a manifest.',
  },
  'manifest/legacy': {
    title: 'Legacy manifest name',
    category: 'Manifest',
    impact: 'Still loadable, but migration to fxmanifest.lua is recommended.',
  },
  'manifest/missing-fx-version': {
    title: 'fx_version not declared',
    category: 'Manifest',
    impact: 'Required field for a modern FiveM resource.',
  },
  'manifest/missing-game': {
    title: 'Target game not declared',
    category: 'Manifest',
    impact: 'Required field; most GTA resources use game gta5.',
  },
  'manifest/duplicate-reference': {
    title: 'Duplicate path declaration',
    category: 'Manifest',
    impact: 'Noise only — remove the duplicate to keep the manifest clean.',
  },
  'manifest/missing-reference': {
    title: 'Declared path not found',
    category: 'Manifest',
    impact: 'Runtime will fail to load the missing script or file.',
  },
  'manifest/missing-ui-page': {
    title: 'ui_page target missing',
    category: 'Manifest',
    impact: 'NUI will not open if the entry HTML is absent.',
  },
  'manifest/unsupported-syntax': {
    title: 'Unsupported manifest syntax',
    category: 'Manifest',
    impact: 'Cortex did not evaluate this line; review manually.',
  },
  'paths/absolute-reference': {
    title: 'Absolute path in manifest',
    category: 'Paths',
    impact: 'Absolute paths break on other machines and servers.',
  },
  'paths/case-mismatch': {
    title: 'Path case mismatch',
    category: 'Paths',
    impact: 'Works on Windows, fails on Linux/case-sensitive hosts.',
  },
  'files/oversized': {
    title: 'Oversized file',
    category: 'Files',
    impact: 'May bloat the distributable package unnecessarily.',
  },
  'files/empty-script': {
    title: 'Empty script file',
    category: 'Files',
    impact: 'Likely a broken or unfinished script entry.',
  },
  'files/source-map': {
    title: 'Source map present',
    category: 'Files',
    impact: 'Usually should be excluded from release packages.',
  },
  'files/executable': {
    title: 'Executable or shell script',
    category: 'Files',
    impact: 'Confirm intent — Cortex never executes these files.',
  },
  'files/development-artifact': {
    title: 'Development artifact',
    category: 'Files',
    impact: 'Logs and temp files rarely belong in a release ZIP.',
  },
  'files/invalid-json': {
    title: 'Invalid JSON',
    category: 'Files',
    impact: 'Consumers that parse this file will fail.',
  },
  'secrets/sensitive-file': {
    title: 'Sensitive filename',
    category: 'Secrets',
    impact: 'Likely credential material — exclude and rotate if exposed.',
  },
  'secrets/sensitive-content': {
    title: 'Credential-like content',
    category: 'Secrets',
    impact: 'Possible secret in file content — remove and rotate.',
  },
};

export const COVERAGE_CHECKS = [
  {
    id: 'manifest',
    title: 'Manifest and paths',
    items: [
      'Runtime declarations',
      'Declared scripts and files',
      'Missing paths',
      'Case mismatches',
      'Duplicate declarations',
    ],
  },
  {
    id: 'hygiene',
    title: 'Package hygiene',
    items: [
      'Empty scripts',
      'Invalid JSON',
      'Development artifacts',
      'Source maps',
      'Oversized files',
      'Executables',
    ],
  },
  {
    id: 'secrets',
    title: 'Sensitive material',
    items: ['Sensitive extensions', 'Credential-like patterns', 'Matched values are never shown'],
  },
] as const;

export const SEVERITY_ORDER: Severity[] = ['error', 'warning', 'info'];

export const SEVERITY_META: Record<
  Severity,
  { label: string; short: string; impact: string; badge: string; Icon: typeof AlertCircle }
> = {
  error: {
    label: 'Errors',
    short: 'Blocks release',
    impact: 'Must fix before treating this resource as package-ready.',
    badge: 'error',
    Icon: AlertCircle,
  },
  warning: {
    label: 'Warnings',
    short: 'Needs review',
    impact: 'Does not auto-block, but often indicates ship risk.',
    badge: 'warning',
    Icon: AlertTriangle,
  },
  info: {
    label: 'Notes',
    short: 'Advisory',
    impact: 'Hygiene and awareness only — safe to ship after a glance.',
    badge: 'neutral',
    Icon: Info,
  },
};
