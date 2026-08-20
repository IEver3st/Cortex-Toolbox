import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStripeEvent, createCheckout, createPortal } from './billing';
import { authorizeRunCall, completeRun, getAccountSummary, recordProviderUsage } from './db';
import type { Env } from './env';
import { createTestD1 } from './test-d1';

const PRICE = {
  creatorMonth: 'price_t1',
  creatorYear: 'price_t2',
  proMonth: 'price_t3',
  proYear: 'price_t4',
};

function testEnv(): Env {
  return {
    DB: createTestD1().binding,
    WORKOS_CLIENT_ID: 'client_test',
    WORKOS_ISSUER: 'https://api.workos.com/',
    OPENROUTER_API_KEY: 'provider-test-secret',
    CORTEX_AI_ENABLED: 'true',
    AI_PROVIDER_ENABLED: 'true',
    CORTEX_FREE_ONLY: 'false',
    STRIPE_SECRET_KEY: 'stripe-test-secret',
    STRIPE_WEBHOOK_SECRET: 'webhook-test-secret',
    STRIPE_CREATOR_MONTHLY_PRICE_ID: PRICE.creatorMonth,
    STRIPE_CREATOR_ANNUAL_PRICE_ID: PRICE.creatorYear,
    STRIPE_PRO_MONTHLY_PRICE_ID: PRICE.proMonth,
    STRIPE_PRO_ANNUAL_PRICE_ID: PRICE.proYear,
    STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_test',
    BILLING_RETURN_URL: 'https://cortex.example/account',
    STRIPE_RECONCILE_AFTER_SECONDS: '900',
    CORTEX_ADMIN_WORKOS_USER_IDS: '',
  };
}

function subscription(
  priceId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    start_date: Date.parse('2026-08-09T00:00:00.000Z') / 1_000,
    current_period_end: 1_791_478_400,
    cancel_at_period_end: false,
    metadata: { cortex_account_id: 'user_1', workos_user_id: 'user_1' },
    items: { data: [{ price: { id: priceId } }] },
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('subscription projection and webhook idempotency', () => {
  it('grants Creator, preserves usage through Pro upgrade, and keeps annual capacity monthly', async () => {
    const env = testEnv();
    await applyStripeEvent(env, {
      id: 'evt_created',
      type: 'customer.subscription.created',
      data: { object: subscription(PRICE.creatorYear) },
    });
    let summary = await getAccountSummary(env, 'user_1', new Date('2026-09-09T12:00:00.000Z'));
    expect(summary).toMatchObject({
      plan: 'creator',
      billing: { interval: 'year', subscriptionStatus: 'active' },
      ai: { entitled: true, enabled: true },
    });
    expect(summary.ai.usage.resetsAt).toBe('2026-10-09T00:00:00.000Z');

    const periodStart = '2026-09-09T00:00:00.000Z';
    await env.DB.prepare(
      'UPDATE ai_usage_periods SET provider_cost_microusd = 700000 WHERE user_id = ? AND starts_at = ?',
    )
      .bind('user_1', periodStart)
      .run();
    await applyStripeEvent(env, {
      id: 'evt_upgrade',
      type: 'customer.subscription.updated',
      data: { object: subscription(PRICE.proYear) },
    });
    summary = await getAccountSummary(env, 'user_1', new Date('2026-09-09T12:00:00.000Z'));
    expect(summary.plan).toBe('pro');
    expect(summary.ai.usage.percent).toBe(35);
    const row = await env.DB.prepare(
      'SELECT provider_cost_microusd FROM ai_usage_periods WHERE user_id = ? AND starts_at = ?',
    )
      .bind('user_1', periodStart)
      .first<{ provider_cost_microusd: number }>();
    expect(row?.provider_cost_microusd).toBe(700_000);
  });

  it('preserves access for cancel-at-period-end and past due, then removes it on deletion', async () => {
    const env = testEnv();
    await applyStripeEvent(env, {
      id: 'evt_cancel_scheduled',
      type: 'customer.subscription.updated',
      data: {
        object: subscription(PRICE.creatorMonth, {
          cancel_at_period_end: true,
          status: 'past_due',
        }),
      },
    });
    let summary = await getAccountSummary(env, 'user_1');
    expect(summary).toMatchObject({
      plan: 'creator',
      billing: { cancelAtPeriodEnd: true, subscriptionStatus: 'past_due' },
      ai: { entitled: true },
    });
    await applyStripeEvent(env, {
      id: 'evt_deleted',
      type: 'customer.subscription.deleted',
      data: { object: subscription(PRICE.creatorMonth, { status: 'canceled' }) },
    });
    summary = await getAccountSummary(env, 'user_1');
    expect(summary.plan).toBe('free');
    expect(summary.ai.entitled).toBe(false);
  });

  it('never grants unknown prices, surfaces payment failure, and handles duplicate events once', async () => {
    const env = testEnv();
    const unknown = subscription('price_unknown');
    await applyStripeEvent(env, {
      id: 'evt_unknown',
      type: 'customer.subscription.created',
      data: { object: unknown },
    });
    await applyStripeEvent(env, {
      id: 'evt_unknown',
      type: 'customer.subscription.created',
      data: { object: subscription(PRICE.proMonth) },
    });
    expect((await getAccountSummary(env, 'user_1')).plan).toBe('free');

    await applyStripeEvent(env, {
      id: 'evt_creator',
      type: 'customer.subscription.updated',
      data: { object: subscription(PRICE.creatorMonth) },
    });
    await applyStripeEvent(env, {
      id: 'evt_failed_invoice',
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1', subscription: 'sub_1' } },
    });
    expect((await getAccountSummary(env, 'user_1')).billing.paymentFailed).toBe(true);
    expect((await getAccountSummary(env, 'user_1')).ai.entitled).toBe(true);
  });
});

describe('checkout and portal', () => {
  it('reuses one Stripe Customer and sends stable identity metadata with a server-owned price', async () => {
    const env = testEnv();
    await env.DB.prepare(
      `INSERT INTO accounts (user_id, plan, billing_status, stripe_customer_id, created_at, updated_at)
       VALUES ('user_1', 'free', 'none', 'cus_existing', '2026-08-09T00:00:00Z', '2026-08-09T00:00:00Z')`,
    ).run();
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : input.toString();
        const body = init?.body instanceof URLSearchParams ? init.body.toString() : '';
        calls.push({ url, body });
        return Promise.resolve(
          url.includes('/v1/subscriptions?')
            ? Response.json({ data: [] })
            : Response.json({ url: 'https://checkout.stripe.test/session' }),
        );
      }),
    );
    await expect(
      createCheckout(env, 'user_1', { plan: 'creator', interval: 'month' }),
    ).resolves.toBe('https://checkout.stripe.test/session');
    expect(calls.some((call) => call.url.endsWith('/v1/customers'))).toBe(false);
    const checkout = calls.find((call) => call.url.endsWith('/v1/checkout/sessions'));
    expect(checkout).toBeDefined();
    if (!checkout) throw new Error('Checkout request was not sent.');
    expect(checkout.body).toContain(`line_items%5B0%5D%5Bprice%5D=${PRICE.creatorMonth}`);
    expect(checkout.body).toContain('customer=cus_existing');
    expect(checkout.body).toContain('cortex_account_id%5D=user_1');
  });

  it('prevents a duplicate active subscription and requires a Customer for Portal', async () => {
    const env = testEnv();
    await env.DB.prepare(
      `INSERT INTO accounts (user_id, plan, billing_status, stripe_customer_id, created_at, updated_at)
       VALUES ('user_1', 'creator', 'active', 'cus_existing', '2026-08-09T00:00:00Z', '2026-08-09T00:00:00Z')`,
    ).run();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ data: [subscription(PRICE.creatorMonth)] }))),
    );
    await expect(createCheckout(env, 'user_1', { plan: 'pro', interval: 'month' })).rejects.toThrow(
      'already exists',
    );
    await expect(createPortal(env, null)).rejects.toThrow('No Stripe customer');
  });
});

describe('D1 usage reservations and hard margin protection', () => {
  it('blocks Free before hosted inference and enforces Creator hard cost accounting', async () => {
    const env = testEnv();
    await expect(
      authorizeRunCall(env, 'free_user', {
        runId: '10000000-0000-4000-8000-000000000001',
        reasoningMode: 'fast',
        final: false,
        workingContextTokens: 100,
      }),
    ).rejects.toThrow('Creator or Pro');

    await applyStripeEvent(env, {
      id: 'evt_creator_usage',
      type: 'customer.subscription.created',
      data: { object: subscription(PRICE.creatorMonth) },
    });
    const runId = '10000000-0000-4000-8000-000000000002';
    const now = new Date('2026-08-09T02:00:00.000Z');
    const authorized = await authorizeRunCall(
      env,
      'user_1',
      {
        runId,
        reasoningMode: 'fast',
        final: false,
        workingContextTokens: 1_000,
      },
      now,
    );
    expect(authorized.policy.runCostMicrousd).toBe(25_000);
    await recordProviderUsage(
      env,
      'user_1',
      runId,
      {
        inputTokens: 1_000,
        cachedInputTokens: 500,
        outputTokens: 200,
        reasoningTokens: 100,
        providerCostMicrousd: 10_000,
      },
      1,
    );
    await completeRun(env, 'user_1', runId, true, null, now);
    const period = await env.DB.prepare(
      'SELECT provider_cost_microusd, reserved_microusd, successful_runs FROM ai_usage_periods WHERE user_id = ?',
    )
      .bind('user_1')
      .first<{
        provider_cost_microusd: number;
        reserved_microusd: number;
        successful_runs: number;
      }>();
    expect(period).toMatchObject({
      provider_cost_microusd: 10_000,
      reserved_microusd: 0,
      successful_runs: 1,
    });

    await env.DB.prepare(
      'UPDATE ai_usage_periods SET provider_cost_microusd = 950000 WHERE user_id = ?',
    )
      .bind('user_1')
      .run();
    await expect(
      authorizeRunCall(
        env,
        'user_1',
        {
          runId: '10000000-0000-4000-8000-000000000003',
          reasoningMode: 'advanced',
          final: false,
          workingContextTokens: 1_000,
        },
        now,
      ),
    ).rejects.toThrow('capacity');
  });

  it('allows grace usage, enforces Creator concurrency, and expires abandoned reservations', async () => {
    const env = testEnv();
    await applyStripeEvent(env, {
      id: 'evt_creator_concurrency',
      type: 'customer.subscription.created',
      data: { object: subscription(PRICE.creatorMonth) },
    });
    const start = new Date('2026-08-09T02:00:00.000Z');
    await getAccountSummary(env, 'user_1', start);
    await env.DB.prepare(
      'UPDATE ai_usage_periods SET provider_cost_microusd = 800000 WHERE user_id = ?',
    )
      .bind('user_1')
      .run();
    await authorizeRunCall(
      env,
      'user_1',
      {
        runId: '20000000-0000-4000-8000-000000000001',
        reasoningMode: 'advanced',
        final: false,
        workingContextTokens: 1_000,
      },
      start,
    );
    await expect(
      authorizeRunCall(
        env,
        'user_1',
        {
          runId: '20000000-0000-4000-8000-000000000002',
          reasoningMode: 'fast',
          final: false,
          workingContextTokens: 1_000,
        },
        start,
      ),
    ).rejects.toThrow('maximum active');

    const later = new Date(start.getTime() + 16 * 60 * 1_000);
    await authorizeRunCall(
      env,
      'user_1',
      {
        runId: '20000000-0000-4000-8000-000000000003',
        reasoningMode: 'fast',
        final: false,
        workingContextTokens: 1_000,
      },
      later,
    );
    const expired = await env.DB.prepare(
      'SELECT status FROM ai_run_reservations WHERE user_id = ? AND run_id = ?',
    )
      .bind('user_1', '20000000-0000-4000-8000-000000000001')
      .first<{ status: string }>();
    expect(expired?.status).toBe('expired');
  });

  it('allows exactly two Pro runs and rejects a third concurrent start', async () => {
    const env = testEnv();
    await applyStripeEvent(env, {
      id: 'evt_pro_concurrency',
      type: 'customer.subscription.created',
      data: { object: subscription(PRICE.proMonth) },
    });
    const now = new Date('2026-08-09T02:00:00.000Z');
    for (const runId of [
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
    ]) {
      await authorizeRunCall(
        env,
        'user_1',
        {
          runId,
          reasoningMode: 'fast',
          final: false,
          workingContextTokens: 1_000,
        },
        now,
      );
    }
    await expect(
      authorizeRunCall(
        env,
        'user_1',
        {
          runId: '30000000-0000-4000-8000-000000000003',
          reasoningMode: 'fast',
          final: false,
          workingContextTokens: 1_000,
        },
        now,
      ),
    ).rejects.toThrow('maximum active');
  });
});
