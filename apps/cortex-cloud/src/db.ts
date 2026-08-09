import { HttpError } from './auth';
import type { Env } from './env';

export type CortexPlan = 'free' | 'pro';
export type BillingStatus = 'none' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

interface AccountRow {
  plan: CortexPlan;
  billing_status: BillingStatus;
  stripe_customer_id: string | null;
  renewal_at: string | null;
}

export const PLAN_LIMITS: Record<CortexPlan, number> = { free: 25, pro: 1_000 };
const RUN_LOCK_TTL_MS = 2 * 60 * 1_000;
export const MAX_RUN_REQUESTS = 10;

export function usagePeriod(now = new Date()): { key: string; end: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    end: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
}

export async function getAccountSummary(env: Env, userId: string) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO accounts (user_id, plan, billing_status, updated_at) VALUES (?, 'free', 'none', ?)",
  )
    .bind(userId, now)
    .run();
  const account = await env.DB.prepare(
    'SELECT plan, billing_status, stripe_customer_id, renewal_at FROM accounts WHERE user_id = ?',
  )
    .bind(userId)
    .first<AccountRow>();
  if (!account) throw new HttpError(500, 'Cortex could not load this account.');
  const period = usagePeriod();
  const usage = await env.DB.prepare(
    'SELECT request_count FROM usage_periods WHERE user_id = ? AND period_key = ?',
  )
    .bind(userId, period.key)
    .first<{ request_count: number }>();
  const used = usage?.request_count ?? 0;
  const limit = PLAN_LIMITS[account.plan];
  return {
    plan: account.plan,
    usage: { used, limit, remaining: Math.max(0, limit - used), periodEnd: period.end },
    billing: { status: account.billing_status, renewalDate: account.renewal_at },
    stripeCustomerId: account.stripe_customer_id,
  };
}

export async function acquireRun(env: Env, userId: string, runId: string): Promise<void> {
  const now = Date.now();
  const result = await env.DB.prepare(
    `INSERT INTO ai_locks (user_id, run_id, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET run_id = excluded.run_id, expires_at = excluded.expires_at
     WHERE ai_locks.run_id = excluded.run_id OR ai_locks.expires_at < ?`,
  )
    .bind(userId, runId, now + RUN_LOCK_TTL_MS, now)
    .run();
  if (result.meta.changes === 0) {
    throw new HttpError(409, 'Another Cortex AI run is already active for this account.');
  }
}

export async function reserveRunUsage(env: Env, userId: string, runId: string): Promise<void> {
  const period = usagePeriod();
  const existing = await env.DB.prepare('SELECT 1 FROM ai_runs WHERE user_id = ? AND run_id = ?')
    .bind(userId, runId)
    .first();
  if (existing) return;
  const account = await getAccountSummary(env, userId);
  if (account.usage.used >= account.usage.limit) {
    throw new HttpError(
      402,
      'You have used your managed AI allowance for this month. Use an OpenRouter key or manage your plan.',
    );
  }
  const inserted = await env.DB.prepare(
    'INSERT OR IGNORE INTO ai_runs (user_id, run_id, period_key, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(userId, runId, period.key, new Date().toISOString())
    .run();
  if (inserted.meta.changes > 0) {
    await env.DB.prepare(
      `INSERT INTO usage_periods (user_id, period_key, request_count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, period_key) DO UPDATE SET request_count = request_count + 1`,
    )
      .bind(userId, period.key)
      .run();
  }
}

export async function recordRunRequest(env: Env, userId: string, runId: string): Promise<void> {
  const result = await env.DB.prepare(
    'UPDATE ai_runs SET turn_count = turn_count + 1 WHERE user_id = ? AND run_id = ? AND turn_count < ?',
  )
    .bind(userId, runId, MAX_RUN_REQUESTS)
    .run();
  if (result.meta.changes === 0) {
    throw new HttpError(429, 'Cortex AI reached the hosted tool-turn limit for this request.');
  }
}

export async function releaseRun(env: Env, userId: string, runId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM ai_locks WHERE user_id = ? AND run_id = ?')
    .bind(userId, runId)
    .run();
}

export function planForStripeStatus(status: string): CortexPlan {
  return status === 'active' || status === 'trialing' ? 'pro' : 'free';
}

export function normalizeBillingStatus(status: string): BillingStatus {
  if (['active', 'trialing', 'past_due', 'canceled', 'unpaid'].includes(status)) {
    return status as BillingStatus;
  }
  return 'none';
}
