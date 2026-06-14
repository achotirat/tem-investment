ALTER TABLE households
  ADD COLUMN valuation_stale_thresholds JSONB NOT NULL DEFAULT
    '{"liquid_market_days": 1, "derivative_days": 1, "private_company_days": 90, "real_estate_days": 180}'::jsonb;

ALTER TABLE holdings
  ADD COLUMN auto_price_key TEXT,
  ADD COLUMN latest_market_price_thb NUMERIC(20, 8),
  ADD COLUMN latest_market_price_as_of TIMESTAMPTZ,
  ADD COLUMN latest_market_price_provider TEXT;

CREATE TABLE market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_key TEXT NOT NULL,
  source TEXT NOT NULL,
  symbol TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  price NUMERIC(20, 8) NOT NULL,
  price_thb NUMERIC(20, 8) NOT NULL,
  provider TEXT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_prices_price_key_unique UNIQUE (price_key),
  CONSTRAINT market_prices_source_check CHECK (source IN ('crypto', 'gold', 'set', 'fx', 'configured')),
  CONSTRAINT market_prices_positive_price_check CHECK (price > 0 AND price_thb > 0)
);

CREATE TABLE price_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  prices_fetched INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT price_sync_runs_status_check CHECK (status IN ('success', 'partial', 'failed'))
);

CREATE INDEX market_prices_source_symbol_idx
  ON market_prices(source, symbol);

CREATE INDEX holdings_auto_price_key_idx
  ON holdings(auto_price_key);

CREATE INDEX price_sync_runs_created_at_idx
  ON price_sync_runs(created_at DESC);
