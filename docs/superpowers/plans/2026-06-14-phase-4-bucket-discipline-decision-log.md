# Phase 4 Bucket Discipline and Decision Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first behavioral guardrails: decision-log audit persistence, P2 trade-plan enforcement, P3 entry warnings/override capture, and P1 sell/reduce reason logging.

**Architecture:** Keep sensitive decision details client-encrypted with AES-GCM before they reach the server. Store non-sensitive audit metadata in Postgres so the dashboard can list decisions without decryption. Reuse the Phase 3 holdings create path for add/open-position logging, and add a separate decisions API for manual sell/reduce logs.

**Tech Stack:** Next.js client components, Netlify Functions with modern `default export + Config`, Netlify Database/Postgres migrations, Vitest + Testing Library, Web Crypto AES-GCM helpers.

---

### File Structure

- Create `src/shared/discipline.ts` for decision-log, P2 trade-plan, and P3 guardrail types.
- Modify `src/shared/holdings.ts` so Phase 4 encrypted payloads can carry an encrypted trade plan, P3 override reason, and create decision details.
- Create `src/server/discipline-service.ts` for pure validation rules and decision-log creation orchestration.
- Create `src/server/decisions-repository.ts` for database persistence/listing.
- Modify `src/server/holdings-service.ts` and `src/server/holdings-repository.ts` to validate discipline rules and insert create/open decisions in the same holding workflow.
- Create `netlify/database/migrations/20260613003000_create-decision-logs/migration.sql`.
- Create `netlify/functions/decisions.mts` for authenticated decision-log listing and manual sell/reduce logging.
- Modify `src/client/holdings/encrypted-holding-submission.ts` to encrypt P2/P3/decision details.
- Modify `src/client/holdings/AddHoldingPanel.tsx` for P2 and P3 guardrail controls.
- Create `src/client/decisions/DecisionLogPanel.tsx` and `src/client/decisions/LogHoldingDecisionPanel.tsx`.
- Modify `src/client/CommandCenterApp.tsx`, `src/client/DashboardShell.tsx`, and `app/globals.css` for data loading and UI integration.

### Task 1: Decision Log Schema and Types

**Files:**
- Create: `src/shared/discipline.ts`
- Modify: `src/shared/holdings.ts`
- Create: `tests/decision-log-migration.test.ts`
- Create: `netlify/database/migrations/20260613003000_create-decision-logs/migration.sql`

- [ ] **Step 1: Write migration and type red tests**

Create `tests/decision-log-migration.test.ts` with checks for `decision_logs`, `encrypted_details JSONB NOT NULL`, and no plaintext `reason TEXT`, `notes TEXT`, or `trade_plan TEXT` columns.

- [ ] **Step 2: Run migration test to verify RED**

Run: `npm test -- tests/decision-log-migration.test.ts`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add shared types and migration**

Create `src/shared/discipline.ts` with:

```ts
import type { EncryptedField } from "./encryption";

export type DecisionAction =
  | "buy"
  | "sell"
  | "reduce"
  | "open_p2"
  | "edit_p2_plan"
  | "close_p2"
  | "p3_override";

export type DecisionScope = "holding" | "portfolio";

export type P2TradePlan = {
  entryReason: string;
  setup: string;
  stopLoss: string;
  takeProfitPlan: string;
  invalidationCondition: string;
  positionSizing: string;
  expectedHoldingPeriod: string;
};

export type P3GuardrailAcknowledgement = {
  overrideReason?: string;
  acknowledgedLossLimitBreach?: boolean;
};

export type EncryptedDecisionDetails = {
  reason: EncryptedField;
  tradePlan?: EncryptedField;
  p3OverrideReason?: EncryptedField;
};

export type DecisionLogInput = {
  householdId: string;
  holdingId?: string;
  actorIdentityUserId: string;
  action: DecisionAction;
  scope: DecisionScope;
  reasonRequired: boolean;
  encryptedDetails: EncryptedDecisionDetails;
  metadata: Record<string, string | number | boolean | null>;
};

export type DecisionLogSummary = Omit<DecisionLogInput, "encryptedDetails"> & {
  id: string;
  createdAt: string;
};
```

Modify `src/shared/holdings.ts` so encrypted values include optional `tradePlan`, `p3OverrideReason`, and optional `decisionLog`.

Create the migration with `decision_logs`, household P3 policy defaults, encrypted details, and indexes.

- [ ] **Step 4: Run migration test to verify GREEN**

Run: `npm test -- tests/decision-log-migration.test.ts`

Expected: PASS.

### Task 2: Discipline Rule Service

**Files:**
- Create: `src/server/discipline-service.ts`
- Test: `tests/discipline-service.test.ts`

- [ ] **Step 1: Write red tests for rules**

Cover:
- P2 active holdings require all seven trade-plan fields.
- P3 over-cap entries require override reason.
- P3 loss-limit breach requires acknowledgement.
- P1 sell/reduce decisions require a reason.

- [ ] **Step 2: Run rule tests to verify RED**

Run: `npm test -- tests/discipline-service.test.ts`

Expected: FAIL because `src/server/discipline-service.ts` does not exist.

- [ ] **Step 3: Implement pure validators**

Add `validateP2TradePlan`, `evaluateP3Guardrails`, and `validateDecisionLogInput`. Keep rules deterministic and independent from Netlify.

- [ ] **Step 4: Run rule tests to verify GREEN**

Run: `npm test -- tests/discipline-service.test.ts`

Expected: PASS.

### Task 3: Repository and API

**Files:**
- Create: `src/server/decisions-repository.ts`
- Create: `netlify/functions/decisions.mts`
- Modify: `src/server/holdings-service.ts`
- Modify: `src/server/holdings-repository.ts`
- Test: `tests/decision-log-service.test.ts`

- [ ] **Step 1: Write red service tests**

Cover that create-holding inserts a create/open decision when `decisionLog` is present and rejects invalid discipline input before persistence.

- [ ] **Step 2: Run service tests to verify RED**

Run: `npm test -- tests/decision-log-service.test.ts`

Expected: FAIL on missing repository/service behavior.

- [ ] **Step 3: Implement repository/API path**

Add database insert/listing for decision logs. `holdings.mts` keeps using authenticated household lookup and passes `actorIdentityUserId`. `decisions.mts` supports `GET /api/decisions` and `POST /api/decisions` for manual sell/reduce logs.

- [ ] **Step 4: Run service tests to verify GREEN**

Run: `npm test -- tests/decision-log-service.test.ts`

Expected: PASS.

### Task 4: Client Encryption Workflow

**Files:**
- Modify: `src/client/holdings/encrypted-holding-submission.ts`
- Create: `src/client/decisions/encrypted-decision-submission.ts`
- Test: `tests/discipline-encryption-workflow.test.ts`

- [ ] **Step 1: Write red encryption tests**

Verify P2 plan text, P3 override reason, and decision reason do not appear in serialized submission payloads and are stored as AES-GCM encrypted fields.

- [ ] **Step 2: Run encryption tests to verify RED**

Run: `npm test -- tests/discipline-encryption-workflow.test.ts`

Expected: FAIL until client encryption supports Phase 4 fields.

- [ ] **Step 3: Implement encryption helpers**

Encrypt P2 trade plan JSON, P3 override reason, and manual decision reasons before network submission.

- [ ] **Step 4: Run encryption tests to verify GREEN**

Run: `npm test -- tests/discipline-encryption-workflow.test.ts`

Expected: PASS.

### Task 5: Dashboard UI Integration

**Files:**
- Modify: `src/client/holdings/AddHoldingPanel.tsx`
- Create: `src/client/decisions/DecisionLogPanel.tsx`
- Create: `src/client/decisions/LogHoldingDecisionPanel.tsx`
- Modify: `src/client/DashboardShell.tsx`
- Modify: `src/client/CommandCenterApp.tsx`
- Modify: `app/globals.css`
- Test: `tests/add-holding-discipline-panel.test.tsx`
- Test: `tests/decision-log-panel.test.tsx`

- [ ] **Step 1: Write red UI tests**

Cover:
- P2 save is blocked until all trade-plan fields are filled.
- P3 over-cap warning requires override reason.
- Decision log panel displays non-sensitive action metadata.
- P1 sell/reduce log panel requires unlock and reason.

- [ ] **Step 2: Run UI tests to verify RED**

Run: `npm test -- tests/add-holding-discipline-panel.test.tsx tests/decision-log-panel.test.tsx`

Expected: FAIL until UI components exist/are updated.

- [ ] **Step 3: Implement UI**

Keep the current dense operational dashboard style. Use compact panels, labels, warnings, and buttons. Do not show plaintext encrypted decision details in the list.

- [ ] **Step 4: Run UI tests to verify GREEN**

Run: `npm test -- tests/add-holding-discipline-panel.test.tsx tests/decision-log-panel.test.tsx`

Expected: PASS.

### Task 6: Final Verification and Publish

**Files:**
- All Phase 4 files.

- [ ] **Step 1: Run full tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: build succeeds with TypeScript checks.

- [ ] **Step 3: Run production audit**

Run: `npm audit --omit=dev`

Expected: `found 0 vulnerabilities`.

- [ ] **Step 4: Run Netlify offline build**

Run: `./node_modules/.bin/netlify build --offline`

Expected: Next build succeeds and functions bundle includes `bootstrap.mts`, `holdings.mts`, and `decisions.mts`.

- [ ] **Step 5: Browser smoke**

Run Netlify dev, mock local Identity/bootstrap/holdings/decisions if needed, then verify:
- locked dashboard blocks sensitive submissions,
- unlock enables P2/P3/P1 discipline flows,
- decision log rows render,
- mobile viewport has no horizontal overflow.

### Self-Review

- Spec coverage: covers decision log/audit, P1 sell/reduce reason logging, P2 strict plan, P3 cap/loss override acknowledgement, and dashboard visibility.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: shared types feed server validators, client encryption, repositories, and UI props.
