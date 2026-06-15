import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationCenterPanel } from "../src/client/notifications/NotificationCenterPanel";
import type { NotificationSummary } from "../src/shared/notifications";

const notification: NotificationSummary = {
  id: "notification_1",
  householdId: "household_1",
  kind: "scheduled_review",
  severity: "info",
  title: "Portfolio review is due",
  body: "Open the dashboard and clear alerts.",
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

describe("NotificationCenterPanel", () => {
  it("renders unread notifications and marks them read", () => {
    const onMarkRead = vi.fn();

    render(<NotificationCenterPanel notifications={[notification]} onMarkRead={onMarkRead} />);

    expect(screen.getByText("Review loop")).toBeInTheDocument();
    expect(screen.getByText("Portfolio review is due")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));

    expect(onMarkRead).toHaveBeenCalledWith("notification_1");
  });
});
