import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI analysis migration", () => {
  const migration = readFileSync(
    "netlify/database/migrations/20260616000000_create-ai-analysis/migration.sql",
    "utf8",
  );

  it("creates AI analysis run and recommendation tables", () => {
    expect(migration).toContain("CREATE TABLE ai_analysis_runs");
    expect(migration).toContain("CREATE TABLE ai_recommendations");
    expect(migration).toContain("CONSTRAINT ai_recommendations_status_check");
  });

  it("stores consent scope and sanitized input summary without plaintext portfolio values", () => {
    expect(migration).toContain("consent_scope JSONB NOT NULL");
    expect(migration).toContain("input_summary JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).not.toMatch(
      /\bprompt_payload\b|\braw_response\b|\bplaintext\b|\bdecrypted\b|\bcurrent_value\b NUMERIC/i,
    );
  });

  it("tracks recommendation resolution lifecycle", () => {
    expect(migration).toContain("resolved_at TIMESTAMPTZ");
    expect(migration).toContain("resolution_actor_identity_user_id TEXT");
    expect(migration).toContain("resolution_note TEXT");
  });
});
