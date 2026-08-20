import { describe, expect, it } from 'vitest';
import {
  isFreeOnly,
  isHostedAiEnabled,
  requireAiProviderConfig,
  requireBillingConfig,
  runtimeConfigurationIssues,
} from './runtime-config';

const base = {
  CORTEX_FREE_ONLY: 'true',
  CORTEX_AI_ENABLED: 'false',
  AI_PROVIDER_ENABLED: 'false',
  WORKOS_CLIENT_ID: 'client_test',
  WORKOS_ISSUER: 'https://api.workos.com/',
} as never;

const billing = {
  STRIPE_CREATOR_MONTHLY_PRICE_ID: 'price_t1',
  STRIPE_CREATOR_ANNUAL_PRICE_ID: 'price_t2',
  STRIPE_PRO_MONTHLY_PRICE_ID: 'price_t3',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_t4',
  STRIPE_SECRET_KEY: 'stripe-test-key',
  STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_cortex',
  BILLING_RETURN_URL: 'https://billing.example.test/account',
};

describe('Worker runtime configuration', () => {
  it('fails closed when commercial feature flags are absent', () => {
    expect(isFreeOnly({} as never)).toBe(true);
    expect(isHostedAiEnabled({} as never)).toBe(false);
  });

  it('does not require production credentials for free-only local development', () => {
    expect(runtimeConfigurationIssues(base)).toEqual([]);
  });

  it('requires a restricted Customer Portal before commercial billing can start', () => {
    expect(requireBillingConfig(billing as never)).toMatchObject({
      portalConfigurationId: 'bpc_cortex',
      returnUrl: 'https://billing.example.test/account',
    });
    expect(() =>
      requireBillingConfig({
        ...billing,
        STRIPE_PORTAL_CONFIGURATION_ID: '',
      } as never),
    ).toThrow('Missing or invalid required environment variable: STRIPE_PORTAL_CONFIGURATION_ID');
  });

  it('names missing variables without including values', () => {
    expect(() => requireAiProviderConfig({} as never)).toThrow(
      'Missing or invalid required environment variable: OPENROUTER_API_KEY',
    );
    expect(() => requireBillingConfig({} as never)).toThrow(
      'Missing or invalid required environment variable: STRIPE_CREATOR_MONTHLY_PRICE_ID',
    );
  });
});
