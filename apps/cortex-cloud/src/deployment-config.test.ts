import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createProductionConfig,
  validateProductionConfig,
  validatePublicConfig,
} from './deployment-config';

const publicConfig = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const productionEnvironment = {
  CLOUDFLARE_D1_DATABASE_ID: '10000000-0000-4000-8000-000000000000',
  WORKOS_CLIENT_ID: 'client_test',
  WORKOS_ISSUER: 'https://api.workos.com/',
  STRIPE_CREATOR_MONTHLY_PRICE_ID: 'price_cm',
  STRIPE_CREATOR_ANNUAL_PRICE_ID: 'price_ca',
  STRIPE_PRO_MONTHLY_PRICE_ID: 'price_pm',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_pa',
  STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_test',
  BILLING_RETURN_URL: 'https://billing.example.test/account',
  CORTEX_AI_ENABLED: 'true',
  AI_PROVIDER_ENABLED: 'true',
  CORTEX_FREE_ONLY: 'false',
} satisfies Record<string, string>;

describe('public and production Worker configuration', () => {
  it('keeps the checked-in profile free of deployment identifiers and fail-open defaults', () => {
    expect(validatePublicConfig(publicConfig)).toEqual([]);
  });

  it('generates an ignored production overlay from deployment environment values', () => {
    const generated = createProductionConfig(productionEnvironment);
    expect(validateProductionConfig(generated)).toEqual([]);
    expect(generated).toContain('database_id =');
    expect(generated).toContain('STRIPE_PORTAL_CONFIGURATION_ID = "bpc_test"');
    expect(generated).toContain('CORTEX_FREE_ONLY = "false"');
    expect(generated).not.toContain('OPENROUTER_API_KEY');
    expect(generated).not.toContain('STRIPE_SECRET_KEY');
    expect(generated).not.toContain('STRIPE_WEBHOOK_SECRET');
  });

  it('requires a restricted Stripe Customer Portal configuration for production', () => {
    expect(() =>
      createProductionConfig({
        ...productionEnvironment,
        STRIPE_PORTAL_CONFIGURATION_ID: undefined,
      }),
    ).toThrow('STRIPE_PORTAL_CONFIGURATION_ID');
  });

  it('names missing deployment variables without revealing any supplied value', () => {
    expect(() => createProductionConfig({})).toThrow(
      'Production deployment configuration is invalid or missing:',
    );
  });

  it('rejects deployment identifiers and secret names in the public profile', () => {
    const unsafe = publicConfig
      .replace('WORKOS_CLIENT_ID = ""', `WORKOS_CLIENT_ID = "client_${'x'.repeat(24)}"`)
      .replace('[vars]', '[vars]\nSTRIPE_SECRET_KEY = "test-only-value"');
    expect(validatePublicConfig(unsafe)).toEqual(
      expect.arrayContaining([
        'WORKOS_CLIENT_ID is deployment configuration and must be empty in public config.',
        'STRIPE_SECRET_KEY is a secret and must be stored with Wrangler secrets.',
      ]),
    );
  });
});
