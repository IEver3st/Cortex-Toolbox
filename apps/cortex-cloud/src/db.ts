import type { CortexReasoningMode } from '@cortex/ai/contracts';
import { HttpError } from './auth';
import {
  CORTEX_AI_MODEL,
  CORTEX_AI_PROVIDER,
  PLAN_POLICY,
  paidPolicy,
  runPolicy,
  usageState,
  type BillingInterval,
  type CortexPlan,
  type RunPolicy,
} from './ai-policy';
import type { Env } from './env';

export type BillingStatus =
  | 'none'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export interface AccountRow {
  user_id: string;
  plan: CortexPlan;
  billing_interval: BillingInterval | null;
  billing_status: BillingStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  cancel_at_period_end: number;
  subscription_current_period_end: string | null;
  ai_usage_anchor: string | null;
  ai_enabled: number;
  administratively_disabled: number;
  payment_failed_at: string | null;
  last_stripe_reconciled_at: string | null;
  updated_at: string;
}

interface UsageRow {
  provider_cost_microusd: number;
  reserved_microusd: number;
  fast_runs: number;
  advanced_runs: number;
}

interface ReservationRow {
  plan: Exclude<CortexPlan, 'free'>;
  reasoning_mode: CortexReasoningMode;
  reserved_microusd: number;
  provider_cost_microusd: number;
  tool_turns: number;
  status: string;
  expires_at: string;
}

const RUN_RESERVATION_TTL_MS = 15 * 60 * 1_000;
const MIN_RUN_AUTHORIZATION: Record<CortexReasoningMode, number> = {
  fast: 2_500,
  advanced: 5_000,
};
const BASETEN_INPUT_MICROUSD_PER_100_TOKENS = 13;
const BASETEN_OUTPUT_MICROUSD_PER_100_TOKENS = 26;

export function envFlag(value: string | undefined, defaultValue = true): boolean {
  if (value === undefined || value === '') return defaultValue;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

export function subscriptionPermitsAi(status: BillingStatus): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

export function normalizeBillingStatus(status: string): BillingStatus {
  if (
    [
      'active',
      'trialing',
      'past_due',
      'unpaid',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'paused',
    ].includes(status)
  ) {
    return status as BillingStatus;
  }
  return 'none';
}

export function usagePeriod(
  anchorValue: string | Date,
  now = new Date(),
): { startsAt: string; endsAt: string } {
  const anchor = anchorValue instanceof Date ? anchorValue : new Date(anchorValue);
  const safeAnchor = Number.isNaN(anchor.getTime()) ? now : anchor;
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let start = anchoredBoundary(safeAnchor, year, month);
  if (now.getTime() < start.getTime()) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    start = anchoredBoundary(safeAnchor, year, month);
  }
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  return {
    startsAt: start.toISOString(),
    endsAt: anchoredBoundary(safeAnchor, nextYear, nextMonth).toISOString(),
  };
}

function anchoredBoundary(anchor: Date, year: number, month: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

export async function ensureAccount(env: Env, userId: string, now = new Date()): Promise<void> {
  const timestamp = now.toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO accounts
      (user_id, plan, billing_status, created_at, updated_at)
     VALUES (?, 'free', 'none', ?, ?)`,
  )
    .bind(userId, timestamp, timestamp)
    .run();
}

export async function getAccountRow(env: Env, userId: string): Promise<AccountRow> {
  await ensureAccount(env, userId);
  const row = await env.DB.prepare('SELECT * FROM accounts WHERE user_id = ?')
    .bind(userId)
    .first<AccountRow>();
  if (!row) throw new HttpError(500, 'Cortex could not load this account.');
  return row;
}

export async function getAccountSummary(env: Env, userId: string, now = new Date()) {
  const account = await getAccountRow(env, userId);
  const paid = paidPolicy(account.plan);
  const statusAllowsAi = subscriptionPermitsAi(account.billing_status);
  const globallyEnabled = envFlag(env.CORTEX_AI_ENABLED) && envFlag(env.AI_PROVIDER_ENABLED);
  const entitled = Boolean(paid && statusAllowsAi);
  let usage = {
    percent: 0,
    state: 'used' as ReturnType<typeof usageState>,
    resetsAt: null as string | null,
  };

  if (paid && account.ai_usage_anchor) {
    const paidPlan = account.plan as Exclude<CortexPlan, 'free'>;
    const period = usagePeriod(account.ai_usage_anchor, now);
    await ensureUsagePeriod(env, userId, period, paidPlan, now);
    const row = await env.DB.prepare(
      `SELECT provider_cost_microusd, reserved_microusd, fast_runs, advanced_runs
       FROM ai_usage_periods WHERE user_id = ? AND starts_at = ?`,
    )
      .bind(userId, period.startsAt)
      .first<UsageRow>();
    const used = row?.provider_cost_microusd ?? 0;
    usage = {
      percent: Math.max(
        0,
        Math.min(100, Math.round((used / paid.monthlyHardBudgetMicrousd) * 100)),
      ),
      state: usageState(used, paid.monthlySoftBudgetMicrousd, paid.monthlyHardBudgetMicrousd),
      resetsAt: period.endsAt,
    };
  }

  return {
    plan: account.plan,
    billing: {
      interval: account.billing_interval,
      subscriptionStatus: account.billing_status,
      cancelAtPeriodEnd: account.cancel_at_period_end === 1,
      renewsAt: account.subscription_current_period_end,
      stripeCustomerPresent: Boolean(account.stripe_customer_id),
      paymentFailed: Boolean(account.payment_failed_at),
    },
    ai: {
      entitled,
      enabled:
        globallyEnabled &&
        entitled &&
        account.ai_enabled === 1 &&
        account.administratively_disabled === 0,
      usage,
      limits: { concurrentRuns: paid?.concurrency ?? 0 },
    },
    stripeCustomerId: account.stripe_customer_id,
    stripeSubscriptionId: account.stripe_subscription_id,
    lastStripeReconciledAt: account.last_stripe_reconciled_at,
  };
}

async function ensureUsagePeriod(
  env: Env,
  userId: string,
  period: { startsAt: string; endsAt: string },
  plan: Exclude<CortexPlan, 'free'>,
  now = new Date(),
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ai_usage_periods (user_id, starts_at, ends_at, plan, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, starts_at) DO UPDATE SET
       ends_at = excluded.ends_at,
       plan = excluded.plan,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, period.startsAt, period.endsAt, plan, now.toISOString())
    .run();
}

export interface RunAuthorization {
  plan: Exclude<CortexPlan, 'free'>;
  reasoningMode: CortexReasoningMode;
  policy: RunPolicy;
  maxTokens: number;
  toolTurnsUsed: number;
}

export async function authorizeRunCall(
  env: Env,
  userId: string,
  input: {
    runId: string;
    reasoningMode: CortexReasoningMode;
    final: boolean;
    workingContextTokens: number;
    toolSignature?: string | null;
  },
  now = new Date(),
): Promise<RunAuthorization> {
  await cleanupExpiredReservations(env, userId, now);
  const account = await getAccountRow(env, userId);
  const policy = paidPolicy(account.plan);
  if (!policy || !subscriptionPermitsAi(account.billing_status)) {
    throw new HttpError(402, 'Cortex AI is available with Creator or Pro.');
  }
  if (!envFlag(env.CORTEX_AI_ENABLED) || !envFlag(env.AI_PROVIDER_ENABLED)) {
    throw new HttpError(503, 'Cortex AI is temporarily unavailable.');
  }
  if (account.ai_enabled !== 1 || account.administratively_disabled === 1) {
    throw new HttpError(403, 'Cortex AI is not enabled for this account.');
  }
  const selectedRunPolicy = runPolicy(account.plan, input.reasoningMode);
  if (!selectedRunPolicy) throw new HttpError(402, 'Cortex AI requires a paid plan.');
  if (input.workingContextTokens > selectedRunPolicy.contextTokens) {
    throw new HttpError(413, 'Cortex AI context is too large for this plan and reasoning mode.');
  }
  const anchor = account.ai_usage_anchor ?? now.toISOString();
  const paidPlan = account.plan as Exclude<CortexPlan, 'free'>;
  if (!account.ai_usage_anchor) {
    await env.DB.prepare(
      'UPDATE accounts SET ai_usage_anchor = ?, updated_at = ? WHERE user_id = ? AND ai_usage_anchor IS NULL',
    )
      .bind(anchor, now.toISOString(), userId)
      .run();
  }
  const period = usagePeriod(anchor, now);
  await ensureUsagePeriod(env, userId, period, paidPlan, now);
  let reservation = await getReservation(env, userId, input.runId);
  if (!reservation) {
    await createReservation(env, userId, input.runId, input.reasoningMode, paidPlan, period, now);
    reservation = await getReservation(env, userId, input.runId);
  }
  if (reservation?.status !== 'active') {
    throw new HttpError(409, 'This Cortex AI run is no longer active.');
  }
  if (reservation.reasoning_mode !== input.reasoningMode) {
    throw new HttpError(400, 'A Cortex AI run cannot change reasoning mode after it starts.');
  }
  if (!input.final && reservation.tool_turns >= selectedRunPolicy.toolTurns) {
    throw new HttpError(429, 'Cortex AI reached the workspace tool-turn limit for this run.');
  }
  if (input.toolSignature) {
    await recordToolSignature(env, userId, input.runId, input.toolSignature);
  }
  const remainingMicrousd = reservation.reserved_microusd - reservation.provider_cost_microusd;
  if (remainingMicrousd <= 0) {
    await completeRun(env, userId, input.runId, false, 'run_cost_circuit_breaker', now);
    throw new HttpError(429, 'Cortex AI reached the safe cost limit for this run.');
  }
  const inputEstimate = Math.ceil(
    (input.workingContextTokens * BASETEN_INPUT_MICROUSD_PER_100_TOKENS) / 100,
  );
  const outputBudget = Math.floor(
    (Math.max(0, remainingMicrousd - inputEstimate) * 100) / BASETEN_OUTPUT_MICROUSD_PER_100_TOKENS,
  );
  const maxTokens = Math.min(selectedRunPolicy.outputReasoningTokens, outputBudget);
  if (maxTokens < 64) {
    await completeRun(env, userId, input.runId, false, 'run_cost_circuit_breaker', now);
    throw new HttpError(429, 'Cortex AI reached the safe cost limit for this run.');
  }
  await env.DB.prepare(
    `UPDATE ai_run_reservations
     SET model_calls = model_calls + 1, expires_at = ?
     WHERE user_id = ? AND run_id = ? AND status = 'active'`,
  )
    .bind(new Date(now.getTime() + RUN_RESERVATION_TTL_MS).toISOString(), userId, input.runId)
    .run();
  await env.DB.prepare(
    `UPDATE ai_usage_events SET working_context_tokens = MAX(working_context_tokens, ?)
     WHERE user_id = ? AND run_id = ?`,
  )
    .bind(input.workingContextTokens, userId, input.runId)
    .run();
  return {
    plan: reservation.plan,
    reasoningMode: reservation.reasoning_mode,
    policy: selectedRunPolicy,
    maxTokens,
    toolTurnsUsed: reservation.tool_turns,
  };
}

async function createReservation(
  env: Env,
  userId: string,
  runId: string,
  mode: CortexReasoningMode,
  plan: Exclude<CortexPlan, 'free'>,
  period: { startsAt: string; endsAt: string },
  now: Date,
): Promise<void> {
  const policy = PLAN_POLICY[plan];
  const run = policy[mode];
  const usage = await env.DB.prepare(
    'SELECT provider_cost_microusd, reserved_microusd FROM ai_usage_periods WHERE user_id = ? AND starts_at = ?',
  )
    .bind(userId, period.startsAt)
    .first<Pick<UsageRow, 'provider_cost_microusd' | 'reserved_microusd'>>();
  const remaining =
    policy.monthlyHardBudgetMicrousd -
    (usage?.provider_cost_microusd ?? 0) -
    (usage?.reserved_microusd ?? 0);
  if (remaining < MIN_RUN_AUTHORIZATION[mode]) {
    throw new HttpError(402, "You've used this month's Cortex AI capacity.");
  }
  const reserveMicrousd = Math.min(run.runCostMicrousd, remaining);
  const startedAt = now.toISOString();
  const hourlyStart = new Date(now.getTime() - 60 * 60 * 1_000).toISOString();
  const expiresAt = new Date(now.getTime() + RUN_RESERVATION_TTL_MS).toISOString();
  const statements = [
    env.DB.prepare(
      `INSERT INTO ai_run_reservations
        (user_id, run_id, period_starts_at, reasoning_mode, plan, reserved_microusd,
         started_at, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       FROM ai_usage_periods p
       WHERE p.user_id = ? AND p.starts_at = ?
         AND p.provider_cost_microusd + p.reserved_microusd + ? <= ?
         AND (SELECT COUNT(*) FROM ai_run_reservations r
              WHERE r.user_id = ? AND r.status = 'active' AND r.expires_at > ?) < ?
         AND (SELECT COUNT(*) FROM ai_run_reservations r
              WHERE r.user_id = ? AND r.started_at > ?) < ?
       ON CONFLICT(user_id, run_id) DO NOTHING`,
    ).bind(
      userId,
      runId,
      period.startsAt,
      mode,
      plan,
      reserveMicrousd,
      startedAt,
      expiresAt,
      userId,
      period.startsAt,
      reserveMicrousd,
      policy.monthlyHardBudgetMicrousd,
      userId,
      startedAt,
      policy.concurrency,
      userId,
      hourlyStart,
      policy.hourlyRuns,
    ),
    env.DB.prepare(
      `UPDATE ai_usage_periods SET
         reserved_microusd = reserved_microusd + ?,
         fast_runs = fast_runs + ?,
         advanced_runs = advanced_runs + ?,
         updated_at = ?
       WHERE user_id = ? AND starts_at = ?
         AND EXISTS (SELECT 1 FROM ai_run_reservations r
           WHERE r.user_id = ? AND r.run_id = ? AND r.started_at = ?)`,
    ).bind(
      reserveMicrousd,
      mode === 'fast' ? 1 : 0,
      mode === 'advanced' ? 1 : 0,
      startedAt,
      userId,
      period.startsAt,
      userId,
      runId,
      startedAt,
    ),
    env.DB.prepare(
      `INSERT INTO ai_usage_events
        (id, user_id, run_id, reasoning_mode, plan, provider, model, started_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM ai_run_reservations r
         WHERE r.user_id = ? AND r.run_id = ? AND r.started_at = ?)
       ON CONFLICT(user_id, run_id) DO NOTHING`,
    ).bind(
      crypto.randomUUID(),
      userId,
      runId,
      mode,
      plan,
      CORTEX_AI_PROVIDER,
      CORTEX_AI_MODEL,
      startedAt,
      userId,
      runId,
      startedAt,
    ),
  ];
  const results = await env.DB.batch(statements);
  if ((results[0]?.meta.changes ?? 0) > 0) return;
  const active = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM ai_run_reservations
     WHERE user_id = ? AND status = 'active' AND expires_at > ?`,
  )
    .bind(userId, startedAt)
    .first<{ count: number }>();
  if ((active?.count ?? 0) >= policy.concurrency) {
    throw new HttpError(409, 'This account already has the maximum active Cortex AI runs.');
  }
  const hourly = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM ai_run_reservations WHERE user_id = ? AND started_at > ?',
  )
    .bind(userId, hourlyStart)
    .first<{ count: number }>();
  if ((hourly?.count ?? 0) >= policy.hourlyRuns) {
    throw new HttpError(429, 'Cortex AI is receiving too many run starts. Try again later.');
  }
  throw new HttpError(402, "You've used this month's Cortex AI capacity.");
}

async function getReservation(
  env: Env,
  userId: string,
  runId: string,
): Promise<ReservationRow | null> {
  return env.DB.prepare(
    `SELECT plan, reasoning_mode, reserved_microusd, provider_cost_microusd,
      tool_turns, status, expires_at
     FROM ai_run_reservations WHERE user_id = ? AND run_id = ?`,
  )
    .bind(userId, runId)
    .first<ReservationRow>();
}

async function cleanupExpiredReservations(env: Env, userId: string, now: Date): Promise<void> {
  const timestamp = now.toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE ai_usage_periods SET
         reserved_microusd = MAX(0, reserved_microusd - COALESCE((
           SELECT SUM(MAX(0, r.reserved_microusd - r.provider_cost_microusd))
           FROM ai_run_reservations r
           WHERE r.user_id = ai_usage_periods.user_id
             AND r.period_starts_at = ai_usage_periods.starts_at
             AND r.status = 'active' AND r.expires_at <= ?
         ), 0)),
         failed_runs = failed_runs + COALESCE((
           SELECT COUNT(*) FROM ai_run_reservations r
           WHERE r.user_id = ai_usage_periods.user_id
             AND r.period_starts_at = ai_usage_periods.starts_at
             AND r.status = 'active' AND r.expires_at <= ?
         ), 0),
         updated_at = ?
       WHERE user_id = ? AND EXISTS (
         SELECT 1 FROM ai_run_reservations r
         WHERE r.user_id = ? AND r.period_starts_at = ai_usage_periods.starts_at
           AND r.status = 'active' AND r.expires_at <= ?
       )`,
    ).bind(timestamp, timestamp, timestamp, userId, userId, timestamp),
    env.DB.prepare(
      `UPDATE ai_run_reservations SET status = 'expired', completed_at = ?,
         aborted_reason = 'reservation_expired'
       WHERE user_id = ? AND status = 'active' AND expires_at <= ?`,
    ).bind(timestamp, userId, timestamp),
    env.DB.prepare(
      `UPDATE ai_usage_events SET completed_at = ?, aborted_reason = 'reservation_expired'
       WHERE user_id = ? AND completed_at IS NULL AND EXISTS (
         SELECT 1 FROM ai_run_reservations r
         WHERE r.user_id = ai_usage_events.user_id AND r.run_id = ai_usage_events.run_id
           AND r.status = 'expired'
       )`,
    ).bind(timestamp, userId),
  ]);
}

async function recordToolSignature(
  env: Env,
  userId: string,
  runId: string,
  signature: string,
): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT last_tool_signature, repeated_tool_calls FROM ai_run_reservations WHERE user_id = ? AND run_id = ?',
  )
    .bind(userId, runId)
    .first<{ last_tool_signature: string | null; repeated_tool_calls: number }>();
  const repeated = row?.last_tool_signature === signature ? row.repeated_tool_calls + 1 : 0;
  await env.DB.prepare(
    'UPDATE ai_run_reservations SET last_tool_signature = ?, repeated_tool_calls = ? WHERE user_id = ? AND run_id = ?',
  )
    .bind(signature, repeated, userId, runId)
    .run();
  if (repeated >= 2) {
    await completeRun(env, userId, runId, false, 'repeated_tool_loop');
    throw new HttpError(429, 'Cortex AI stopped a repeated workspace tool loop.');
  }
}

export interface ProviderUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  providerCostMicrousd: number;
}

export function parseProviderUsage(payload: unknown): ProviderUsage | null {
  if (!payload || typeof payload !== 'object') return null;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return null;
  const values = usage as Record<string, unknown>;
  const completionDetails = objectValue(values.completion_tokens_details);
  const promptDetails = objectValue(values.prompt_tokens_details);
  return {
    inputTokens: nonnegativeInteger(values.prompt_tokens ?? values.input_tokens),
    cachedInputTokens: nonnegativeInteger(
      values.cached_tokens ?? promptDetails.cached_tokens ?? promptDetails.cache_read_tokens,
    ),
    outputTokens: nonnegativeInteger(values.completion_tokens ?? values.output_tokens),
    reasoningTokens: nonnegativeInteger(
      values.reasoning_tokens ?? completionDetails.reasoning_tokens,
    ),
    providerCostMicrousd: dollarsToMicrousd(values.cost),
  };
}

export function dollarsToMicrousd(value: unknown): number {
  const dollars =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : 0;
  return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 1_000_000) : 0;
}

export async function recordProviderUsage(
  env: Env,
  userId: string,
  runId: string,
  usage: ProviderUsage,
  toolTurns = 0,
): Promise<void> {
  const reservation = await getReservation(env, userId, runId);
  if (reservation?.status !== 'active') return;
  const releasable = Math.min(
    usage.providerCostMicrousd,
    Math.max(0, reservation.reserved_microusd - reservation.provider_cost_microusd),
  );
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE ai_usage_periods SET
         provider_cost_microusd = provider_cost_microusd + ?,
         reserved_microusd = MAX(0, reserved_microusd - ?),
         input_tokens = input_tokens + ?,
         cached_input_tokens = cached_input_tokens + ?,
         output_tokens = output_tokens + ?,
         reasoning_tokens = reasoning_tokens + ?,
         updated_at = ?
       WHERE user_id = ? AND starts_at = (
         SELECT period_starts_at FROM ai_run_reservations WHERE user_id = ? AND run_id = ?
       )`,
    ).bind(
      usage.providerCostMicrousd,
      releasable,
      usage.inputTokens,
      usage.cachedInputTokens,
      usage.outputTokens,
      usage.reasoningTokens,
      now,
      userId,
      userId,
      runId,
    ),
    env.DB.prepare(
      `UPDATE ai_run_reservations SET
         provider_cost_microusd = provider_cost_microusd + ?,
         tool_turns = tool_turns + ?, input_tokens = input_tokens + ?,
         cached_input_tokens = cached_input_tokens + ?, output_tokens = output_tokens + ?,
         reasoning_tokens = reasoning_tokens + ?
       WHERE user_id = ? AND run_id = ? AND status = 'active'`,
    ).bind(
      usage.providerCostMicrousd,
      toolTurns,
      usage.inputTokens,
      usage.cachedInputTokens,
      usage.outputTokens,
      usage.reasoningTokens,
      userId,
      runId,
    ),
    env.DB.prepare(
      `UPDATE ai_usage_events SET
         provider_cost_microusd = provider_cost_microusd + ?,
         tool_turns = tool_turns + ?, input_tokens = input_tokens + ?,
         cached_input_tokens = cached_input_tokens + ?, output_tokens = output_tokens + ?,
         reasoning_tokens = reasoning_tokens + ?
       WHERE user_id = ? AND run_id = ?`,
    ).bind(
      usage.providerCostMicrousd,
      toolTurns,
      usage.inputTokens,
      usage.cachedInputTokens,
      usage.outputTokens,
      usage.reasoningTokens,
      userId,
      runId,
    ),
  ]);
}

export async function completeRun(
  env: Env,
  userId: string,
  runId: string,
  success: boolean,
  abortedReason: string | null = null,
  now = new Date(),
): Promise<void> {
  const reservation = await getReservation(env, userId, runId);
  if (reservation?.status !== 'active') return;
  const release = Math.max(0, reservation.reserved_microusd - reservation.provider_cost_microusd);
  const completedAt = now.toISOString();
  const status = success
    ? 'completed'
    : abortedReason === 'run_cost_circuit_breaker'
      ? 'circuit_breaker'
      : 'failed';
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE ai_usage_periods SET reserved_microusd = MAX(0, reserved_microusd - ?),
         successful_runs = successful_runs + ?, failed_runs = failed_runs + ?, updated_at = ?
       WHERE user_id = ? AND starts_at = (
         SELECT period_starts_at FROM ai_run_reservations
         WHERE user_id = ? AND run_id = ? AND status = 'active'
       )`,
    ).bind(release, success ? 1 : 0, success ? 0 : 1, completedAt, userId, userId, runId),
    env.DB.prepare(
      `UPDATE ai_run_reservations SET status = ?, completed_at = ?, aborted_reason = ?
       WHERE user_id = ? AND run_id = ? AND status = 'active'`,
    ).bind(status, completedAt, abortedReason, userId, runId),
    env.DB.prepare(
      `UPDATE ai_usage_events SET completed_at = ?, success = ?, aborted_reason = ?
       WHERE user_id = ? AND run_id = ?`,
    ).bind(completedAt, success ? 1 : 0, abortedReason, userId, runId),
  ]);
}

export async function markRunAppliedChange(env: Env, userId: string, runId: string): Promise<void> {
  const changed = await env.DB.prepare(
    `UPDATE ai_usage_events SET applied_change = 1
     WHERE user_id = ? AND run_id = ? AND applied_change = 0`,
  )
    .bind(userId, runId)
    .run();
  if (changed.meta.changes === 0) return;
  await env.DB.prepare(
    `UPDATE ai_usage_periods SET applied_changes = applied_changes + 1, updated_at = ?
     WHERE user_id = ? AND starts_at = (
       SELECT period_starts_at FROM ai_run_reservations WHERE user_id = ? AND run_id = ?
     )`,
  )
    .bind(new Date().toISOString(), userId, userId, runId)
    .run();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function nonnegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

export async function getCommercialMetrics(env: Env, since: Date) {
  const periods = await env.DB.prepare(
    `SELECT plan, provider_cost_microusd FROM ai_usage_periods WHERE starts_at >= ?`,
  )
    .bind(since.toISOString())
    .all<{ plan: 'creator' | 'pro'; provider_cost_microusd: number }>();
  const events = await env.DB.prepare(
    `SELECT reasoning_mode, provider_cost_microusd, input_tokens, cached_input_tokens,
       tool_turns, working_context_tokens, success, applied_change, aborted_reason
     FROM ai_usage_events WHERE started_at >= ? LIMIT 10000`,
  )
    .bind(since.toISOString())
    .all<{
      reasoning_mode: CortexReasoningMode;
      provider_cost_microusd: number;
      input_tokens: number;
      cached_input_tokens: number;
      tool_turns: number;
      working_context_tokens: number;
      success: number;
      applied_change: number;
      aborted_reason: string | null;
    }>();
  const accounts = await env.DB.prepare(
    `SELECT COUNT(*) AS accounts,
       SUM(CASE WHEN plan IN ('creator', 'pro') THEN 1 ELSE 0 END) AS paid
     FROM accounts`,
  ).first<{ accounts: number; paid: number }>();
  const periodRows = periods.results;
  const eventRows = events.results;
  const costs = (plan: 'creator' | 'pro') =>
    periodRows.filter((row) => row.plan === plan).map((row) => row.provider_cost_microusd);
  const modeMetrics = (mode: CortexReasoningMode) => {
    const rows = eventRows.filter((row) => row.reasoning_mode === mode);
    const successful = rows.filter((row) => row.success === 1);
    const applied = rows.filter((row) => row.applied_change === 1);
    return {
      costPerSuccessfulRunMicrousd: ratio(
        sum(successful, 'provider_cost_microusd'),
        successful.length,
      ),
      costPerAppliedChangeMicrousd: ratio(sum(applied, 'provider_cost_microusd'), applied.length),
    };
  };
  const totalInput = sum(eventRows, 'input_tokens');
  const providerErrors = eventRows.filter((row) =>
    row.aborted_reason?.startsWith('provider_'),
  ).length;
  return {
    since: since.toISOString(),
    monthlyCogsMicrousd: {
      creator: percentileSet(costs('creator'), [0.5, 0.9, 0.99]),
      pro: percentileSet(costs('pro'), [0.5, 0.9]),
    },
    modes: { fast: modeMetrics('fast'), advanced: modeMetrics('advanced') },
    cacheReadShare: ratio(sum(eventRows, 'cached_input_tokens'), totalInput),
    toolLoopAbortRate: ratio(
      eventRows.filter((row) => row.aborted_reason === 'repeated_tool_loop').length,
      eventRows.length,
    ),
    hardCapHitRate: ratio(
      periodRows.filter(
        (row) => row.provider_cost_microusd >= PLAN_POLICY[row.plan].monthlyHardBudgetMicrousd,
      ).length,
      periodRows.length,
    ),
    softCapHitRate: ratio(
      periodRows.filter(
        (row) => row.provider_cost_microusd >= PLAN_POLICY[row.plan].monthlySoftBudgetMicrousd,
      ).length,
      periodRows.length,
    ),
    averageToolTurns: ratio(sum(eventRows, 'tool_turns'), eventRows.length),
    averageWorkingContextTokens: ratio(sum(eventRows, 'working_context_tokens'), eventRows.length),
    providerErrorRate: ratio(providerErrors, eventRows.length),
    basetenErrorRate: ratio(providerErrors, eventRows.length),
    subscriptionConversion: ratio(accounts?.paid ?? 0, accounts?.accounts ?? 0),
    sample: { periods: periodRows.length, runs: eventRows.length },
  };
}

function sum<T extends Record<K, number>, K extends keyof T>(rows: T[], key: K): number {
  return rows.reduce((total, row) => total + row[key], 0);
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function percentileSet(values: number[], percentiles: number[]): Record<string, number> {
  const sorted = [...values].sort((left, right) => left - right);
  return Object.fromEntries(
    percentiles.map((percentile) => {
      const index = sorted.length ? Math.ceil(percentile * sorted.length) - 1 : 0;
      return [`p${Math.round(percentile * 100)}`, sorted[index] ?? 0];
    }),
  );
}
