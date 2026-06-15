# Phase 7 Notifications Review Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app notifications and email reminder plumbing so the household has a regular review loop for scheduled reviews and rule/stale-data alerts.

**Architecture:** Persist non-sensitive notification metadata in Postgres and expose it through authenticated Netlify Functions. Generate reminder drafts from server-visible metadata such as stale valuation warnings, P2 encrypted-plan presence, and scheduled review dates; keep sensitive portfolio-value analytics client-side. Email delivery is adapter-based: a configured webhook can send reminders, and missing webhook configuration records a dry-run delivery so local/dev environments stay usable.

**Tech Stack:** Next.js client components, Netlify Functions modern default-export syntax, scheduled Netlify Functions, Netlify Database/Postgres, Vitest, Testing Library.

---

## File Structure

- Create `src/shared/notifications.ts` for notification and delivery-run contracts.
- Create `netlify/database/migrations/20260615000000_create-notifications/migration.sql` for notification settings, notifications, and email delivery runs.
- Create `src/server/notification-service.ts` for pure notification draft creation and email dispatch orchestration.
- Create `src/server/notifications-repository.ts` for persistence mappers and Netlify Database implementation.
- Create `netlify/functions/notifications.mts` for authenticated notification listing and mark-read.
- Create `netlify/functions/send-review-reminders.mts` for scheduled reminder delivery.
- Create `src/client/notifications/NotificationCenterPanel.tsx` for in-app notification UI.
- Modify `src/client/CommandCenterApp.tsx` to load notifications and mark them read.
- Modify `src/client/DashboardShell.tsx` to render notification center.
- Modify `src/client/demo-workspace.ts` so demo mode includes review-loop notifications.
- Modify `app/globals.css` for notification rows.
- Add tests:
  - `tests/notifications-migration.test.ts`
  - `tests/notification-service.test.ts`
  - `tests/notifications-repository.test.ts`
  - `tests/notification-center-panel.test.tsx`
  - update `tests/demo-login.test.tsx` and `tests/dashboard-shell.test.tsx`.

## Task 1: Schema and Shared Notification Contracts

**Files:**
- Create: `src/shared/notifications.ts`
- Create: `netlify/database/migrations/20260615000000_create-notifications/migration.sql`
- Test: `tests/notifications-migration.test.ts`

- [ ] **Step 1: Write the failing migration test**

Create `tests/notifications-migration.test.ts`:

```ts
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
```

- [ ] **Step 2: Run migration test to verify RED**

Run: `npm test -- tests/notifications-migration.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add shared notification types**

Create `src/shared/notifications.ts`:

```ts
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
```

- [ ] **Step 4: Add the migration**

Create `netlify/database/migrations/20260615000000_create-notifications/migration.sql`:

```sql
ALTER TABLE households
  ADD COLUMN review_reminder_frequency TEXT NOT NULL DEFAULT 'weekly',
  ADD COLUMN next_review_due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN email_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN review_reminder_email TEXT,
  ADD CONSTRAINT households_review_reminder_frequency_check
    CHECK (review_reminder_frequency IN ('weekly', 'monthly'));

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_label TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  due_at TIMESTAMPTZ NOT NULL,
  channels TEXT[] NOT NULL DEFAULT ARRAY['in_app']::text[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_kind_check
    CHECK (kind IN ('scheduled_review', 'stale_valuation', 'p1_rebalance_drift', 'p2_trade_plan', 'p3_guardrail')),
  CONSTRAINT notifications_severity_check CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT notifications_status_check CHECK (status IN ('unread', 'read', 'dismissed')),
  CONSTRAINT notifications_household_source_unique UNIQUE (household_id, kind, source_type, source_id)
);

CREATE TABLE notification_delivery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  notifications_sent INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_delivery_runs_status_check CHECK (status IN ('success', 'dry_run', 'failed'))
);

CREATE INDEX notifications_household_status_due_idx
  ON notifications(household_id, status, due_at DESC);

CREATE INDEX notifications_email_due_idx
  ON notifications(due_at ASC)
  WHERE emailed_at IS NULL;

CREATE INDEX notification_delivery_runs_created_at_idx
  ON notification_delivery_runs(created_at DESC);
```

- [ ] **Step 5: Run migration test to verify GREEN**

Run: `npm test -- tests/notifications-migration.test.ts`

Expected: PASS.

## Task 2: Notification Draft and Email Dispatch Service

**Files:**
- Create: `src/server/notification-service.ts`
- Test: `tests/notification-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `tests/notification-service.test.ts`:

```ts
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
    expect(repository.markEmailed).toHaveBeenCalledWith("notification_1", "2026-06-15T08:00:00.000Z");
    expect(run).toMatchObject({ status: "success", notificationsSent: 1 });
  });
});
```

- [ ] **Step 2: Run service tests to verify RED**

Run: `npm test -- tests/notification-service.test.ts`

Expected: FAIL because `notification-service.ts` does not exist.

- [ ] **Step 3: Implement notification service**

Create `src/server/notification-service.ts` with:

- `NotificationRepository` interface containing `upsertDrafts`, `listForHousehold`, `markRead`, `listDueEmailNotifications`, `markEmailed`, and `recordDeliveryRun`.
- `ReminderEmailSender` interface with `send({ to, subject, body })`.
- `WebhookReminderEmailSender` class that POSTs to a configured webhook URL and treats missing URL as a dry-run sender.
- `buildReviewLoopNotifications` that creates:
  - `scheduled_review` when `reviewDueAt <= now`, channels `["in_app", "email"]`, metadata email can be added by callers.
  - `stale_valuation` per stale warning, channel `["in_app"]`.
  - `p2_trade_plan` for active P2 holdings without `encryptedValues.tradePlan`, channel `["in_app"]`.
- `dispatchDueEmailReminders` that sends due email notifications to `metadata.email`, marks them emailed, and records a delivery run.

- [ ] **Step 4: Run service tests to verify GREEN**

Run: `npm test -- tests/notification-service.test.ts`

Expected: PASS.

## Task 3: Notification Repository and Functions

**Files:**
- Create: `src/server/notifications-repository.ts`
- Create: `netlify/functions/notifications.mts`
- Create: `netlify/functions/send-review-reminders.mts`
- Test: `tests/notifications-repository.test.ts`

- [ ] **Step 1: Write failing mapper tests**

Create `tests/notifications-repository.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  mapNotificationRows,
  mapNotificationDeliveryRunRow,
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
```

- [ ] **Step 2: Run mapper tests to verify RED**

Run: `npm test -- tests/notifications-repository.test.ts`

Expected: FAIL because repository module does not exist.

- [ ] **Step 3: Implement repository and functions**

Create `src/server/notifications-repository.ts`:

- Export row types and mapper functions from the test.
- Implement `NetlifyNotificationRepository` using `getDatabase`.
- `upsertDrafts(drafts)` inserts on `(household_id, kind, source_type, source_id)` conflict and updates severity/title/body/action/due/channels/metadata while preserving read status.
- `listForHousehold(householdId)` returns newest notifications first.
- `markRead(notificationId, readAt)` sets status `read` and `read_at`.
- `listDueEmailNotifications(now)` returns notifications with `email` channel, `emailed_at IS NULL`, `due_at <= now`, and status not dismissed.
- `markEmailed(notificationId, emailedAt)` sets `emailed_at`.
- `recordDeliveryRun(run)` inserts and returns a mapped run.

Create `netlify/functions/notifications.mts`:

- Authenticate with `getUser()`.
- Resolve household with `NetlifyHouseholdRepository`.
- `GET` returns `{ notifications }`.
- `PATCH` accepts `{ notificationId }`, calls `markRead`, and returns `{ notification }`.
- Use `export const config: Config = { path: "/api/notifications" }`.

Create `netlify/functions/send-review-reminders.mts`:

- Load all active household reminders through repository helper methods.
- Build notification drafts from holdings and price-dashboard stale warnings.
- Upsert drafts.
- Dispatch due email reminders with `WebhookReminderEmailSender` using `Netlify.env.get("REVIEW_REMINDER_WEBHOOK_URL")` and optional token.
- Use `export const config: Config = { schedule: "@daily" }`.

- [ ] **Step 4: Run repository tests to verify GREEN**

Run: `npm test -- tests/notifications-repository.test.ts`

Expected: PASS.

## Task 4: Client Notification Center

**Files:**
- Create: `src/client/notifications/NotificationCenterPanel.tsx`
- Modify: `src/client/DashboardShell.tsx`
- Modify: `src/client/CommandCenterApp.tsx`
- Modify: `src/client/demo-workspace.ts`
- Modify: `app/globals.css`
- Test: `tests/notification-center-panel.test.tsx`
- Update: `tests/dashboard-shell.test.tsx`
- Update: `tests/demo-login.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `tests/notification-center-panel.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run UI test to verify RED**

Run: `npm test -- tests/notification-center-panel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement client UI and app wiring**

Create `src/client/notifications/NotificationCenterPanel.tsx`:

- Render a `span-12` panel titled `Review loop`.
- Show unread/open count in a pill.
- Render notification rows with severity, title, body, channel labels, and a `Mark read` button for unread notifications.
- Empty state says `No review reminders`.

Modify `src/client/DashboardShell.tsx`:

- Add `notifications?: NotificationSummary[]` and `onMarkNotificationRead?: (notificationId: string) => Promise<void> | void` props.
- Render `<NotificationCenterPanel />` below `RulesRecommendationPanel`.

Modify `src/client/CommandCenterApp.tsx`:

- Add `notifications` state.
- Load `/api/notifications` alongside holdings/decisions/prices.
- In demo mode, set `demoWorkspace.notifications`.
- Add `handleMarkNotificationRead` that PATCHes `/api/notifications`, updates state, and uses local state only in demo mode.
- Pass notifications and handler to `DashboardShell`.

Modify `src/client/demo-workspace.ts`:

- Add `notifications` to `DemoWorkspace`.
- Include a scheduled review notification and a P3 guardrail notification.

Modify `app/globals.css`:

- Add `.notification-list`, `.notification-row`, `.notification-row.unread`, `.notification-meta`, and mobile-safe layout.

- [ ] **Step 4: Run UI tests to verify GREEN**

Run: `npm test -- tests/notification-center-panel.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx`

Expected: PASS.

## Task 5: Full Verification and Branch Completion

**Files:**
- All Phase 7 files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/notifications-migration.test.ts tests/notification-service.test.ts tests/notifications-repository.test.ts tests/notification-center-panel.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Browser smoke demo review loop**

Run: `npm run next:dev -- -p 3000`

Open `http://localhost:3000`, click `Use demo`, verify:

- `Review loop` panel is visible.
- Scheduled review notification is visible.
- Marking a notification read updates the row.
- Unlock with `demo` still shows Phase 6 recommendations.
- Mobile width around 390px has no horizontal overflow.

Stop the dev server after smoke testing.

- [ ] **Step 5: Commit and push**

Run:

```bash
git status --short --branch
git add docs/superpowers/plans/2026-06-15-phase-7-notifications-review-loop.md src/shared/notifications.ts netlify/database/migrations/20260615000000_create-notifications/migration.sql src/server/notification-service.ts src/server/notifications-repository.ts netlify/functions/notifications.mts netlify/functions/send-review-reminders.mts src/client/notifications/NotificationCenterPanel.tsx src/client/CommandCenterApp.tsx src/client/DashboardShell.tsx src/client/demo-workspace.ts app/globals.css tests/notifications-migration.test.ts tests/notification-service.test.ts tests/notifications-repository.test.ts tests/notification-center-panel.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx
git commit -m "Add phase 7 review notifications"
git push -u origin phase-7-notifications-review-loop
```

Expected: branch pushed for PR creation.

## Self-Review

- Spec coverage: Phase 7 scheduled review reminders, in-app notifications, email reminder plumbing, stale valuation alerts, and P2/P3 guardrail reminders are covered. P1 drift email alerts are represented by the same notification channel once the client/server can persist non-sensitive drift facts; because P1 drift currently depends on decrypted values, the server does not generate that email from plaintext-sensitive data.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: shared notification types are used by service, repository, API, UI, and demo workspace.
