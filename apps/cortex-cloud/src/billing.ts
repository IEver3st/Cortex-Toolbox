import { HttpError } from './auth';
import { normalizeBillingStatus, planForStripeStatus } from './db';
import type { Env } from './env';

export async function createCheckout(
  env: Env,
  userId: string,
  cadence: 'monthly' | 'annual',
  customerId: string | null,
): Promise<string> {
  const priceId =
    cadence === 'annual' ? env.STRIPE_PRO_ANNUAL_PRICE_ID : env.STRIPE_PRO_MONTHLY_PRICE_ID;
  if (!priceId || !env.BILLING_RETURN_URL) throw new HttpError(503, 'Billing is not configured.');
  const form = new URLSearchParams({
    mode: 'subscription',
    client_reference_id: userId,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'subscription_data[metadata][workos_user_id]': userId,
    'metadata[workos_user_id]': userId,
    allow_promotion_codes: 'true',
    success_url: `${env.BILLING_RETURN_URL}?checkout=success`,
    cancel_url: `${env.BILLING_RETURN_URL}?checkout=cancelled`,
  });
  if (customerId) form.set('customer', customerId);
  const payload = await stripeRequest(env, '/v1/checkout/sessions', form);
  if (typeof payload.url !== 'string') throw new HttpError(502, 'Stripe did not return Checkout.');
  return payload.url;
}

export async function createPortal(env: Env, customerId: string | null): Promise<string> {
  if (!customerId) throw new HttpError(409, 'No Stripe customer is linked to this account.');
  const payload = await stripeRequest(
    env,
    '/v1/billing_portal/sessions',
    new URLSearchParams({ customer: customerId, return_url: env.BILLING_RETURN_URL }),
  );
  if (typeof payload.url !== 'string')
    throw new HttpError(502, 'Stripe did not return the billing portal.');
  return payload.url;
}

async function stripeRequest(
  env: Env,
  route: string,
  body: URLSearchParams,
): Promise<Record<string, unknown>> {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Billing is not configured.');
  const response = await fetch(`https://api.stripe.com${route}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const payload = await response.json<
    Record<string, unknown> & {
      error?: { message?: string };
    }
  >();
  if (!response.ok)
    throw new HttpError(502, payload.error?.message ?? 'Stripe rejected the request.');
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
  const valid = (values.get('v1') ?? []).some((candidate) =>
    constantTimeEqual(candidate, expected),
  );
  if (!valid) throw new HttpError(400, 'The Stripe webhook signature is invalid.');
}

export async function applyStripeEvent(env: Env, event: StripeEvent): Promise<void> {
  const inserted = await env.DB.prepare(
    'INSERT OR IGNORE INTO webhook_events (event_id, received_at) VALUES (?, ?)',
  )
    .bind(event.id, new Date().toISOString())
    .run();
  if (inserted.meta.changes === 0) return;
  const object = event.data.object;
  if (event.type === 'checkout.session.completed') {
    const userId = stringValue(object.client_reference_id) ?? metadataUserId(object);
    const customerId = objectId(object.customer);
    if (userId && customerId) {
      await ensureAccount(env, userId);
      await env.DB.prepare(
        'UPDATE accounts SET stripe_customer_id = ?, updated_at = ? WHERE user_id = ?',
      )
        .bind(customerId, new Date().toISOString(), userId)
        .run();
    }
    return;
  }
  if (!event.type.startsWith('customer.subscription.')) return;
  const customerId = objectId(object.customer);
  let userId = metadataUserId(object);
  if (!userId && customerId) {
    userId =
      (
        await env.DB.prepare('SELECT user_id FROM accounts WHERE stripe_customer_id = ?')
          .bind(customerId)
          .first<{ user_id: string }>()
      )?.user_id ?? null;
  }
  if (!userId)
    throw new HttpError(400, 'The Stripe subscription is missing its WorkOS user mapping.');
  await ensureAccount(env, userId);
  const status = stringValue(object.status) ?? 'canceled';
  const renewalSeconds = numberValue(object.current_period_end);
  await env.DB.prepare(
    `UPDATE accounts SET plan = ?, billing_status = ?, stripe_customer_id = ?,
      stripe_subscription_id = ?, renewal_at = ?, updated_at = ? WHERE user_id = ?`,
  )
    .bind(
      planForStripeStatus(status),
      normalizeBillingStatus(status),
      customerId,
      stringValue(object.id),
      renewalSeconds ? new Date(renewalSeconds * 1_000).toISOString() : null,
      new Date().toISOString(),
      userId,
    )
    .run();
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

async function ensureAccount(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO accounts (user_id, plan, billing_status, updated_at) VALUES (?, 'free', 'none', ?)",
  )
    .bind(userId, new Date().toISOString())
    .run();
}

function metadataUserId(object: Record<string, unknown>): string | null {
  const metadata = object.metadata;
  return metadata && typeof metadata === 'object'
    ? stringValue((metadata as Record<string, unknown>).workos_user_id)
    : null;
}

function objectId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object'
    ? stringValue((value as Record<string, unknown>).id)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
