import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { resolveChannel, type ReleaseChannel } from '../../shared/branding';

declare const __CORTEX_RELEASE_CHANNEL__: string | undefined;
declare const __CORTEX_GITHUB_OWNER__: string | undefined;
declare const __CORTEX_GITHUB_REPOSITORY__: string | undefined;
declare const __CORTEX_ENABLE_AUTO_UPDATE__: string | undefined;
declare const __CORTEX_WORKOS_CLIENT_ID__: string | undefined;
declare const __CORTEX_WORKOS_CALLBACK_MODE__: string | undefined;
declare const __CORTEX_CLOUD_API_URL__: string | undefined;

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const githubSlug = z
  .string()
  .trim()
  .regex(/^$|^[A-Za-z0-9_.-]+$/, 'Use a GitHub owner or repository name, not a URL.');
const envSchema = z.object({
  CORTEX_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CORTEX_RELEASE_CHANNEL: z.enum(['stable', 'beta', 'development']).default('development'),
  CORTEX_GITHUB_OWNER: githubSlug.default(''),
  CORTEX_GITHUB_REPOSITORY: githubSlug.default(''),
  // Fine-grained token with repository Issues: Read and write permission. This
  // deliberately remains main-process-only and is never exposed over IPC.
  CORTEX_GITHUB_REPORT_TOKEN: z.string().default(''),
  CORTEX_GITHUB_REPORT_LABELS: z.string().default(''),
  CORTEX_ENABLE_AUTO_UPDATE: booleanString.default(false),
  CORTEX_ENABLE_DEVTOOLS: booleanString.default(false),
  CORTEX_CONVERTER_DIRECTORY: z.string().default(''),
  CORTEX_MAX_ARCHIVE_SIZE_MB: z.coerce.number().int().min(1).max(100_000).default(2048),
  CORTEX_MAX_IMPORT_FILE_SIZE_MB: z.coerce.number().int().min(1).max(100_000).default(1024),
  CORTEX_WORKOS_CLIENT_ID: z.string().trim().default(''),
  CORTEX_WORKOS_CALLBACK_MODE: z.enum(['protocol', 'loopback']).default('protocol'),
  CORTEX_CLOUD_API_URL: z.union([z.literal(''), z.url()]).default(''),
});
export type MainEnv = z.infer<typeof envSchema>;

export function readLocalEnv(): Record<string, string> {
  // Read the repository .env first so the desktop can use the existing local
  // setup, then allow desktop-specific files to override it. Environment
  // variables still win, so packaged releases can use normal OS or CI injection.
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const candidates = [
    path.join(workspaceRoot, '.env'),
    path.join(workspaceRoot, '.env.local'),
    path.join(workspaceRoot, 'apps', 'desktop', '.env'),
    path.join(workspaceRoot, 'apps', 'desktop', '.env.local'),
  ];
  const values: Record<string, string> = {};
  for (const candidate of candidates) {
    Object.assign(values, readEnvFile(candidate));
  }
  return values;
}

export function readEnvFile(candidate: string): Record<string, string> {
  if (!existsSync(candidate)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match?.[1] || match[2] === undefined) continue;
    const raw = match[2];
    values[match[1]] =
      (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw;
  }
  return values;
}

function findWorkspaceRoot(start: string): string {
  const current = path.resolve(start);
  if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
  const parent = path.dirname(current);
  return parent === current ? current : findWorkspaceRoot(parent);
}

function bakedChannel(): ReleaseChannel {
  return resolveChannel(
    typeof __CORTEX_RELEASE_CHANNEL__ === 'string' ? __CORTEX_RELEASE_CHANNEL__ : undefined,
    'development',
  );
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): MainEnv {
  const local = readLocalEnv();
  return envSchema.parse({
    ...local,
    ...source,
    CORTEX_RELEASE_CHANNEL:
      source.CORTEX_RELEASE_CHANNEL ?? local.CORTEX_RELEASE_CHANNEL ?? bakedChannel(),
    CORTEX_GITHUB_OWNER:
      source.CORTEX_GITHUB_OWNER ??
      local.CORTEX_GITHUB_OWNER ??
      (typeof __CORTEX_GITHUB_OWNER__ === 'string' ? __CORTEX_GITHUB_OWNER__ : undefined),
    CORTEX_GITHUB_REPOSITORY:
      source.CORTEX_GITHUB_REPOSITORY ??
      local.CORTEX_GITHUB_REPOSITORY ??
      (typeof __CORTEX_GITHUB_REPOSITORY__ === 'string' ? __CORTEX_GITHUB_REPOSITORY__ : undefined),
    CORTEX_ENABLE_AUTO_UPDATE:
      source.CORTEX_ENABLE_AUTO_UPDATE ??
      local.CORTEX_ENABLE_AUTO_UPDATE ??
      (typeof __CORTEX_ENABLE_AUTO_UPDATE__ === 'string'
        ? __CORTEX_ENABLE_AUTO_UPDATE__
        : undefined),
    CORTEX_WORKOS_CLIENT_ID:
      source.CORTEX_WORKOS_CLIENT_ID ??
      local.CORTEX_WORKOS_CLIENT_ID ??
      local.WORKOS_CLIENT_ID ??
      (typeof __CORTEX_WORKOS_CLIENT_ID__ === 'string' ? __CORTEX_WORKOS_CLIENT_ID__ : undefined),
    CORTEX_WORKOS_CALLBACK_MODE:
      source.CORTEX_WORKOS_CALLBACK_MODE ??
      local.CORTEX_WORKOS_CALLBACK_MODE ??
      (typeof __CORTEX_WORKOS_CALLBACK_MODE__ === 'string'
        ? __CORTEX_WORKOS_CALLBACK_MODE__
        : undefined),
    CORTEX_CLOUD_API_URL:
      source.CORTEX_CLOUD_API_URL ??
      local.CORTEX_CLOUD_API_URL ??
      (typeof __CORTEX_CLOUD_API_URL__ === 'string' ? __CORTEX_CLOUD_API_URL__ : undefined),
  });
}
