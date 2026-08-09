CREATE TABLE IF NOT EXISTS accounts (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  billing_status TEXT NOT NULL DEFAULT 'none',
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  renewal_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_periods (
  user_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, period_key)
);

CREATE TABLE IF NOT EXISTS ai_runs (
  user_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 0 CHECK (turn_count >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, run_id)
);

CREATE TABLE IF NOT EXISTS ai_locks (
  user_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_stripe_customer ON accounts(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_period ON ai_runs(user_id, period_key);
