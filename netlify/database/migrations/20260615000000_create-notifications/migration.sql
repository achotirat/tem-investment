ALTER TABLE households
  ADD COLUMN review_reminder_frequency TEXT NOT NULL DEFAULT 'weekly',
  ADD COLUMN next_review_due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN email_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN review_reminder_email TEXT,
  ADD CONSTRAINT households_review_reminder_frequency_check
    CHECK (review_reminder_frequency IN ('weekly', 'monthly'));

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_label TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  due_at TIMESTAMPTZ NOT NULL,
  channels TEXT[] NOT NULL DEFAULT ARRAY['in_app']::text[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_kind_check
    CHECK (kind IN ('scheduled_review', 'stale_valuation', 'p1_rebalance_drift', 'p2_trade_plan', 'p3_guardrail')),
  CONSTRAINT notifications_severity_check CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT notifications_status_check CHECK (status IN ('unread', 'read', 'dismissed')),
  CONSTRAINT notifications_household_source_unique UNIQUE (household_id, kind, source_type, source_id)
);

CREATE TABLE notification_delivery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  notifications_sent INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_delivery_runs_status_check CHECK (status IN ('success', 'dry_run', 'failed'))
);

CREATE INDEX notifications_household_status_due_idx
  ON notifications(household_id, status, due_at DESC);

CREATE INDEX notifications_email_due_idx
  ON notifications(due_at ASC)
  WHERE emailed_at IS NULL;

CREATE INDEX notification_delivery_runs_created_at_idx
  ON notification_delivery_runs(created_at DESC);
