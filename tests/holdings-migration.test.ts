import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("holdings migration", () => {
  const migration = readFileSync(
    "netlify/database/migrations/20260613002000_create-holdings/migration.sql",
    "utf8",
  );

  it("creates account, holding, ownership, and valuation history tables", () => {
    expect(migration).toContain("CREATE TABLE accounts");
    expect(migration).toContain("CREATE TABLE holdings");
    expect(migration).toContain("CREATE TABLE holding_ownership_splits");
    expect(migration).toContain("CREATE TABLE valuation_history");
  });

  it("stores sensitive position values only as encrypted payloads", () => {
    expect(migration).toContain("encrypted_values JSONB NOT NULL");
    expect(migration).toContain("encrypted_value JSONB NOT NULL");
    expect(migration).not.toMatch(/\bquantity\b NUMERIC|\bcost_basis\b NUMERIC|\bcurrent_value\b NUMERIC/i);
  });
});
