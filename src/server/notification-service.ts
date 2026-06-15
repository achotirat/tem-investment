import type { HoldingSummary } from "../shared/holdings";
import type {
  NotificationDeliveryRun,
  NotificationDraft,
  NotificationSummary,
} from "../shared/notifications";
import type { ValuationFreshnessWarning } from "../shared/pricing";

export type NotificationRepository = {
  upsertDrafts(drafts: NotificationDraft[]): Promise<NotificationSummary[]>;
  listForHousehold(householdId: string): Promise<NotificationSummary[]>;
  markRead(notificationId: string, readAt: string, householdId?: string): Promise<NotificationSummary>;
  listDueEmailNotifications(now: string): Promise<NotificationSummary[]>;
  markEmailed(notificationId: string, emailedAt: string): Promise<void>;
  recordDeliveryRun(run: NotificationDeliveryRun): Promise<NotificationDeliveryRun>;
};

export type ReminderEmailInput = {
  to: string;
  subject: string;
  body: string;
};

export type ReminderEmailSender = {
  send(input: ReminderEmailInput): Promise<{ providerId?: string }>;
};

export type BuildReviewLoopNotificationsInput = {
  householdId: string;
  holdings: HoldingSummary[];
  staleWarnings: ValuationFreshnessWarning[];
  reviewDueAt: string | null;
  now: Date;
  email?: string | null;
};

export function buildReviewLoopNotifications({
  householdId,
  holdings,
  staleWarnings,
  reviewDueAt,
  now,
  email,
}: BuildReviewLoopNotificationsInput): NotificationDraft[] {
  const dueAt = now.toISOString();
  const drafts: NotificationDraft[] = [];

  if (reviewDueAt && new Date(reviewDueAt).getTime() <= now.getTime()) {
    drafts.push({
      householdId,
      kind: "scheduled_review",
      severity: "info",
      title: "Portfolio review is due",
      body: "Open the dashboard, unlock sensitive values, and clear the current review alerts.",
      actionLabel: "Open dashboard",
      sourceType: "household",
      sourceId: householdId,
      dueAt: reviewDueAt,
      channels: ["in_app", "email"],
      metadata: { ...(email ? { email } : {}) },
    });
  }

  for (const warning of staleWarnings) {
    drafts.push({
      householdId,
      kind: "stale_valuation",
      severity: "warning",
      title: "Valuation is stale",
      body: `${warning.assetLabel} is ${warning.daysOld} days old; threshold is ${warning.staleAfterDays} days.`,
      actionLabel: "Update valuation",
      sourceType: "holding",
      sourceId: warning.holdingId,
      dueAt,
      channels: ["in_app"],
      metadata: {
        assetLabel: warning.assetLabel,
        assetClass: warning.assetClass,
        daysOld: warning.daysOld,
        staleAfterDays: warning.staleAfterDays,
      },
    });
  }

  for (const holding of holdings) {
    if (
      holding.status === "active" &&
      holding.portfolioBucket === "P2" &&
      !holding.encryptedValues.tradePlan
    ) {
      drafts.push({
        householdId,
        kind: "p2_trade_plan",
        severity: "warning",
        title: "P2 position is missing a trade plan",
        body: `${holding.assetLabel} needs entry, stop, target, invalidation, sizing, and holding-period logic.`,
        actionLabel: "Add trade plan",
        sourceType: "holding",
        sourceId: holding.id,
        dueAt,
        channels: ["in_app"],
        metadata: {
          assetLabel: holding.assetLabel,
          portfolioBucket: holding.portfolioBucket,
        },
      });
    }
  }

  return drafts;
}

export async function dispatchDueEmailReminders({
  repository,
  sender,
  now = new Date(),
}: {
  repository: NotificationRepository;
  sender: ReminderEmailSender;
  now?: Date;
}): Promise<NotificationDeliveryRun> {
  const startedAt = now.toISOString();
  const dueNotifications = await repository.listDueEmailNotifications(startedAt);
  let sent = 0;

  try {
    for (const notification of dueNotifications) {
      const to = typeof notification.metadata.email === "string" ? notification.metadata.email : "";
      if (!to) continue;
      await sender.send({
        to,
        subject: notification.title,
        body: notification.body,
      });
      await repository.markEmailed(notification.id, startedAt);
      sent += 1;
    }

    return repository.recordDeliveryRun({
      status: sender instanceof DryRunReminderEmailSender ? "dry_run" : "success",
      startedAt,
      completedAt: now.toISOString(),
      notificationsSent: sent,
    });
  } catch (error) {
    return repository.recordDeliveryRun({
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      notificationsSent: sent,
      message: error instanceof Error ? error.message : "Unable to send review reminders.",
    });
  }
}

export class WebhookReminderEmailSender implements ReminderEmailSender {
  constructor(
    private readonly webhookUrl?: string,
    private readonly webhookToken?: string,
  ) {}

  async send(input: ReminderEmailInput): Promise<{ providerId?: string }> {
    if (!this.webhookUrl) return {};

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.webhookToken ? { Authorization: `Bearer ${this.webhookToken}` } : {}),
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Review reminder webhook failed with ${response.status}`);
    }

    return { providerId: response.headers.get("x-provider-id") ?? undefined };
  }
}

export class DryRunReminderEmailSender implements ReminderEmailSender {
  async send(_input: ReminderEmailInput): Promise<{ providerId?: string }> {
    return {};
  }
}
