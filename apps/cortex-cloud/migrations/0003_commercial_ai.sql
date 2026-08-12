PRAGMA foreign_keys = OFF;

CREATE TABLE accounts_v2 (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'creator', 'pro')),
  billing_interval TEXT CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year')),
  billing_status TEXT NOT NULL DEFAULT 'none',
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  subscription_current_period_end TEXT,
  ai_usage_anchor TEXT,
  ai_enabled INTEGER NOT NULL DEFAULT 1 CHECK (ai_enabled IN (0, 1)),
  administratively_disabled INTEGER NOT NULL DEFAULT 0 CHECK (administratively_disabled IN (0, 1)),
  payment_failed_at TEXT,
  last_stripe_reconciled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO accounts_v2 (
  user_id, plan, billing_status, stripe_customer_id, stripe_subscription_id,
  subscription_current_period_end, ai_usage_anchor, created_at, updated_at
)
SELECT
  user_id,
  CASE WHEN plan = 'pro' THEN 'pro' ELSE 'free' END,
  CASE WHEN plan = 'pro' AND billing_status = 'none' THEN 'active' ELSE billing_status END,
  stripe_customer_id,
  stripe_subscription_id,
  renewal_at,
  CASE WHEN plan = 'pro' THEN updated_at ELSE NULL END,
  updated_at,
  updated_at
FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_v2 RENAME TO accounts;

CREATE UNIQUE INDEX idx_accounts_stripe_customer ON accounts(stripe_customer_id);
CREATE UNIQUE INDEX idx_accounts_stripe_subscription ON accounts(stripe_subscription_id);

ALTER TABLE webhook_events ADD COLUMN event_type TEXT;
ALTER TABLE webhook_events ADD COLUMN processing_started_at TEXT;
ALTER TABLE webhook_events ADD COLUMN processed_at TEXT;
ALTER TABLE webhook_events ADD COLUMN last_error TEXT;

CREATE TABLE ai_usage_periods (
  user_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('creator', 'pro')),
  provider_cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK (provider_cost_microusd >= 0),
  reserved_microusd INTEGER NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  fast_runs INTEGER NOT NULL DEFAULT 0 CHECK (fast_runs >= 0),
  advanced_runs INTEGER NOT NULL DEFAULT 0 CHECK (advanced_runs >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  successful_runs INTEGER NOT NULL DEFAULT 0 CHECK (successful_runs >= 0),
  failed_runs INTEGER NOT NULL DEFAULT 0 CHECK (failed_runs >= 0),
  applied_changes INTEGER NOT NULL DEFAULT 0 CHECK (applied_changes >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, starts_at)
);

CREATE TABLE ai_run_reservations (
  user_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  period_starts_at TEXT NOT NULL,
  reasoning_mode TEXT NOT NULL CHECK (reasoning_mode IN ('fast', 'advanced')),
  plan TEXT NOT NULL CHECK (plan IN ('creator', 'pro')),
  reserved_microusd INTEGER NOT NULL CHECK (reserved_microusd > 0),
  provider_cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK (provider_cost_microusd >= 0),
  model_calls INTEGER NOT NULL DEFAULT 0 CHECK (model_calls >= 0),
  tool_turns INTEGER NOT NULL DEFAULT 0 CHECK (tool_turns >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  last_tool_signature TEXT,
  repeated_tool_calls INTEGER NOT NULL DEFAULT 0 CHECK (repeated_tool_calls >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'expired', 'circuit_breaker')),
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  aborted_reason TEXT,
  PRIMARY KEY (user_id, run_id)
);

CREATE INDEX idx_ai_reservations_active ON ai_run_reservations(user_id, status, expires_at);
CREATE INDEX idx_ai_reservations_hourly ON ai_run_reservations(user_id, started_at);

CREATE TABLE ai_usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  reasoning_mode TEXT NOT NULL CHECK (reasoning_mode IN ('fast', 'advanced')),
  plan TEXT NOT NULL CHECK (plan IN ('creator', 'pro')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  provider_cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK (provider_cost_microusd >= 0),
  tool_turns INTEGER NOT NULL DEFAULT 0 CHECK (tool_turns >= 0),
  working_context_tokens INTEGER NOT NULL DEFAULT 0 CHECK (working_context_tokens >= 0),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  success INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
  applied_change INTEGER NOT NULL DEFAULT 0 CHECK (applied_change IN (0, 1)),
  aborted_reason TEXT,
  UNIQUE (user_id, run_id)
);

CREATE INDEX idx_ai_usage_events_account_started ON ai_usage_events(user_id, started_at);
CREATE INDEX idx_ai_usage_events_plan_started ON ai_usage_events(plan, started_at);

PRAGMA foreign_keys = ON;
