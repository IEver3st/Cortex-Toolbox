import { HttpError } from './auth';
import type { BillingInterval, CortexPlan } from './ai-policy';
import {
  ensureAccount,
  getAccountRow,
  normalizeBillingStatus,
  subscriptionPermitsAi,
  type AccountRow,
} from './db';
import type { Env } from './env';
import { requireBillingConfig, requirePriceConfig, requireStripeSecretKey } from './runtime-config';

class StripeApiError extends HttpError {
  constructor(readonly stripeStatus: number) {
    super(502, 'Billing is temporarily unavailable.');
  }
}

export interface CheckoutSelection {
  plan: Exclude<CortexPlan, 'free'>;
  interval: BillingInterval;
}

export interface PricePolicy extends CheckoutSelection {
  priceId: string;
}

export function pricePolicies(env: Env): PricePolicy[] {
  const prices = requirePriceConfig(env);
  const policies: PricePolicy[] = [
    { plan: 'creator', interval: 'month', priceId: prices.creatorMonthly },
    { plan: 'creator', interval: 'year', priceId: prices.creatorAnnual },
    { plan: 'pro', interval: 'month', priceId: prices.proMonthly },
    { plan: 'pro', interval: 'year', priceId: prices.proAnnual },
  ];
  if (policies.some((policy) => !policy.priceId.trim())) {
    throw new HttpError(503, 'Billing is not configured.');
  }
  if (new Set(policies.map((policy) => policy.priceId)).size !== policies.length) {
    throw new HttpError(503, 'Billing price configuration is invalid.');
  }
  return policies;
}

export function priceForSelection(env: Env, selection: CheckoutSelection): string {
  const match = pricePolicies(env).find(
    (policy) => policy.plan === selection.plan && policy.interval === selection.interval,
  );
  if (!match) throw new HttpError(400, 'That Cortex AI plan is not available.');
  return match.priceId;
}

export function policyForPrice(env: Env, priceId: string | null): PricePolicy | null {
  if (!priceId) return null;
  return pricePolicies(env).find((policy) => policy.priceId === priceId) ?? null;
}

export async function createCheckout(
  env: Env,
  userId: string,
  selection: CheckoutSelection,
): Promise<string> {
  const billingConfig = requireBillingConfig(env);
  const priceId = priceForSelection(env, selection);
  await ensureAccount(env, userId);
  let account = await getAccountRow(env, userId);
  if (account.stripe_customer_id) {
    const subscription = await findCurrentPaidSubscription(env, account.stripe_customer_id);
    if (subscription) {
      await applySubscriptionProjection(env, subscription, userId);
      throw new HttpError(409, 'A paid subscription already exists. Manage billing to change it.');
    }
  }
  if (
    account.stripe_subscription_id &&
    account.plan !== 'free' &&
    subscriptionPermitsAi(account.billing_status)
  ) {
    throw new HttpError(409, 'A paid subscription already exists. Manage billing to change it.');
  }
  if (!account.stripe_customer_id) {
    const customer = await stripeRequest(
      env,
      'POST',
      '/v1/customers',
      new URLSearchParams({
        'metadata[cortex_account_id]': userId,
        'metadata[workos_user_id]': userId,
      }),
      `cortex-customer-${await stableIdempotencyKey(userId)}`,
    );
    const customerId = objectId(customer.id);
    if (!customerId) throw new HttpError(502, 'Stripe did not return a customer.');
    await env.DB.prepare(
      `UPDATE accounts SET stripe_customer_id = COALESCE(stripe_customer_id, ?), updated_at = ?
       WHERE user_id = ?`,
    )
      .bind(customerId, new Date().toISOString(), userId)
      .run();
    account = await getAccountRow(env, userId);
  }
  const customerId = account.stripe_customer_id;
  if (!customerId) throw new HttpError(502, 'Stripe did not return a customer.');
  const form = new URLSearchParams({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: userId,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'subscription_data[metadata][cortex_account_id]': userId,
    'subscription_data[metadata][workos_user_id]': userId,
    'metadata[cortex_account_id]': userId,
    'metadata[workos_user_id]': userId,
    'metadata[cortex_plan]': selection.plan,
    'metadata[billing_interval]': selection.interval,
    allow_promotion_codes: 'true',
    success_url: `${billingConfig.returnUrl}?checkout=success`,
    cancel_url: `${billingConfig.returnUrl}?checkout=cancelled`,
  });
  const payload = await stripeRequest(
    env,
    'POST',
    '/v1/checkout/sessions',
    form,
    `cortex-checkout-${await stableIdempotencyKey(`${userId}:${priceId}:${Date.now() >> 12}`)}`,
  );
  if (typeof payload.url !== 'string') throw new HttpError(502, 'Stripe did not return Checkout.');
  return payload.url;
}

export async function createPortal(env: Env, customerId: string | null): Promise<string> {
  if (!customerId) throw new HttpError(409, 'No Stripe customer is linked to this account.');
  const billingConfig = requireBillingConfig(env);
  const body = new URLSearchParams({
    customer: customerId,
    return_url: billingConfig.returnUrl,
    configuration: billingConfig.portalConfigurationId,
  });
  const payload = await stripeRequest(env, 'POST', '/v1/billing_portal/sessions', body);
  if (typeof payload.url !== 'string') {
    throw new HttpError(502, 'Stripe did not return the billing portal.');
  }
  return payload.url;
}

async function stripeRequest(
  env: Env,
  method: 'GET' | 'POST',
  route: string,
  body?: URLSearchParams,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const secretKey = requireStripeSecretKey(env);
  const query = method === 'GET' && body ? `?${body.toString()}` : '';
  const response = await fetch(`https://api.stripe.com${route}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(method === 'POST' && body ? { body } : {}),
  });
  const payload = await response.json<
    Record<string, unknown> & { error?: { message?: string; type?: string } }
  >();
  if (!response.ok) {
    console.error('Stripe request failed', payload.error?.type ?? response.status);
    throw new StripeApiError(response.status);
  }
  return payload;
}

export async function verifyStripeSignature(
  body: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<void> {
  if (!signatureHeader || !secret) throw new HttpError(400, 'Missing Stripe webhook signature.');
  const values = new Map<string, string[]>();
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=', 2);
    if (!key || !value) continue;
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const timestamp = Number(values.get('t')?.[0]);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) {
    throw new HttpError(400, 'The Stripe webhook timestamp is outside the allowed window.');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = bytesToHex(new Uint8Array(digest));
  if (!(values.get('v1') ?? []).some((candidate) => constantTimeEqual(candidate, expected))) {
    throw new HttpError(400, 'The Stripe webhook signature is invalid.');
  }
}

export async function applyStripeEvent(env: Env, event: StripeEvent): Promise<void> {
  const now = new Date();
  if (!(await claimStripeEvent(env, event, now))) return;
  try {
    const object = event.data.object;
    if (event.type === 'checkout.session.completed') {
      const userId = metadataAccountId(object) ?? stringValue(object.client_reference_id);
      const customerId = objectId(object.customer);
      if (userId && customerId) {
        await ensureAccount(env, userId, now);
        await env.DB.prepare(
          `UPDATE accounts SET stripe_customer_id = COALESCE(stripe_customer_id, ?), updated_at = ?
           WHERE user_id = ?`,
        )
          .bind(customerId, now.toISOString(), userId)
          .run();
      }
    } else if (event.type.startsWith('customer.subscription.')) {
      await applySubscriptionProjection(env, object, null, now);
    } else if (event.type === 'invoice.payment_failed') {
      await updatePaymentFailure(env, object, now.toISOString());
    } else if (event.type === 'invoice.paid') {
      await updatePaymentFailure(env, object, null);
    }
    await env.DB.prepare(
      `UPDATE webhook_events SET processed_at = ?, processing_started_at = NULL, last_error = NULL
       WHERE event_id = ?`,
    )
      .bind(now.toISOString(), event.id)
      .run();
  } catch (error) {
    await env.DB.prepare(
      `UPDATE webhook_events SET processing_started_at = NULL, last_error = ? WHERE event_id = ?`,
    )
      .bind(error instanceof Error ? error.message.slice(0, 500) : 'unknown', event.id)
      .run();
    throw error;
  }
}

async function claimStripeEvent(env: Env, event: StripeEvent, now: Date): Promise<boolean> {
  const timestamp = now.toISOString();
  const stale = new Date(now.getTime() - 10 * 60 * 1_000).toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO webhook_events (event_id, event_type, received_at)
     VALUES (?, ?, ?)`,
  )
    .bind(event.id, event.type, timestamp)
    .run();
  const result = await env.DB.prepare(
    `UPDATE webhook_events SET processing_started_at = ?, event_type = ?
     WHERE event_id = ? AND processed_at IS NULL
       AND (processing_started_at IS NULL OR processing_started_at < ?)`,
  )
    .bind(timestamp, event.type, event.id, stale)
    .run();
  return result.meta.changes > 0;
}

export async function applySubscriptionProjection(
  env: Env,
  object: Record<string, unknown>,
  knownUserId: string | null = null,
  now = new Date(),
): Promise<void> {
  const customerId = objectId(object.customer);
  let userId = knownUserId ?? metadataAccountId(object);
  if (!userId && customerId) {
    userId =
      (
        await env.DB.prepare('SELECT user_id FROM accounts WHERE stripe_customer_id = ?')
          .bind(customerId)
          .first<{ user_id: string }>()
      )?.user_id ?? null;
  }
  if (!userId) {
    throw new HttpError(400, 'The Stripe subscription is missing its Cortex account mapping.');
  }
  await ensureAccount(env, userId, now);
  const priceId = subscriptionPriceId(object);
  const pricePolicy = policyForPrice(env, priceId);
  const status = normalizeBillingStatus(stringValue(object.status) ?? 'canceled');
  const entitledPlan = pricePolicy && subscriptionPermitsAi(status) ? pricePolicy.plan : 'free';
  const periodEndSeconds = subscriptionPeriodEnd(object);
  const activationSeconds =
    numberValue(object.start_date) ??
    numberValue(object.created) ??
    Math.floor(now.getTime() / 1_000);
  await env.DB.prepare(
    `UPDATE accounts SET
       plan = ?, billing_interval = ?, billing_status = ?, stripe_customer_id = ?,
       stripe_subscription_id = ?, stripe_price_id = ?, cancel_at_period_end = ?,
       subscription_current_period_end = ?,
       ai_usage_anchor = CASE WHEN ? != 'free' THEN COALESCE(ai_usage_anchor, ?) ELSE ai_usage_anchor END,
       last_stripe_reconciled_at = ?, updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(
      entitledPlan,
      pricePolicy?.interval ?? null,
      status,
      customerId,
      stringValue(object.id),
      priceId,
      object.cancel_at_period_end === true ? 1 : 0,
      periodEndSeconds ? new Date(periodEndSeconds * 1_000).toISOString() : null,
      entitledPlan,
      new Date(activationSeconds * 1_000).toISOString(),
      now.toISOString(),
      now.toISOString(),
      userId,
    )
    .run();
}

async function updatePaymentFailure(
  env: Env,
  object: Record<string, unknown>,
  failedAt: string | null,
): Promise<void> {
  const customerId = objectId(object.customer);
  const subscriptionId = objectId(object.subscription);
  if (!customerId && !subscriptionId) return;
  await env.DB.prepare(
    `UPDATE accounts SET payment_failed_at = ?, updated_at = ?
     WHERE (? IS NOT NULL AND stripe_customer_id = ?)
        OR (? IS NOT NULL AND stripe_subscription_id = ?)`,
  )
    .bind(
      failedAt,
      new Date().toISOString(),
      customerId,
      customerId,
      subscriptionId,
      subscriptionId,
    )
    .run();
}

export async function reconcileStripeAccountIfStale(
  env: Env,
  account: AccountRow,
  now = new Date(),
): Promise<void> {
  if (!env.STRIPE_SECRET_KEY || (!account.stripe_subscription_id && !account.stripe_customer_id)) {
    return;
  }
  const thresholdSeconds = Math.max(300, Number(env.STRIPE_RECONCILE_AFTER_SECONDS) || 900);
  const last = account.last_stripe_reconciled_at
    ? new Date(account.last_stripe_reconciled_at).getTime()
    : 0;
  if (now.getTime() - last < thresholdSeconds * 1_000) return;
  let subscription: Record<string, unknown> | null = null;
  if (account.stripe_subscription_id) {
    try {
      subscription = await stripeRequest(
        env,
        'GET',
        `/v1/subscriptions/${encodeURIComponent(account.stripe_subscription_id)}`,
      );
    } catch (error) {
      if (!(error instanceof StripeApiError) || error.stripeStatus !== 404) throw error;
      subscription = account.stripe_customer_id
        ? await findCurrentPaidSubscription(env, account.stripe_customer_id)
        : null;
      if (!subscription) {
        await env.DB.prepare(
          `UPDATE accounts SET plan = 'free', billing_interval = NULL,
             billing_status = 'canceled', stripe_subscription_id = NULL,
             cancel_at_period_end = 0, last_stripe_reconciled_at = ?, updated_at = ?
           WHERE user_id = ?`,
        )
          .bind(now.toISOString(), now.toISOString(), account.user_id)
          .run();
        return;
      }
    }
  } else if (account.stripe_customer_id) {
    subscription = await findCurrentPaidSubscription(env, account.stripe_customer_id);
  }
  if (subscription) {
    await applySubscriptionProjection(env, subscription, account.user_id, now);
  } else {
    await env.DB.prepare(
      'UPDATE accounts SET last_stripe_reconciled_at = ?, updated_at = ? WHERE user_id = ?',
    )
      .bind(now.toISOString(), now.toISOString(), account.user_id)
      .run();
  }
}

async function findCurrentPaidSubscription(
  env: Env,
  customerId: string,
): Promise<Record<string, unknown> | null> {
  const payload = await stripeRequest(
    env,
    'GET',
    '/v1/subscriptions',
    new URLSearchParams({ customer: customerId, status: 'all', limit: '20' }),
  );
  const subscriptions = arrayValue(payload.data);
  return (
    (subscriptions.find((subscription) => {
      const record = objectValue(subscription);
      const status = normalizeBillingStatus(stringValue(record.status) ?? 'none');
      return policyForPrice(env, subscriptionPriceId(record)) && subscriptionPermitsAi(status);
    }) as Record<string, unknown> | undefined) ?? null
  );
}

function subscriptionPriceId(object: Record<string, unknown>): string | null {
  const items = objectValue(object.items);
  const first = objectValue(arrayValue(items.data)[0]);
  return objectId(first.price) ?? stringValue(object.price_id);
}

function subscriptionPeriodEnd(object: Record<string, unknown>): number | null {
  const direct = numberValue(object.current_period_end);
  if (direct) return direct;
  const items = arrayValue(objectValue(object.items).data);
  const ends = items
    .map((item) => numberValue(objectValue(item).current_period_end))
    .filter((value): value is number => value !== null);
  return ends.length ? Math.max(...ends) : null;
}

function metadataAccountId(object: Record<string, unknown>): string | null {
  const metadata = objectValue(object.metadata);
  return stringValue(metadata.cortex_account_id) ?? stringValue(metadata.workos_user_id);
}

function objectId(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  return stringValue(objectValue(value).id);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function stableIdempotencyKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest)).slice(0, 48);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}
