import type { Config } from "@netlify/functions";

import { NetlifyHoldingRepository } from "../../src/server/holdings-repository";
import {
  DryRunReminderEmailSender,
  WebhookReminderEmailSender,
  buildReviewLoopNotifications,
  dispatchDueEmailReminders,
} from "../../src/server/notification-service";
import { NetlifyNotificationRepository } from "../../src/server/notifications-repository";
import { buildPriceDashboardPayload } from "../../src/server/pricing-service";
import { NetlifyPricingRepository } from "../../src/server/pricing-repository";

declare const Netlify: {
  env: {
    get(key: string): string | undefined;
  };
};

export default async function sendReviewReminders(_request: Request) {
  const now = new Date();
  const notificationRepository = new NetlifyNotificationRepository();
  const holdingRepository = new NetlifyHoldingRepository();
  const pricingRepository = new NetlifyPricingRepository();

  const dueHouseholds = await notificationRepository.listHouseholdsDueForReview(now.toISOString());

  for (const household of dueHouseholds) {
    const holdings = await holdingRepository.listByHousehold(household.household_id);
    const priceDashboard = await buildPriceDashboardPayload({
      holdings,
      listLatestPrices: () => pricingRepository.listLatestPrices(),
      findLastSyncRun: () => pricingRepository.findLastSyncRun(),
    });
    const drafts = buildReviewLoopNotifications({
      householdId: household.household_id,
      holdings,
      staleWarnings: priceDashboard.staleWarnings,
      reviewDueAt:
        household.next_review_due_at instanceof Date
          ? household.next_review_due_at.toISOString()
          : new Date(household.next_review_due_at).toISOString(),
      now,
      email: household.email_reminders_enabled ? household.review_reminder_email : null,
    });

    await notificationRepository.upsertDrafts(drafts);
  }

  const webhookUrl = Netlify.env.get("REVIEW_REMINDER_WEBHOOK_URL");
  const sender = webhookUrl
    ? new WebhookReminderEmailSender(webhookUrl, Netlify.env.get("REVIEW_REMINDER_WEBHOOK_TOKEN"))
    : new DryRunReminderEmailSender();
  const summary = await dispatchDueEmailReminders({
    repository: notificationRepository,
    sender,
    now,
  });

  return Response.json(summary);
}

export const config: Config = {
  schedule: "@daily",
};
