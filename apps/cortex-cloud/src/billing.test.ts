import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPortal,
  policyForPrice,
  priceForSelection,
  pricePolicies,
  verifyStripeSignature,
} from './billing';
import {
  dollarsToMicrousd,
  normalizeBillingStatus,
  parseProviderUsage,
  subscriptionPermitsAi,
  usagePeriod,
} from './db';
import type { Env } from './env';

const env = {
  STRIPE_CREATOR_MONTHLY_PRICE_ID: 'price_t1',
  STRIPE_CREATOR_ANNUAL_PRICE_ID: 'price_t2',
  STRIPE_PRO_MONTHLY_PRICE_ID: 'price_t3',
  STRIPE_PRO_ANNUAL_PRICE_ID: 'price_t4',
} as Env;

const billingEnv = {
  ...env,
  STRIPE_SECRET_KEY: 'stripe-test-key',
  STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_cortex',
  BILLING_RETURN_URL: 'https://billing.example.test/account',
} as Env;

afterEach(() => vi.restoreAllMocks());

describe('Stripe entitlement authority', () => {
  it('maps all four server-owned plan selections to the approved prices', () => {
    expect(pricePolicies(env)).toEqual([
      { plan: 'creator', interval: 'month', priceId: 'price_t1' },
      { plan: 'creator', interval: 'year', priceId: 'price_t2' },
      { plan: 'pro', interval: 'month', priceId: 'price_t3' },
      { plan: 'pro', interval: 'year', priceId: 'price_t4' },
    ]);
    expect(priceForSelection(env, { plan: 'creator', interval: 'month' })).toBe(
      env.STRIPE_CREATOR_MONTHLY_PRICE_ID,
    );
    expect(priceForSelection(env, { plan: 'pro', interval: 'year' })).toBe(
      env.STRIPE_PRO_ANNUAL_PRICE_ID,
    );
  });

  it('never grants an entitlement for an unknown price', () => {
    expect(policyForPrice(env, 'price_modified_client')).toBeNull();
  });

  it('rejects duplicate or missing price configuration', () => {
    expect(() =>
      pricePolicies({ ...env, STRIPE_PRO_ANNUAL_PRICE_ID: env.STRIPE_PRO_MONTHLY_PRICE_ID }),
    ).toThrow('invalid');
    expect(() => pricePolicies({ ...env, STRIPE_CREATOR_MONTHLY_PRICE_ID: '' })).toThrow(
      'STRIPE_CREATOR_MONTHLY_PRICE_ID',
    );
  });

  it('pins every Customer Portal session to the restricted configuration', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://billing.stripe.test/session' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(createPortal(billingEnv, 'cus_cortex')).resolves.toBe(
      'https://billing.stripe.test/session',
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(URLSearchParams);
    expect((request?.body as URLSearchParams).get('configuration')).toBe('bpc_cortex');
  });

  it('fails closed before calling Stripe when the restricted portal is missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      createPortal({ ...billingEnv, STRIPE_PORTAL_CONFIGURATION_ID: '' }, 'cus_cortex'),
    ).rejects.toThrow('STRIPE_PORTAL_CONFIGURATION_ID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a current valid webhook signature and rejects forged or stale signatures', async () => {
    const body = '{"id":"evt_1"}';
    const timestamp = 1_800_000_000;
    const signature = await testSignature(`${timestamp}.${body}`, 'webhook-test-secret');
    await expect(
      verifyStripeSignature(
        body,
        `t=${timestamp},v1=${signature}`,
        'webhook-test-secret',
        timestamp,
      ),
    ).resolves.toBeUndefined();
    await expect(
      verifyStripeSignature('{}', 't=1,v1=forged', 'webhook-test-secret', 10_000),
    ).rejects.toThrow('timestamp');
  });

  it('keeps recoverable past-due access but disables terminal subscription states', () => {
    expect(subscriptionPermitsAi('active')).toBe(true);
    expect(subscriptionPermitsAi('trialing')).toBe(true);
    expect(subscriptionPermitsAi('past_due')).toBe(true);
    for (const status of [
      'unpaid',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'paused',
    ] as const) {
      expect(subscriptionPermitsAi(status)).toBe(false);
    }
    expect(normalizeBillingStatus('unrecognized')).toBe('none');
  });

  it('anchors monthly AI periods independently of annual Stripe cadence', () => {
    expect(usagePeriod('2026-01-31T15:30:00.000Z', new Date('2026-02-15T00:00:00.000Z'))).toEqual({
      startsAt: '2026-01-31T15:30:00.000Z',
      endsAt: '2026-02-28T15:30:00.000Z',
    });
    expect(usagePeriod('2026-01-31T15:30:00.000Z', new Date('2026-03-02T00:00:00.000Z'))).toEqual({
      startsAt: '2026-02-28T15:30:00.000Z',
      endsAt: '2026-03-31T15:30:00.000Z',
    });
  });
});

describe('integer provider usage accounting', () => {
  it('uses actual provider cost, cached tokens, and integer microUSD', () => {
    expect(
      parseProviderUsage({
        usage: {
          prompt_tokens: 120,
          prompt_tokens_details: { cached_tokens: 80 },
          completion_tokens: 48,
          completion_tokens_details: { reasoning_tokens: 31 },
          cost: 0.0025004,
        },
      }),
    ).toEqual({
      inputTokens: 120,
      cachedInputTokens: 80,
      outputTokens: 48,
      reasoningTokens: 31,
      providerCostMicrousd: 2_500,
    });
    expect(dollarsToMicrousd('0.95')).toBe(950_000);
    expect(dollarsToMicrousd(0)).toBe(0);
  });
});

async function testSignature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
