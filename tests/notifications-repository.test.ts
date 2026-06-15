import { describe, expect, it } from "vitest";

import {
  mapNotificationDeliveryRunRow,
  mapNotificationRows,
  type NotificationDeliveryRunRow,
  type NotificationRow,
} from "../src/server/notifications-repository";

describe("notifications repository mappers", () => {
  it("maps notification rows", () => {
    const rows: NotificationRow[] = [
      {
        id: "notification_1",
        household_id: "household_1",
        kind: "scheduled_review",
        severity: "info",
        title: "Portfolio review is due",
        body: "Open dashboard.",
        action_label: "Open dashboard",
        source_type: "household",
        source_id: "household_1",
        status: "unread",
        due_at: "2026-06-15T00:00:00.000Z",
        channels: ["in_app", "email"],
        metadata: { email: "tem@example.com" },
        read_at: null,
        emailed_at: null,
        created_at: "2026-06-15T00:00:00.000Z",
      },
    ];

    expect(mapNotificationRows(rows)).toEqual([
      {
        id: "notification_1",
        householdId: "household_1",
        kind: "scheduled_review",
        severity: "info",
        title: "Portfolio review is due",
        body: "Open dashboard.",
        actionLabel: "Open dashboard",
        sourceType: "household",
        sourceId: "household_1",
        status: "unread",
        dueAt: "2026-06-15T00:00:00.000Z",
        channels: ["in_app", "email"],
        metadata: { email: "tem@example.com" },
        readAt: null,
        emailedAt: null,
        createdAt: "2026-06-15T00:00:00.000Z",
      },
    ]);
  });

  it("maps delivery run rows", () => {
    const row: NotificationDeliveryRunRow = {
      id: "run_1",
      status: "success",
      started_at: "2026-06-15T00:00:00.000Z",
      completed_at: "2026-06-15T00:00:03.000Z",
      notifications_sent: 2,
      message: null,
    };

    expect(mapNotificationDeliveryRunRow(row)).toEqual({
      id: "run_1",
      status: "success",
      startedAt: "2026-06-15T00:00:00.000Z",
      completedAt: "2026-06-15T00:00:03.000Z",
      notificationsSent: 2,
      message: undefined,
    });
  });
});
