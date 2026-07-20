import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { resolveChannel, type ReleaseChannel } from '../../shared/branding';

declare const __CORTEX_RELEASE_CHANNEL__: string | undefined;

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const envSchema = z.object({
  CORTEX_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CORTEX_RELEASE_CHANNEL: z.enum(['stable', 'beta', 'development']).default('development'),
  CORTEX_GITHUB_OWNER: z.string().default(''),
  CORTEX_GITHUB_REPOSITORY: z.string().default(''),
  // Fine-grained token with repository Issues: Read and write permission. This
  // deliberately remains main-process-only and is never exposed over IPC.
  CORTEX_GITHUB_REPORT_TOKEN: z.string().default(''),
  CORTEX_GITHUB_REPORT_LABELS: z.string().default(''),
  CORTEX_ENABLE_AUTO_UPDATE: booleanString.default(false),
  CORTEX_ENABLE_DEVTOOLS: booleanString.default(false),
  CORTEX_CONVERTER_DIRECTORY: z.string().default(''),
  CORTEX_MAX_ARCHIVE_SIZE_MB: z.coerce.number().int().min(1).max(100_000).default(2048),
  CORTEX_MAX_IMPORT_FILE_SIZE_MB: z.coerce.number().int().min(1).max(100_000).default(1024),
});
export type MainEnv = z.infer<typeof envSchema>;

function readLocalEnv(): Record<string, string> {
  // The documented local override lives here. Environment variables still win,
  // so packaged releases can use normal OS or CI secret injection instead.
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), 'apps', 'desktop', '.env.local'),
  ];
  const values: Record<string, string> = {};
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match?.[1] || match[2] === undefined) continue;
      const raw = match[2];
      values[match[1]] =
        (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
          ? raw.slice(1, -1)
          : raw;
    }
  }
  return values;
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
  });
}
