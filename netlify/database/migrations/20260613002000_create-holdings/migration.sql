CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  platform_type TEXT NOT NULL DEFAULT 'other',
  encrypted_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_platform_type_check
    CHECK (platform_type IN ('broker', 'exchange', 'wallet', 'bank', 'storage', 'holding_vehicle', 'other')),
  CONSTRAINT accounts_household_label_unique UNIQUE (household_id, label)
);

CREATE TABLE holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  portfolio_bucket TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  asset_label TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  liquidity_category TEXT NOT NULL,
  valuation_source TEXT NOT NULL,
  valuation_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  encrypted_values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT holdings_portfolio_bucket_check CHECK (portfolio_bucket IN ('P1', 'P2', 'P3')),
  CONSTRAINT holdings_asset_class_check
    CHECK (asset_class IN ('real_estate', 'stock', 'derivative', 'crypto', 'gold', 'cash', 'other')),
  CONSTRAINT holdings_liquidity_category_check CHECK (liquidity_category IN ('liquid', 'semi_liquid', 'illiquid')),
  CONSTRAINT holdings_valuation_source_check CHECK (valuation_source IN ('manual', 'auto_price', 'third_party_appraisal')),
  CONSTRAINT holdings_status_check CHECK (status IN ('active', 'exited', 'archived'))
);

CREATE TABLE holding_ownership_splits (
  holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  owner_entity_id UUID NOT NULL REFERENCES owner_entities(id) ON DELETE RESTRICT,
  percentage NUMERIC(7, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (holding_id, owner_entity_id),
  CONSTRAINT holding_ownership_percentage_check CHECK (percentage > 0 AND percentage <= 100)
);

CREATE TABLE valuation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  valuation_source TEXT NOT NULL,
  valuation_date DATE NOT NULL,
  currency CHAR(3) NOT NULL,
  encrypted_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valuation_history_source_check CHECK (valuation_source IN ('manual', 'auto_price', 'third_party_appraisal'))
);

CREATE INDEX accounts_household_id_idx
  ON accounts(household_id);

CREATE INDEX holdings_household_id_idx
  ON holdings(household_id);

CREATE INDEX holdings_account_id_idx
  ON holdings(account_id);

CREATE INDEX holding_ownership_owner_entity_id_idx
  ON holding_ownership_splits(owner_entity_id);

CREATE INDEX valuation_history_holding_id_idx
  ON valuation_history(holding_id);

CREATE OR REPLACE FUNCTION validate_holding_ownership_total()
RETURNS TRIGGER AS $$
DECLARE
  split_total NUMERIC;
  target_holding_id UUID;
BEGIN
  target_holding_id := COALESCE(NEW.holding_id, OLD.holding_id);

  SELECT COALESCE(SUM(percentage), 0)
  INTO split_total
  FROM holding_ownership_splits
  WHERE holding_id = target_holding_id;

  IF split_total <> 100 THEN
    RAISE EXCEPTION 'Holding ownership splits must total 100%%. Current total is %%', split_total;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER holding_ownership_total_100
AFTER INSERT OR UPDATE OR DELETE ON holding_ownership_splits
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_holding_ownership_total();
