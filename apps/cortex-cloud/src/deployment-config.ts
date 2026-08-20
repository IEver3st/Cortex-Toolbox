import { z } from 'zod';

const SECRET_NAMES = ['OPENROUTER_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const;
const DEPLOYMENT_VARIABLES = [
  'WORKOS_CLIENT_ID',
  'STRIPE_CREATOR_MONTHLY_PRICE_ID',
  'STRIPE_CREATOR_ANNUAL_PRICE_ID',
  'STRIPE_PRO_MONTHLY_PRICE_ID',
  'STRIPE_PRO_ANNUAL_PRICE_ID',
  'STRIPE_PORTAL_CONFIGURATION_ID',
  'BILLING_RETURN_URL',
] as const;

const httpsUrl = z.url().refine((value) => value.startsWith('https://'));
const productionEnvironmentSchema = z.object({
  CLOUDFLARE_D1_DATABASE_ID: z.uuid(),
  CLOUDFLARE_WORKER_NAME: z.string().trim().min(1).default('cortex-cloud'),
  CLOUDFLARE_D1_DATABASE_NAME: z.string().trim().min(1).default('cortex-cloud'),
  WORKOS_CLIENT_ID: z
    .string()
    .trim()
    .regex(/^client_[A-Za-z0-9]+$/),
  WORKOS_ISSUER: httpsUrl.default('https://api.workos.com/'),
  STRIPE_CREATOR_MONTHLY_PRICE_ID: z
    .string()
    .trim()
    .regex(/^price_[A-Za-z0-9]+$/),
  STRIPE_CREATOR_ANNUAL_PRICE_ID: z
    .string()
    .trim()
    .regex(/^price_[A-Za-z0-9]+$/),
  STRIPE_PRO_MONTHLY_PRICE_ID: z
    .string()
    .trim()
    .regex(/^price_[A-Za-z0-9]+$/),
  STRIPE_PRO_ANNUAL_PRICE_ID: z
    .string()
    .trim()
    .regex(/^price_[A-Za-z0-9]+$/),
  STRIPE_PORTAL_CONFIGURATION_ID: z
    .string()
    .trim()
    .regex(/^bpc_[A-Za-z0-9]+$/),
  BILLING_RETURN_URL: httpsUrl,
  CORTEX_AI_ENABLED: z.literal('true'),
  AI_PROVIDER_ENABLED: z.literal('true'),
  CORTEX_FREE_ONLY: z.literal('false'),
  STRIPE_RECONCILE_AFTER_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  CORTEX_ADMIN_WORKOS_USER_IDS: z.string().trim().default(''),
});

export function validatePublicConfig(config: string): string[] {
  const issues: string[] = [];
  const values = parseStringAssignments(config);

  for (const name of ['name', 'main', 'compatibility_date'] as const) {
    if (!values.get(name)?.trim()) issues.push(`Set ${name} in wrangler.toml.`);
  }
  if (!/compatibility_flags\s*=\s*\[[^\]]*"nodejs_compat"[^\]]*\]/m.test(config)) {
    issues.push('Enable the nodejs_compat compatibility flag.');
  }
  if (!/^\s*binding\s*=\s*"DB"\s*$/m.test(config)) {
    issues.push('Declare the DB binding in wrangler.toml.');
  }
  if (/^\s*database_id\s*=/m.test(config)) {
    issues.push('database_id is deployment configuration and must not be committed.');
  }
  for (const secret of SECRET_NAMES) {
    if (values.has(secret)) {
      issues.push(`${secret} is a secret and must be stored with Wrangler secrets.`);
    }
  }
  for (const variable of DEPLOYMENT_VARIABLES) {
    if (values.get(variable)?.trim()) {
      issues.push(`${variable} is deployment configuration and must be empty in public config.`);
    }
  }
  if (values.get('CORTEX_FREE_ONLY') !== 'true') {
    issues.push('The public Worker profile must default CORTEX_FREE_ONLY to true.');
  }
  for (const variable of ['CORTEX_AI_ENABLED', 'AI_PROVIDER_ENABLED'] as const) {
    if (values.get(variable) !== 'false') {
      issues.push(`The public Worker profile must default ${variable} to false.`);
    }
  }
  if (/(?:price|prod|client|bpc)_[A-Za-z0-9]{12,}/.test(config)) {
    issues.push('Public Wrangler config contains a production-shaped service identifier.');
  }
  if (/https:\/\/[A-Za-z0-9.-]+\.workers\.dev/i.test(config)) {
    issues.push('Public Wrangler config contains a deployment-specific Worker URL.');
  }
  return [...new Set(issues)];
}

export function createProductionConfig(source: Record<string, string | undefined>): string {
  const parsed = productionEnvironmentSchema.safeParse(source);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.') || 'configuration');
    throw new Error(
      `Production deployment configuration is invalid or missing: ${[...new Set(names)].join(', ')}`,
    );
  }
  const value = parsed.data;
  const assignments: [string, string][] = [
    ['WORKOS_CLIENT_ID', value.WORKOS_CLIENT_ID],
    ['WORKOS_ISSUER', value.WORKOS_ISSUER],
    ['STRIPE_CREATOR_MONTHLY_PRICE_ID', value.STRIPE_CREATOR_MONTHLY_PRICE_ID],
    ['STRIPE_CREATOR_ANNUAL_PRICE_ID', value.STRIPE_CREATOR_ANNUAL_PRICE_ID],
    ['STRIPE_PRO_MONTHLY_PRICE_ID', value.STRIPE_PRO_MONTHLY_PRICE_ID],
    ['STRIPE_PRO_ANNUAL_PRICE_ID', value.STRIPE_PRO_ANNUAL_PRICE_ID],
    ['STRIPE_PORTAL_CONFIGURATION_ID', value.STRIPE_PORTAL_CONFIGURATION_ID],
    ['BILLING_RETURN_URL', value.BILLING_RETURN_URL],
    ['CORTEX_AI_ENABLED', value.CORTEX_AI_ENABLED],
    ['AI_PROVIDER_ENABLED', value.AI_PROVIDER_ENABLED],
    ['CORTEX_FREE_ONLY', value.CORTEX_FREE_ONLY],
    ['STRIPE_RECONCILE_AFTER_SECONDS', String(value.STRIPE_RECONCILE_AFTER_SECONDS)],
    ['CORTEX_ADMIN_WORKOS_USER_IDS', value.CORTEX_ADMIN_WORKOS_USER_IDS],
  ];
  const renderedVars = assignments
    .filter(([, assignment]) => assignment !== '')
    .map(([name, assignment]) => `${name} = ${tomlString(assignment)}`)
    .join('\n');

  return `# Generated from GitHub Environment or owner-shell configuration. Do not commit.\nname = ${tomlString(value.CLOUDFLARE_WORKER_NAME)}\nmain = "src/index.ts"\ncompatibility_date = "2026-08-08"\ncompatibility_flags = ["nodejs_compat"]\n\n[vars]\n${renderedVars}\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = ${tomlString(value.CLOUDFLARE_D1_DATABASE_NAME)}\ndatabase_id = ${tomlString(value.CLOUDFLARE_D1_DATABASE_ID)}\nmigrations_dir = "migrations"\n\n[observability]\nenabled = true\nhead_sampling_rate = 1\n`;
}

export function validateProductionConfig(config: string): string[] {
  const issues: string[] = [];
  const values = parseStringAssignments(config);
  for (const name of [
    'name',
    'main',
    'compatibility_date',
    'database_id',
    'WORKOS_ISSUER',
    ...DEPLOYMENT_VARIABLES,
  ]) {
    if (!values.get(name)?.trim()) issues.push(`Missing required deployment value: ${name}.`);
  }
  for (const secret of SECRET_NAMES) {
    if (values.has(secret))
      issues.push(`${secret} must not be written to a deployment config file.`);
  }
  if (values.get('CORTEX_AI_ENABLED') !== 'true') issues.push('CORTEX_AI_ENABLED must be true.');
  if (values.get('AI_PROVIDER_ENABLED') !== 'true')
    issues.push('AI_PROVIDER_ENABLED must be true.');
  if (values.get('CORTEX_FREE_ONLY') !== 'false') issues.push('CORTEX_FREE_ONLY must be false.');
  if (!/^bpc_[A-Za-z0-9]+$/.test(values.get('STRIPE_PORTAL_CONFIGURATION_ID') ?? '')) {
    issues.push('STRIPE_PORTAL_CONFIGURATION_ID must be a Stripe bpc_ identifier.');
  }
  return [...new Set(issues)];
}

function parseStringAssignments(config: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of config.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"\s*$/gm)) {
    if (match[1] !== undefined && match[2] !== undefined) values.set(match[1], match[2]);
  }
  return values;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}
