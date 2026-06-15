import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notifications migration", () => {
  const migration = readFileSync(
    "netlify/database/migrations/20260615000000_create-notifications/migration.sql",
    "utf8",
  );

  it("adds review reminder settings to households", () => {
    expect(migration).toContain("ADD COLUMN review_reminder_frequency TEXT");
    expect(migration).toContain("ADD COLUMN next_review_due_at TIMESTAMPTZ");
    expect(migration).toContain("ADD COLUMN email_reminders_enabled BOOLEAN");
  });

  it("creates notification and delivery run tables", () => {
    expect(migration).toContain("CREATE TABLE notifications");
    expect(migration).toContain("CREATE TABLE notification_delivery_runs");
    expect(migration).toContain("CONSTRAINT notifications_kind_check");
  });

  it("keeps notification payloads non-sensitive", () => {
    expect(migration).toContain("metadata JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).not.toMatch(/\bplaintext\b|\bdecrypted\b|\bcurrent_value\b NUMERIC/i);
  });
});
