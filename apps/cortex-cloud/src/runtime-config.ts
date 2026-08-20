import { z } from 'zod';
import type { Env } from './env';

export class ConfigurationError extends Error {
  constructor(readonly variable: string) {
    super(`Missing or invalid required environment variable: ${variable}`);
  }
}

const httpsUrl = z.url().refine((value) => value.startsWith('https://'));
const workOsClientId = z
  .string()
  .trim()
  .regex(/^client_[A-Za-z0-9]+$/);
const stripePriceId = z
  .string()
  .trim()
  .regex(/^price_[A-Za-z0-9]+$/);
const stripePortalConfigurationId = z
  .string()
  .trim()
  .regex(/^bpc_[A-Za-z0-9]+$/);

export function isFreeOnly(env: Env): boolean {
  return booleanValue(env.CORTEX_FREE_ONLY, true);
}

export function isHostedAiEnabled(env: Env): boolean {
  return (
    !isFreeOnly(env) &&
    booleanValue(env.CORTEX_AI_ENABLED, false) &&
    booleanValue(env.AI_PROVIDER_ENABLED, false)
  );
}

export function requireWorkOsConfig(env: Env): { clientId: string; issuer: string } {
  return {
    clientId: required('WORKOS_CLIENT_ID', env.WORKOS_CLIENT_ID, workOsClientId),
    issuer: required('WORKOS_ISSUER', env.WORKOS_ISSUER, httpsUrl),
  };
}

export function requireAiProviderConfig(env: Env): { apiKey: string } {
  return {
    apiKey: required('OPENROUTER_API_KEY', env.OPENROUTER_API_KEY, z.string().trim().min(1)),
  };
}

export function requireStripeSecretKey(env: Env): string {
  return required('STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY, z.string().trim().min(1));
}

export function requireBillingConfig(env: Env) {
  const prices = requirePriceConfig(env);
  return {
    secretKey: requireStripeSecretKey(env),
    returnUrl: required('BILLING_RETURN_URL', env.BILLING_RETURN_URL, httpsUrl),
    portalConfigurationId: required(
      'STRIPE_PORTAL_CONFIGURATION_ID',
      env.STRIPE_PORTAL_CONFIGURATION_ID,
      stripePortalConfigurationId,
    ),
    prices,
  };
}

export function requirePriceConfig(env: Env) {
  const prices = {
    creatorMonthly: required(
      'STRIPE_CREATOR_MONTHLY_PRICE_ID',
      env.STRIPE_CREATOR_MONTHLY_PRICE_ID,
      stripePriceId,
    ),
    creatorAnnual: required(
      'STRIPE_CREATOR_ANNUAL_PRICE_ID',
      env.STRIPE_CREATOR_ANNUAL_PRICE_ID,
      stripePriceId,
    ),
    proMonthly: required(
      'STRIPE_PRO_MONTHLY_PRICE_ID',
      env.STRIPE_PRO_MONTHLY_PRICE_ID,
      stripePriceId,
    ),
    proAnnual: required(
      'STRIPE_PRO_ANNUAL_PRICE_ID',
      env.STRIPE_PRO_ANNUAL_PRICE_ID,
      stripePriceId,
    ),
  };
  if (new Set(Object.values(prices)).size !== Object.keys(prices).length) {
    throw new ConfigurationError('STRIPE_*_PRICE_ID');
  }
  return prices;
}

export function requireStripeWebhookSecret(env: Env): string {
  return required('STRIPE_WEBHOOK_SECRET', env.STRIPE_WEBHOOK_SECRET, z.string().trim().min(1));
}

export function runtimeConfigurationIssues(env: Env): string[] {
  const issues: string[] = [];
  collectIssue(issues, () => requireWorkOsConfig(env));
  if (!isFreeOnly(env)) collectIssue(issues, () => requireBillingConfig(env));
  if (isHostedAiEnabled(env)) collectIssue(issues, () => requireAiProviderConfig(env));
  return issues;
}

function booleanValue(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  return defaultValue;
}

function required<T>(name: string, value: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ConfigurationError(name);
  return parsed.data;
}

function collectIssue(issues: string[], read: () => unknown): void {
  try {
    read();
  } catch (error) {
    if (error instanceof ConfigurationError) issues.push(error.message);
    else throw error;
  }
}
