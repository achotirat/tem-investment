ALTER TABLE households
  ADD COLUMN p3_max_loss_per_trade_thb NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN p3_max_loss_per_month_thb NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN p3_current_month_loss_thb NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN p3_target_allocation_percent NUMERIC(6, 3) NOT NULL DEFAULT 10,
  ADD COLUMN p1_rebalance_band_percent NUMERIC(6, 3) NOT NULL DEFAULT 5,
  ADD CONSTRAINT households_p3_loss_policy_check
    CHECK (
      p3_max_loss_per_trade_thb >= 0
      AND p3_max_loss_per_month_thb >= 0
      AND p3_current_month_loss_thb >= 0
    ),
  ADD CONSTRAINT households_bucket_policy_percent_check
    CHECK (
      p3_target_allocation_percent > 0
      AND p3_target_allocation_percent <= 100
      AND p1_rebalance_band_percent > 0
      AND p1_rebalance_band_percent <= 100
    );

CREATE TABLE decision_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES holdings(id) ON DELETE SET NULL,
  actor_identity_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  scope TEXT NOT NULL,
  reason_required BOOLEAN NOT NULL DEFAULT FALSE,
  encrypted_details JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT decision_logs_action_check
    CHECK (
      action IN (
        'buy',
        'sell',
        'reduce',
        'open_p2',
        'edit_p2_plan',
        'close_p2',
        'p3_override'
      )
    ),
  CONSTRAINT decision_logs_scope_check CHECK (scope IN ('holding', 'portfolio'))
);

CREATE INDEX decision_logs_household_id_created_at_idx
  ON decision_logs(household_id, created_at DESC);

CREATE INDEX decision_logs_holding_id_idx
  ON decision_logs(holding_id);
