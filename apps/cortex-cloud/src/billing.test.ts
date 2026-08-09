import { describe, expect, it } from 'vitest';
import { verifyStripeSignature } from './billing';
import {
  MAX_RUN_REQUESTS,
  normalizeBillingStatus,
  PLAN_LIMITS,
  planForStripeStatus,
  usagePeriod,
} from './db';

describe('Stripe entitlement authority', () => {
  it('accepts a current valid webhook signature', async () => {
    const body = '{"id":"evt_1"}';
    const timestamp = 1_800_000_000;
    const signature = await testSignature(`${timestamp}.${body}`, 'whsec_test');
    await expect(
      verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, 'whsec_test', timestamp),
    ).resolves.toBeUndefined();
  });

  it('rejects forged and stale checkout/webhook state', async () => {
    await expect(
      verifyStripeSignature('{}', 't=1,v1=forged', 'whsec_test', 10_000),
    ).rejects.toThrow('timestamp');
  });

  it('derives Pro only from active or trialing subscription states', () => {
    expect(planForStripeStatus('active')).toBe('pro');
    expect(planForStripeStatus('trialing')).toBe('pro');
    expect(planForStripeStatus('past_due')).toBe('free');
    expect(planForStripeStatus('canceled')).toBe('free');
    expect(normalizeBillingStatus('unrecognized')).toBe('none');
  });

  it('uses calendar-month usage windows', () => {
    expect(PLAN_LIMITS).toEqual({ free: 25, pro: 1_000 });
    expect(MAX_RUN_REQUESTS).toBe(10);
    expect(usagePeriod(new Date('2026-08-08T12:00:00.000Z'))).toEqual({
      key: '2026-08',
      end: '2026-09-01T00:00:00.000Z',
    });
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
