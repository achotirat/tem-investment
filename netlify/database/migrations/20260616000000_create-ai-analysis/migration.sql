CREATE TABLE ai_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  actor_identity_user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  consent_scope JSONB NOT NULL,
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_analysis_runs_status_check CHECK (status IN ('completed', 'failed')),
  CONSTRAINT ai_analysis_runs_provider_check CHECK (provider IN ('dry_run', 'netlify_ai_gateway'))
);

CREATE TABLE ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ai_analysis_runs(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  action_label TEXT NOT NULL,
  source_recommendation_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_actor_identity_user_id TEXT,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_recommendations_severity_check CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT ai_recommendations_status_check CHECK (status IN ('open', 'approved', 'ignored', 'deferred', 'edited'))
);

CREATE INDEX ai_analysis_runs_household_created_at_idx
  ON ai_analysis_runs(household_id, created_at DESC);

CREATE INDEX ai_recommendations_household_status_idx
  ON ai_recommendations(household_id, status, created_at DESC);
