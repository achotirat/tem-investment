import { getDatabase } from "@netlify/database";

import type {
  NotificationChannel,
  NotificationDeliveryRun,
  NotificationDraft,
  NotificationKind,
  NotificationMetadata,
  NotificationSeverity,
  NotificationStatus,
  NotificationSummary,
} from "../shared/notifications";
import type { NotificationRepository } from "./notification-service";

type NetlifyDatabase = ReturnType<typeof getDatabase>;

export type NotificationRow = {
  id: string;
  household_id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  action_label: string;
  source_type: string;
  source_id: string;
  status: NotificationStatus;
  due_at: string | Date;
  channels: NotificationChannel[] | string;
  metadata: NotificationMetadata | string;
  read_at: string | Date | null;
  emailed_at: string | Date | null;
  created_at: string | Date;
};

export type NotificationDeliveryRunRow = {
  id: string;
  status: NotificationDeliveryRun["status"];
  started_at: string | Date;
  completed_at: string | Date;
  notifications_sent: string | number;
  message: string | null;
};

export type HouseholdReminderRow = {
  household_id: string;
  next_review_due_at: string | Date;
  email_reminders_enabled: boolean;
  review_reminder_email: string | null;
};

export class NetlifyNotificationRepository implements NotificationRepository {
  constructor(private readonly database: NetlifyDatabase = getDatabase()) {}

  async upsertDrafts(drafts: NotificationDraft[]): Promise<NotificationSummary[]> {
    if (drafts.length === 0) return [];
    const draftsJson = JSON.stringify(drafts);

    const rows = await this.database.sql<NotificationRow>`
      INSERT INTO notifications (
        household_id,
        kind,
        severity,
        title,
        body,
        action_label,
        source_type,
        source_id,
        due_at,
        channels,
        metadata
      )
      SELECT
        draft."householdId"::uuid,
        draft.kind,
        draft.severity,
        draft.title,
        draft.body,
        draft."actionLabel",
        draft."sourceType",
        draft."sourceId",
        draft."dueAt"::timestamptz,
        ARRAY(SELECT jsonb_array_elements_text(draft.channels)),
        draft.metadata
      FROM jsonb_to_recordset(${draftsJson}::jsonb)
        AS draft(
          "householdId" text,
          kind text,
          severity text,
          title text,
          body text,
          "actionLabel" text,
          "sourceType" text,
          "sourceId" text,
          "dueAt" text,
          channels jsonb,
          metadata jsonb
        )
      ON CONFLICT (household_id, kind, source_type, source_id)
      DO UPDATE SET
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        action_label = EXCLUDED.action_label,
        due_at = EXCLUDED.due_at,
        channels = EXCLUDED.channels,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING
        id,
        household_id,
        kind,
        severity,
        title,
        body,
        action_label,
        source_type,
        source_id,
        status,
        due_at,
        channels,
        metadata,
        read_at,
        emailed_at,
        created_at
    `;

    return mapNotificationRows(rows);
  }

  async listForHousehold(householdId: string): Promise<NotificationSummary[]> {
    const rows = await this.database.sql<NotificationRow>`
      SELECT
        id,
        household_id,
        kind,
        severity,
        title,
        body,
        action_label,
        source_type,
        source_id,
        status,
        due_at,
        channels,
        metadata,
        read_at,
        emailed_at,
        created_at
      FROM notifications
      WHERE household_id = ${householdId}
      ORDER BY due_at DESC, created_at DESC
    `;
    return mapNotificationRows(rows);
  }

  async markRead(
    notificationId: string,
    readAt: string,
    householdId?: string,
  ): Promise<NotificationSummary> {
    const rows = await this.database.sql<NotificationRow>`
      UPDATE notifications
      SET status = 'read',
        read_at = ${readAt}::timestamptz,
        updated_at = NOW()
      WHERE id = ${notificationId}
        AND (${householdId ?? null}::uuid IS NULL OR household_id = ${householdId ?? null}::uuid)
      RETURNING
        id,
        household_id,
        kind,
        severity,
        title,
        body,
        action_label,
        source_type,
        source_id,
        status,
        due_at,
        channels,
        metadata,
        read_at,
        emailed_at,
        created_at
    `;

    const [notification] = mapNotificationRows(rows);
    if (!notification) throw new Error("Notification not found.");
    return notification;
  }

  async listDueEmailNotifications(now: string): Promise<NotificationSummary[]> {
    const rows = await this.database.sql<NotificationRow>`
      SELECT
        id,
        household_id,
        kind,
        severity,
        title,
        body,
        action_label,
        source_type,
        source_id,
        status,
        due_at,
        channels,
        metadata,
        read_at,
        emailed_at,
        created_at
      FROM notifications
      WHERE due_at <= ${now}::timestamptz
        AND emailed_at IS NULL
        AND status <> 'dismissed'
        AND 'email' = ANY(channels)
      ORDER BY due_at ASC
    `;
    return mapNotificationRows(rows);
  }

  async markEmailed(notificationId: string, emailedAt: string): Promise<void> {
    await this.database.sql`
      UPDATE notifications
      SET emailed_at = ${emailedAt}::timestamptz,
        updated_at = NOW()
      WHERE id = ${notificationId}
    `;
  }

  async recordDeliveryRun(run: NotificationDeliveryRun): Promise<NotificationDeliveryRun> {
    const rows = await this.database.sql<NotificationDeliveryRunRow>`
      INSERT INTO notification_delivery_runs (
        status,
        started_at,
        completed_at,
        notifications_sent,
        message
      )
      VALUES (
        ${run.status},
        ${run.startedAt}::timestamptz,
        ${run.completedAt}::timestamptz,
        ${run.notificationsSent},
        ${run.message ?? null}
      )
      RETURNING id, status, started_at, completed_at, notifications_sent, message
    `;
    return mapNotificationDeliveryRunRow(rows[0]);
  }

  async listHouseholdsDueForReview(now: string): Promise<HouseholdReminderRow[]> {
    return this.database.sql<HouseholdReminderRow>`
      SELECT
        id AS household_id,
        next_review_due_at,
        email_reminders_enabled,
        review_reminder_email
      FROM households
      WHERE next_review_due_at <= ${now}::timestamptz
    `;
  }
}

export function mapNotificationRows(rows: NotificationRow[]): NotificationSummary[] {
  return rows.map((row) => ({
    id: row.id,
    householdId: row.household_id,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    body: row.body,
    actionLabel: row.action_label,
    sourceType: row.source_type,
    sourceId: row.source_id,
    status: row.status,
    dueAt: toIso(row.due_at),
    channels: normalizeChannels(row.channels),
    metadata: normalizeMetadata(row.metadata),
    readAt: row.read_at ? toIso(row.read_at) : null,
    emailedAt: row.emailed_at ? toIso(row.emailed_at) : null,
    createdAt: toIso(row.created_at),
  }));
}

export function mapNotificationDeliveryRunRow(
  row: NotificationDeliveryRunRow,
): NotificationDeliveryRun {
  return {
    id: row.id,
    status: row.status,
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    notificationsSent: Number(row.notifications_sent),
    message: row.message ?? undefined,
  };
}

function normalizeChannels(channels: NotificationRow["channels"]): NotificationChannel[] {
  if (Array.isArray(channels)) return channels;
  const parsed = JSON.parse(channels) as NotificationChannel[];
  return parsed;
}

function normalizeMetadata(metadata: NotificationRow["metadata"]): NotificationMetadata {
  return typeof metadata === "string" ? JSON.parse(metadata) : metadata;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
