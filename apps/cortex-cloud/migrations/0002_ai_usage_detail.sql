ALTER TABLE usage_periods ADD COLUMN fast_runs INTEGER NOT NULL DEFAULT 0 CHECK (fast_runs >= 0);
ALTER TABLE usage_periods ADD COLUMN advanced_runs INTEGER NOT NULL DEFAULT 0 CHECK (advanced_runs >= 0);
ALTER TABLE usage_periods ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0);
ALTER TABLE usage_periods ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0);
ALTER TABLE usage_periods ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0);
ALTER TABLE usage_periods ADD COLUMN estimated_provider_cost REAL NOT NULL DEFAULT 0 CHECK (estimated_provider_cost >= 0);

ALTER TABLE ai_runs ADD COLUMN reasoning_mode TEXT NOT NULL DEFAULT 'fast' CHECK (reasoning_mode IN ('fast', 'advanced'));
