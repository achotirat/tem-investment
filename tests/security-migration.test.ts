import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("household security migration", () => {
  it("stores recovery metadata as hashes and salts only", () => {
    const migration = readFileSync(
      "netlify/database/migrations/20260613001000_create-household-security/migration.sql",
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE household_security");
    expect(migration).toContain("recovery_key_hash");
    expect(migration).toContain("recovery_key_salt");
    expect(migration).toContain("recovery_key_acknowledged_at");
    expect(migration).not.toMatch(/recovery_key_plaintext|plaintext_recovery/i);
  });
});
