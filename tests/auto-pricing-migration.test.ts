import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("auto-pricing migration", () => {
  const migration = readFileSync(
    "netlify/database/migrations/20260613004000_create-market-prices/migration.sql",
    "utf8",
  );

  it("creates market price and sync run tables", () => {
    expect(migration).toContain("CREATE TABLE market_prices");
    expect(migration).toContain("CREATE TABLE price_sync_runs");
    expect(migration).toContain("CONSTRAINT market_prices_price_key_unique UNIQUE (price_key)");
  });

  it("adds non-sensitive auto-price metadata without plaintext position values", () => {
    expect(migration).toContain("ALTER TABLE holdings");
    expect(migration).toContain("ADD COLUMN auto_price_key TEXT");
    expect(migration).toContain("ADD COLUMN latest_market_price_thb NUMERIC(20, 8)");
    expect(migration).not.toMatch(/\bquantity\b NUMERIC|\bcurrent_value\b NUMERIC|\bcost_basis\b NUMERIC/i);
  });

  it("adds household stale valuation threshold overrides", () => {
    expect(migration).toContain("ADD COLUMN valuation_stale_thresholds JSONB");
    expect(migration).toContain("liquid_market_days");
    expect(migration).toContain("real_estate_days");
  });
});
