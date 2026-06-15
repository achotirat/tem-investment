export type NotificationKind =
  | "scheduled_review"
  | "stale_valuation"
  | "p1_rebalance_drift"
  | "p2_trade_plan"
  | "p3_guardrail";

export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationStatus = "unread" | "read" | "dismissed";
export type NotificationChannel = "in_app" | "email";

export type NotificationMetadata = Record<string, string | number | boolean | null>;

export type NotificationDraft = {
  householdId: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  actionLabel: string;
  sourceType: string;
  sourceId: string;
  dueAt: string;
  channels: NotificationChannel[];
  metadata: NotificationMetadata;
};

export type NotificationSummary = NotificationDraft & {
  id: string;
  status: NotificationStatus;
  createdAt: string;
  readAt: string | null;
  emailedAt: string | null;
};

export type NotificationDeliveryStatus = "success" | "dry_run" | "failed";

export type NotificationDeliveryRun = {
  id?: string;
  status: NotificationDeliveryStatus;
  startedAt: string;
  completedAt: string;
  notificationsSent: number;
  message?: string;
};
