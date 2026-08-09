import { describe, expect, it } from 'vitest';
import app, { chatSchema, checkoutSchema, providerFailure } from './index';

const validChat = {
  runId: 'e3f38588-5f4f-45f7-95e1-06f9d010330a',
  step: 0,
  final: false,
  stream: false,
  reasoningMode: 'fast',
  messages: [{ role: 'user', content: 'Inspect this workspace.' }],
};

describe('Cortex Cloud AI boundary', () => {
  it('accepts only Cortex reasoning intent and rejects desktop model authority', () => {
    expect(chatSchema.safeParse(validChat).success).toBe(true);
    expect(chatSchema.safeParse({ ...validChat, model: 'deepseek/deepseek-v4-pro' }).success).toBe(
      false,
    );
    expect(chatSchema.safeParse({ ...validChat, reasoningMode: 'extreme' }).success).toBe(false);
  });

  it('accepts only Cortex plan intent and rejects client-submitted Stripe prices', () => {
    expect(checkoutSchema.safeParse({ plan: 'creator', interval: 'month' }).success).toBe(true);
    expect(
      checkoutSchema.safeParse({
        plan: 'creator',
        interval: 'month',
        priceId: 'price_attacker_selected',
      }).success,
    ).toBe(false);
  });

  it('maps provider failures to redacted product errors without a fallback', () => {
    expect(providerFailure(404)).toMatchObject({
      status: 503,
      message: 'Cortex AI is temporarily unavailable.',
    });
    expect(providerFailure(401)).toMatchObject({
      status: 503,
      message: 'Cortex Cloud is not configured correctly.',
    });
  });

  it('protects hosted routes with WorkOS authentication', async () => {
    const response = await app.request('/v1/me', {}, { WORKOS_CLIENT_ID: '' });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Sign in to use Cortex Hosted.' });
  });

  it('requires a valid Stripe signature on the canonical raw-body webhook route', async () => {
    const response = await app.request(
      '/v1/stripe/webhook',
      { method: 'POST', body: '{"id":"evt_forged"}' },
      { STRIPE_WEBHOOK_SECRET: 'whsec_test' },
    );
    expect(response.status).toBe(400);
  });
});
