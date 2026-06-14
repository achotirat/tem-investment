import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("decision log migration", () => {
  const migration = readFileSync(
    "netlify/database/migrations/20260613003000_create-decision-logs/migration.sql",
    "utf8",
  );

  it("creates decision logs and household discipline policy fields", () => {
    expect(migration).toContain("ALTER TABLE households");
    expect(migration).toContain("p3_max_loss_per_trade_thb");
    expect(migration).toContain("p3_max_loss_per_month_thb");
    expect(migration).toContain("CREATE TABLE decision_logs");
  });

  it("stores sensitive decision details only as encrypted payloads", () => {
    expect(migration).toContain("encrypted_details JSONB NOT NULL");
    expect(migration).not.toMatch(/\breason\b TEXT|\bnotes\b TEXT|\btrade_plan\b TEXT/i);
  });
});
