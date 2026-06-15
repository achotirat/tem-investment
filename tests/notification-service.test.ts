import { describe, expect, it, vi } from "vitest";

import {
  buildReviewLoopNotifications,
  dispatchDueEmailReminders,
  type NotificationRepository,
  type ReminderEmailSender,
} from "../src/server/notification-service";
import type { HoldingSummary } from "../src/shared/holdings";
import type { NotificationSummary } from "../src/shared/notifications";

const encryptedValues = {
  quantity: { version: 1 as const, algorithm: "AES-GCM" as const, iv: "iv", ciphertext: "q" },
  costBasis: { version: 1 as const, algorithm: "AES-GCM" as const, iv: "iv", ciphertext: "b" },
  currentValue: { version: 1 as const, algorithm: "AES-GCM" as const, iv: "iv", ciphertext: "v" },
};

const holding = (overrides: Partial<HoldingSummary>): HoldingSummary => ({
  id: "holding_1",
  householdId: "household_1",
  portfolioBucket: "P2",
  assetClass: "stock",
  assetLabel: "SET system trade",
  accountLabel: "Broker",
  currency: "THB",
  liquidityCategory: "liquid",
  valuationSource: "manual",
  valuationDate: "2026-06-01",
  status: "active",
  ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 100 }],
  encryptedValues,
  autoPriceKey: null,
  latestMarketPriceThb: null,
  latestMarketPriceAsOf: null,
  ...overrides,
});

describe("buildReviewLoopNotifications", () => {
  it("creates scheduled review, stale valuation, and missing P2 plan notifications", () => {
    const drafts = buildReviewLoopNotifications({
      householdId: "household_1",
      holdings: [holding({})],
      staleWarnings: [
        {
          holdingId: "gold_1",
          assetLabel: "Gold bars",
          assetClass: "gold",
          valuationDate: "2026-01-01",
          staleAfterDays: 1,
          daysOld: 165,
        },
      ],
      reviewDueAt: "2026-06-15T00:00:00.000Z",
      now: new Date("2026-06-15T08:00:00.000Z"),
    });

    expect(drafts.map((draft) => draft.kind)).toEqual(
      expect.arrayContaining(["scheduled_review", "stale_valuation", "p2_trade_plan"]),
    );
    expect(drafts.find((draft) => draft.kind === "scheduled_review")).toMatchObject({
      severity: "info",
      title: "Portfolio review is due",
      channels: ["in_app", "email"],
    });
  });
});

describe("dispatchDueEmailReminders", () => {
  it("sends due email notifications and records delivery", async () => {
    const dueNotification: NotificationSummary = {
      id: "notification_1",
      householdId: "household_1",
      kind: "scheduled_review",
      severity: "info",
      title: "Portfolio review is due",
      body: "Open the dashboard.",
      actionLabel: "Open dashboard",
      sourceType: "household",
      sourceId: "household_1",
      dueAt: "2026-06-15T00:00:00.000Z",
      channels: ["in_app", "email"],
      metadata: { email: "tem@example.com" },
      status: "unread",
      createdAt: "2026-06-15T00:00:00.000Z",
      readAt: null,
      emailedAt: null,
    };
    const repository: NotificationRepository = {
      upsertDrafts: vi.fn(),
      listForHousehold: vi.fn(),
      markRead: vi.fn(),
      listDueEmailNotifications: vi.fn(async () => [dueNotification]),
      markEmailed: vi.fn(async () => undefined),
      recordDeliveryRun: vi.fn(async (run) => ({ id: "run_1", ...run })),
    };
    const sender: ReminderEmailSender = {
      send: vi.fn(async () => ({ providerId: "provider_1" })),
    };

    const run = await dispatchDueEmailReminders({
      repository,
      sender,
      now: new Date("2026-06-15T08:00:00.000Z"),
    });

    expect(sender.send).toHaveBeenCalledWith({
      to: "tem@example.com",
      subject: "Portfolio review is due",
      body: "Open the dashboard.",
    });
    expect(repository.markEmailed).toHaveBeenCalledWith(
      "notification_1",
      "2026-06-15T08:00:00.000Z",
    );
    expect(run).toMatchObject({ status: "success", notificationsSent: 1 });
  });
});
