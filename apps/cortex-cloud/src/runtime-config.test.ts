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

describe('Worker runtime configuration', () => {
  it('fails closed when commercial feature flags are absent', () => {
    expect(isFreeOnly({} as never)).toBe(true);
    expect(isHostedAiEnabled({} as never)).toBe(false);
  });

  it('does not require production credentials for free-only local development', () => {
    expect(runtimeConfigurationIssues(base)).toEqual([]);
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
