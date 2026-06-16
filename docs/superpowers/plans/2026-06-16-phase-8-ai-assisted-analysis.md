# Phase 8 AI-Assisted Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consent-gated AI portfolio analysis that uses category-level dashboard context, records the consent scope, and lets users resolve AI recommendations.

**Architecture:** The client builds an explicit AI data-scope request from the unlocked dashboard review and active rule recommendations. A Netlify Function authenticates the household, runs the request through an adapter-backed AI analysis service, stores only the consent scope, input summary, run metadata, and generated recommendation lifecycle, then returns recommendations to the dashboard. Local/dev environments use a deterministic dry-run provider unless `OPENAI_BASE_URL` and `AI_ANALYSIS_MODEL` are configured for a Netlify AI Gateway compatible chat-completions call.

**Tech Stack:** Next.js client components, Netlify Functions modern default-export syntax, Netlify Database/Postgres migrations, optional Netlify AI Gateway through `fetch`, Vitest, Testing Library.

---

## File Structure

- Create `src/shared/ai-analysis.ts` for consent scopes, analysis runs, and AI recommendation contracts.
- Create `netlify/database/migrations/20260616000000_create-ai-analysis/migration.sql` for AI analysis runs and recommendation lifecycle tables.
- Create `src/server/ai-analysis-service.ts` for consent previews, sanitized input summaries, prompt building, dry-run provider, optional OpenAI-compatible provider, and run orchestration.
- Create `src/server/ai-analysis-repository.ts` for row mappers and Netlify Database persistence.
- Create `netlify/functions/ai-analysis.mts` for authenticated run/list/resolve endpoints at `/api/ai-analysis`.
- Create `src/client/ai/AIReviewPanel.tsx` for consent preview, Analyze with AI action, result display, and approve/ignore/defer/edit controls.
- Modify `src/client/DashboardShell.tsx` to render the AI review panel after rules/review-loop panels.
- Modify `src/client/CommandCenterApp.tsx` to load analysis runs, call `/api/ai-analysis`, and resolve AI recommendations.
- Modify `src/client/demo-workspace.ts` so demo mode starts with an empty AI history and can create a dry-run analysis in memory.
- Modify `app/globals.css` for AI panel rows and consent scope controls.
- Add tests:
  - `tests/ai-analysis-migration.test.ts`
  - `tests/ai-analysis-service.test.ts`
  - `tests/ai-analysis-repository.test.ts`
  - `tests/ai-review-panel.test.tsx`
  - update `tests/dashboard-shell.test.tsx`
  - update `tests/demo-login.test.tsx`

## Scope Decisions

- The default AI payload is category-level only: bucket allocations, exposure summaries, active rule recommendations, and stale-warning metadata already visible on the dashboard.
- Position-level values are not included in Phase 8. The consent scope type includes `positionLevelValues: false` so the UI and records are explicit, but the Analyze action rejects `true` until encrypted AI-payload persistence is designed.
- Full prompt/response payloads are not persisted because AI context and payloads are sensitive. The database stores a sanitized `input_summary`, consent scope, model/provider metadata, and recommendation lifecycle rows.
- The optional AI Gateway provider is behind an interface. Tests use dry-run and mocked fetch behavior.

## Task 1: Shared AI Contracts and Migration

**Files:**
- Create: `src/shared/ai-analysis.ts`
- Create: `netlify/database/migrations/20260616000000_create-ai-analysis/migration.sql`
- Test: `tests/ai-analysis-migration.test.ts`

- [ ] **Step 1: Write the failing migration test**

Create `tests/ai-analysis-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI analysis migration", () => {
  const migration = readFileSync(
    "netlify/database/migrations/20260616000000_create-ai-analysis/migration.sql",
    "utf8",
  );

  it("creates AI analysis run and recommendation tables", () => {
    expect(migration).toContain("CREATE TABLE ai_analysis_runs");
    expect(migration).toContain("CREATE TABLE ai_recommendations");
    expect(migration).toContain("CONSTRAINT ai_recommendations_status_check");
  });

  it("stores consent scope and sanitized input summary without plaintext portfolio values", () => {
    expect(migration).toContain("consent_scope JSONB NOT NULL");
    expect(migration).toContain("input_summary JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).not.toMatch(/\bprompt_payload\b|\braw_response\b|\bplaintext\b|\bdecrypted\b|\bcurrent_value\b NUMERIC/i);
  });

  it("tracks recommendation resolution lifecycle", () => {
    expect(migration).toContain("resolved_at TIMESTAMPTZ");
    expect(migration).toContain("resolution_actor_identity_user_id TEXT");
    expect(migration).toContain("resolution_note TEXT");
  });
});
```

- [ ] **Step 2: Run migration test to verify RED**

Run: `npm test -- tests/ai-analysis-migration.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add shared AI analysis contracts**

Create `src/shared/ai-analysis.ts`:

```ts
import type { RecommendationCategory, RecommendationSeverity, RuleRecommendation } from "./dashboard";

export type AIConsentScope = {
  bucketAllocations: true;
  concentrationViews: true;
  activeRecommendations: true;
  positionLevelValues: false;
};

export type AIAnalysisStatus = "completed" | "failed";
export type AIProviderKind = "dry_run" | "netlify_ai_gateway";

export type AIRecommendationStatus = "open" | "approved" | "ignored" | "deferred" | "edited";

export type AIRecommendationCategory =
  | RecommendationCategory
  | "risk"
  | "behavior"
  | "valuation";

export type AIInputSummary = {
  baseCurrency: string;
  secondaryCurrency: string;
  bucketCount: number;
  exposureGroupCount: number;
  recommendationCount: number;
  criticalRecommendationCount: number;
  warningRecommendationCount: number;
};

export type AIAnalysisRequest = {
  consentScope: AIConsentScope;
  review: {
    baseCurrency: string;
    secondaryCurrency: string;
    bucketAllocations: Array<{
      key: string;
      label: string;
      targetPercent: number;
      percent: number;
      driftPercent: number;
    }>;
    exposures: Record<string, Array<{ key: string; label: string; percent: number }>>;
  };
  recommendations: RuleRecommendation[];
};

export type AIRecommendationDraft = {
  severity: RecommendationSeverity;
  category: AIRecommendationCategory;
  title: string;
  detail: string;
  actionLabel: string;
  sourceRecommendationId?: string;
};

export type AIRecommendationSummary = AIRecommendationDraft & {
  id: string;
  runId: string;
  householdId: string;
  status: AIRecommendationStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolutionActorIdentityUserId: string | null;
  resolutionNote: string | null;
};

export type AIAnalysisRunSummary = {
  id: string;
  householdId: string;
  actorIdentityUserId: string;
  status: AIAnalysisStatus;
  provider: AIProviderKind;
  model: string;
  consentScope: AIConsentScope;
  inputSummary: AIInputSummary;
  createdAt: string;
  completedAt: string;
  errorMessage: string | null;
  recommendations: AIRecommendationSummary[];
};
```

- [ ] **Step 4: Add the migration**

Create `netlify/database/migrations/20260616000000_create-ai-analysis/migration.sql`:

```sql
CREATE TABLE ai_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  actor_identity_user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  consent_scope JSONB NOT NULL,
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_analysis_runs_status_check CHECK (status IN ('completed', 'failed')),
  CONSTRAINT ai_analysis_runs_provider_check CHECK (provider IN ('dry_run', 'netlify_ai_gateway'))
);

CREATE TABLE ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ai_analysis_runs(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  action_label TEXT NOT NULL,
  source_recommendation_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_actor_identity_user_id TEXT,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_recommendations_severity_check CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT ai_recommendations_status_check CHECK (status IN ('open', 'approved', 'ignored', 'deferred', 'edited'))
);

CREATE INDEX ai_analysis_runs_household_created_at_idx
  ON ai_analysis_runs(household_id, created_at DESC);

CREATE INDEX ai_recommendations_household_status_idx
  ON ai_recommendations(household_id, status, created_at DESC);
```

- [ ] **Step 5: Run migration test to verify GREEN**

Run: `npm test -- tests/ai-analysis-migration.test.ts`

Expected: PASS.

## Task 2: AI Analysis Service

**Files:**
- Create: `src/server/ai-analysis-service.ts`
- Test: `tests/ai-analysis-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `tests/ai-analysis-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  DryRunAIAnalysisProvider,
  OpenAICompatibleAIAnalysisProvider,
  buildAIInputSummary,
  createDefaultAIConsentScope,
  runAIAnalysis,
  type AIAnalysisRepository,
} from "../src/server/ai-analysis-service";
import type { AIAnalysisRequest, AIAnalysisRunSummary } from "../src/shared/ai-analysis";

const request: AIAnalysisRequest = {
  consentScope: {
    bucketAllocations: true,
    concentrationViews: true,
    activeRecommendations: true,
    positionLevelValues: false,
  },
  review: {
    baseCurrency: "THB",
    secondaryCurrency: "USD",
    bucketAllocations: [
      { key: "P1", label: "P1 Store of Wealth", targetPercent: 60, percent: 52, driftPercent: -8 },
      { key: "P2", label: "P2 Investment", targetPercent: 30, percent: 30, driftPercent: 0 },
      { key: "P3", label: "P3 Speculation", targetPercent: 10, percent: 18, driftPercent: 8 },
    ],
    exposures: {
      assetClass: [{ key: "crypto", label: "Crypto", percent: 58 }],
      platform: [],
      currency: [],
      owner: [],
      liquidity: [],
      leverage: [],
    },
  },
  recommendations: [
    {
      id: "p3:allocation-cap",
      severity: "critical",
      category: "p3_guardrail",
      title: "P3 is above its speculation cap",
      detail: "P3 is 18% versus a 10% target.",
      actionLabel: "Reduce or log override",
    },
  ],
};

describe("AI analysis service", () => {
  it("builds an explicit default consent scope", () => {
    expect(createDefaultAIConsentScope()).toEqual({
      bucketAllocations: true,
      concentrationViews: true,
      activeRecommendations: true,
      positionLevelValues: false,
    });
  });

  it("summarizes AI input without storing exact portfolio values", () => {
    expect(buildAIInputSummary(request)).toEqual({
      baseCurrency: "THB",
      secondaryCurrency: "USD",
      bucketCount: 3,
      exposureGroupCount: 1,
      recommendationCount: 1,
      criticalRecommendationCount: 1,
      warningRecommendationCount: 0,
    });
  });

  it("rejects position-level values in phase 8", async () => {
    const repository = repositoryStub();

    await expect(
      runAIAnalysis({
        repository,
        provider: new DryRunAIAnalysisProvider(),
        householdId: "household_1",
        actorIdentityUserId: "user_1",
        request: {
          ...request,
          consentScope: { ...request.consentScope, positionLevelValues: true as false },
        },
      }),
    ).rejects.toThrow("Position-level AI analysis is not enabled in Phase 8.");
  });

  it("runs deterministic dry-run analysis and persists the lifecycle", async () => {
    const repository = repositoryStub();

    const run = await runAIAnalysis({
      repository,
      provider: new DryRunAIAnalysisProvider(),
      householdId: "household_1",
      actorIdentityUserId: "user_1",
      request,
    });

    expect(repository.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "dry_run",
        model: "dry-run-rules",
        inputSummary: expect.objectContaining({ recommendationCount: 1 }),
      }),
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          title: "AI review: P3 is above its speculation cap",
        }),
      ]),
    );
    expect(run.recommendations[0]?.status).toBe("open");
  });

  it("parses OpenAI-compatible JSON recommendation responses", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                recommendations: [
                  {
                    severity: "warning",
                    category: "allocation",
                    title: "Review P1 funding",
                    detail: "P1 is under target and should be reviewed before new speculation.",
                    actionLabel: "Review allocation",
                  },
                ],
              }),
            },
          },
        ],
      }),
    }));
    const provider = new OpenAICompatibleAIAnalysisProvider({
      baseUrl: "https://gateway.example/v1",
      model: "netlify-model",
      fetchImpl: fetchMock as typeof fetch,
    });

    const drafts = await provider.analyze(request);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(drafts[0]).toMatchObject({
      title: "Review P1 funding",
      actionLabel: "Review allocation",
    });
  });
});

function repositoryStub(): AIAnalysisRepository {
  return {
    createRun: vi.fn(async (run, recommendations) => ({
      id: "run_1",
      householdId: run.householdId,
      actorIdentityUserId: run.actorIdentityUserId,
      status: run.status,
      provider: run.provider,
      model: run.model,
      consentScope: run.consentScope,
      inputSummary: run.inputSummary,
      createdAt: "2026-06-16T00:00:00.000Z",
      completedAt: "2026-06-16T00:00:01.000Z",
      errorMessage: null,
      recommendations: recommendations.map((recommendation, index) => ({
        id: `recommendation_${index + 1}`,
        runId: "run_1",
        householdId: run.householdId,
        ...recommendation,
        status: "open",
        createdAt: "2026-06-16T00:00:01.000Z",
        resolvedAt: null,
        resolutionActorIdentityUserId: null,
        resolutionNote: null,
      })),
    })),
    listRuns: vi.fn(async () => []),
    resolveRecommendation: vi.fn(async () => ({} as AIAnalysisRunSummary["recommendations"][number])),
  };
}
```

- [ ] **Step 2: Run service tests to verify RED**

Run: `npm test -- tests/ai-analysis-service.test.ts`

Expected: FAIL because `ai-analysis-service.ts` does not exist.

- [ ] **Step 3: Implement the AI analysis service**

Create `src/server/ai-analysis-service.ts` with:

- `AIAnalysisRepository` interface containing `createRun`, `listRuns`, and `resolveRecommendation`.
- `createDefaultAIConsentScope()` returning all category-level scopes true and `positionLevelValues: false`.
- `buildAIInputSummary(request)` counting only categories, exposures, and recommendation severities.
- `DryRunAIAnalysisProvider` that mirrors the highest-severity active rule recommendations into deterministic AI recommendation drafts.
- `OpenAICompatibleAIAnalysisProvider` that POSTs a JSON-only chat-completions request to `{baseUrl}/chat/completions`.
- `runAIAnalysis()` that rejects position-level values, calls the provider, and persists the completed run.

- [ ] **Step 4: Run service tests to verify GREEN**

Run: `npm test -- tests/ai-analysis-service.test.ts`

Expected: PASS.

## Task 3: AI Analysis Repository and Function

**Files:**
- Create: `src/server/ai-analysis-repository.ts`
- Create: `netlify/functions/ai-analysis.mts`
- Test: `tests/ai-analysis-repository.test.ts`

- [ ] **Step 1: Write failing repository mapper tests**

Create `tests/ai-analysis-repository.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  mapAIAnalysisRuns,
  mapAIRecommendationRows,
  type AIAnalysisRunRow,
  type AIRecommendationRow,
} from "../src/server/ai-analysis-repository";

const consentScope = {
  bucketAllocations: true,
  concentrationViews: true,
  activeRecommendations: true,
  positionLevelValues: false,
};

const inputSummary = {
  baseCurrency: "THB",
  secondaryCurrency: "USD",
  bucketCount: 3,
  exposureGroupCount: 1,
  recommendationCount: 1,
  criticalRecommendationCount: 1,
  warningRecommendationCount: 0,
};

describe("AI analysis repository mappers", () => {
  it("maps AI recommendation rows", () => {
    const rows: AIRecommendationRow[] = [
      {
        id: "recommendation_1",
        run_id: "run_1",
        household_id: "household_1",
        severity: "critical",
        category: "p3_guardrail",
        title: "AI review: P3 cap",
        detail: "Review speculation exposure.",
        action_label: "Review P3",
        source_recommendation_id: "p3:allocation-cap",
        status: "open",
        created_at: "2026-06-16T00:00:00.000Z",
        resolved_at: null,
        resolution_actor_identity_user_id: null,
        resolution_note: null,
      },
    ];

    expect(mapAIRecommendationRows(rows)).toEqual([
      {
        id: "recommendation_1",
        runId: "run_1",
        householdId: "household_1",
        severity: "critical",
        category: "p3_guardrail",
        title: "AI review: P3 cap",
        detail: "Review speculation exposure.",
        actionLabel: "Review P3",
        sourceRecommendationId: "p3:allocation-cap",
        status: "open",
        createdAt: "2026-06-16T00:00:00.000Z",
        resolvedAt: null,
        resolutionActorIdentityUserId: null,
        resolutionNote: null,
      },
    ]);
  });

  it("groups recommendations under their analysis run", () => {
    const runRows: AIAnalysisRunRow[] = [
      {
        id: "run_1",
        household_id: "household_1",
        actor_identity_user_id: "user_1",
        status: "completed",
        provider: "dry_run",
        model: "dry-run-rules",
        consent_scope: consentScope,
        input_summary: inputSummary,
        created_at: "2026-06-16T00:00:00.000Z",
        completed_at: "2026-06-16T00:00:01.000Z",
        error_message: null,
      },
    ];
    const recommendationRows: AIRecommendationRow[] = [
      {
        id: "recommendation_1",
        run_id: "run_1",
        household_id: "household_1",
        severity: "critical",
        category: "p3_guardrail",
        title: "AI review: P3 cap",
        detail: "Review speculation exposure.",
        action_label: "Review P3",
        source_recommendation_id: "p3:allocation-cap",
        status: "open",
        created_at: "2026-06-16T00:00:00.000Z",
        resolved_at: null,
        resolution_actor_identity_user_id: null,
        resolution_note: null,
      },
    ];

    expect(mapAIAnalysisRuns(runRows, recommendationRows)).toEqual([
      {
        id: "run_1",
        householdId: "household_1",
        actorIdentityUserId: "user_1",
        status: "completed",
        provider: "dry_run",
        model: "dry-run-rules",
        consentScope,
        inputSummary,
        createdAt: "2026-06-16T00:00:00.000Z",
        completedAt: "2026-06-16T00:00:01.000Z",
        errorMessage: null,
        recommendations: [
          expect.objectContaining({
            id: "recommendation_1",
            runId: "run_1",
          }),
        ],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run repository tests to verify RED**

Run: `npm test -- tests/ai-analysis-repository.test.ts`

Expected: FAIL because `ai-analysis-repository.ts` does not exist.

- [ ] **Step 3: Implement repository and Netlify Function**

Create `src/server/ai-analysis-repository.ts`:

- Export `AIAnalysisRunRow`, `AIRecommendationRow`, `mapAIRecommendationRows`, and `mapAIAnalysisRuns`.
- Implement `NetlifyAIAnalysisRepository.createRun(run, recommendations)` using a transaction through `database.pool`.
- Implement `listRuns(householdId)` returning the latest 10 analysis runs and their recommendations.
- Implement `resolveRecommendation({ householdId, recommendationId, status, actorIdentityUserId, note })`.

Create `netlify/functions/ai-analysis.mts`:

- Authenticate with `getUser()`.
- Resolve household with `NetlifyHouseholdRepository`.
- `GET` returns `{ runs }`.
- `POST` accepts `AIAnalysisRequest`, uses `DryRunAIAnalysisProvider` unless `OPENAI_BASE_URL` and `AI_ANALYSIS_MODEL` are set, and returns `{ run }`.
- `PATCH` accepts `{ recommendationId, status, note }` and returns `{ recommendation }`.
- Use `export const config: Config = { path: "/api/ai-analysis" }`.

- [ ] **Step 4: Run repository tests to verify GREEN**

Run: `npm test -- tests/ai-analysis-repository.test.ts`

Expected: PASS.

## Task 4: Client AI Review Panel

**Files:**
- Create: `src/client/ai/AIReviewPanel.tsx`
- Modify: `src/client/DashboardShell.tsx`
- Modify: `src/client/CommandCenterApp.tsx`
- Modify: `src/client/demo-workspace.ts`
- Modify: `app/globals.css`
- Test: `tests/ai-review-panel.test.tsx`
- Update: `tests/dashboard-shell.test.tsx`
- Update: `tests/demo-login.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `tests/ai-review-panel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AIReviewPanel } from "../src/client/ai/AIReviewPanel";
import type { AIAnalysisRunSummary } from "../src/shared/ai-analysis";
import type { PortfolioReviewSnapshot, RuleRecommendation } from "../src/shared/dashboard";

const review: PortfolioReviewSnapshot = {
  locked: false,
  baseCurrency: "THB",
  secondaryCurrency: "USD",
  totalBaseValue: 100,
  totalSecondaryValue: 3,
  bucketAllocations: [
    { key: "P1", label: "P1 Store of Wealth", targetPercent: 60, valueBase: 52, percent: 52, driftPercent: -8 },
    { key: "P2", label: "P2 Investment", targetPercent: 30, valueBase: 30, percent: 30, driftPercent: 0 },
    { key: "P3", label: "P3 Speculation", targetPercent: 10, valueBase: 18, percent: 18, driftPercent: 8 },
  ],
  ownerNetWorth: [],
  exposures: {
    assetClass: [{ key: "crypto", label: "Crypto", valueBase: 58, percent: 58 }],
    platform: [],
    currency: [],
    owner: [],
    liquidity: [],
    leverage: [],
  },
};

const recommendation: RuleRecommendation = {
  id: "p3:allocation-cap",
  severity: "critical",
  category: "p3_guardrail",
  title: "P3 is above its speculation cap",
  detail: "P3 is 18% versus a 10% target.",
  actionLabel: "Reduce or log override",
};

const run: AIAnalysisRunSummary = {
  id: "run_1",
  householdId: "household_1",
  actorIdentityUserId: "user_1",
  status: "completed",
  provider: "dry_run",
  model: "dry-run-rules",
  consentScope: {
    bucketAllocations: true,
    concentrationViews: true,
    activeRecommendations: true,
    positionLevelValues: false,
  },
  inputSummary: {
    baseCurrency: "THB",
    secondaryCurrency: "USD",
    bucketCount: 3,
    exposureGroupCount: 1,
    recommendationCount: 1,
    criticalRecommendationCount: 1,
    warningRecommendationCount: 0,
  },
  createdAt: "2026-06-16T00:00:00.000Z",
  completedAt: "2026-06-16T00:00:01.000Z",
  errorMessage: null,
  recommendations: [
    {
      id: "ai_recommendation_1",
      runId: "run_1",
      householdId: "household_1",
      severity: "critical",
      category: "p3_guardrail",
      title: "AI review: P3 is above its speculation cap",
      detail: "Handle speculation exposure before adding risk.",
      actionLabel: "Review P3",
      sourceRecommendationId: "p3:allocation-cap",
      status: "open",
      createdAt: "2026-06-16T00:00:01.000Z",
      resolvedAt: null,
      resolutionActorIdentityUserId: null,
      resolutionNote: null,
    },
  ],
};

describe("AIReviewPanel", () => {
  it("requires unlock before AI analysis", () => {
    render(
      <AIReviewPanel
        analysisRuns={[]}
        recommendations={[recommendation]}
        review={{ ...review, locked: true }}
        unlocked={false}
      />,
    );

    expect(screen.getByText("Unlock sensitive data to analyze")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analyze with AI" })).not.toBeInTheDocument();
  });

  it("shows consent scope and runs AI analysis only after acknowledgement", async () => {
    const onRunAnalysis = vi.fn(async () => run);

    render(
      <AIReviewPanel
        analysisRuns={[]}
        onRunAnalysis={onRunAnalysis}
        recommendations={[recommendation]}
        review={review}
        unlocked
      />,
    );

    const analyze = screen.getByRole("button", { name: "Analyze with AI" });
    expect(analyze).toBeDisabled();

    fireEvent.click(screen.getByLabelText("I consent to sending category-level portfolio data for AI review."));
    fireEvent.click(analyze);

    await waitFor(() => expect(onRunAnalysis).toHaveBeenCalledTimes(1));
    expect(onRunAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        consentScope: expect.objectContaining({ positionLevelValues: false }),
        recommendations: [recommendation],
      }),
    );
  });

  it("renders AI recommendations and resolves them", async () => {
    const onResolveRecommendation = vi.fn(async () => undefined);

    render(
      <AIReviewPanel
        analysisRuns={[run]}
        onResolveRecommendation={onResolveRecommendation}
        recommendations={[recommendation]}
        review={review}
        unlocked
      />,
    );

    expect(screen.getByText("AI review: P3 is above its speculation cap")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(onResolveRecommendation).toHaveBeenCalledWith({
        recommendationId: "ai_recommendation_1",
        status: "approved",
        note: "Approved from AI review panel.",
      }),
    );
  });
});
```

- [ ] **Step 2: Run UI tests to verify RED**

Run: `npm test -- tests/ai-review-panel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the client UI and app wiring**

Create `src/client/ai/AIReviewPanel.tsx`:

- Render a `span-12` panel titled `AI review`.
- If `unlocked` is false or `review.locked` is true, show `Unlock sensitive data to analyze`.
- If unlocked, show the data-scope checklist and a consent checkbox.
- Disable `Analyze with AI` until consent is checked.
- Call `onRunAnalysis({ consentScope, review: sanitizedReview, recommendations })`.
- Render the latest run recommendations with `Approve`, `Ignore`, `Defer`, and `Edit` buttons for open items.

Modify `src/client/DashboardShell.tsx`:

- Import `AIReviewPanel`, `AIAnalysisRunSummary`, `AIAnalysisRequest`, and `AIRecommendationStatus`.
- Add `aiAnalysisRuns?: AIAnalysisRunSummary[]`, `onRunAIAnalysis?: (request: AIAnalysisRequest) => Promise<AIAnalysisRunSummary>`, and `onResolveAIRecommendation?: (input: { recommendationId: string; status: AIRecommendationStatus; note: string }) => Promise<void> | void`.
- Render `<AIReviewPanel />` after `<NotificationCenterPanel />`.

Modify `src/client/CommandCenterApp.tsx`:

- Add `aiAnalysisRuns` state.
- Load `/api/ai-analysis` alongside holdings, decisions, prices, and notifications.
- In demo mode, set `demoWorkspace.aiAnalysisRuns`.
- Add `handleRunAIAnalysis` that POSTs `/api/ai-analysis` in real mode and creates a deterministic in-memory run in demo mode.
- Add `handleResolveAIRecommendation` that PATCHes `/api/ai-analysis` in real mode and updates local state in demo mode.
- Pass AI props to `DashboardShell`.

Modify `src/client/demo-workspace.ts`:

- Add `aiAnalysisRuns: AIAnalysisRunSummary[]` to `DemoWorkspace`, initialized to `[]`.

Modify `app/globals.css`:

- Add `.ai-scope-list`, `.ai-result-list`, `.ai-recommendation-row`, and `.ai-actions`.
- Include `.ai-recommendation-row` in the mobile single-column grid rule.

- [ ] **Step 4: Run UI tests to verify GREEN**

Run: `npm test -- tests/ai-review-panel.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx`

Expected: PASS.

## Task 5: Full Verification and Branch Completion

**Files:**
- All Phase 8 files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/ai-analysis-migration.test.ts tests/ai-analysis-service.test.ts tests/ai-analysis-repository.test.ts tests/ai-review-panel.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Browser smoke demo AI review**

Run: `npm run next:dev -- -H 127.0.0.1 -p 3000`

Open `http://localhost:3000`, click `Use demo`, unlock with `demo`, verify:

- `AI review` panel is visible after unlock.
- Consent checkbox enables `Analyze with AI`.
- Running analysis creates an AI recommendation.
- Approve/Ignore/Defer changes recommendation status.
- Mobile width around 390px has no horizontal overflow.

If the sandbox blocks port binding with `listen EPERM`, record this as an environment limitation and continue with automated verification evidence.

- [ ] **Step 5: Commit and push**

Run:

```bash
git status --short --branch
git add docs/superpowers/plans/2026-06-16-phase-8-ai-assisted-analysis.md src/shared/ai-analysis.ts netlify/database/migrations/20260616000000_create-ai-analysis/migration.sql src/server/ai-analysis-service.ts src/server/ai-analysis-repository.ts netlify/functions/ai-analysis.mts src/client/ai/AIReviewPanel.tsx src/client/CommandCenterApp.tsx src/client/DashboardShell.tsx src/client/demo-workspace.ts app/globals.css tests/ai-analysis-migration.test.ts tests/ai-analysis-service.test.ts tests/ai-analysis-repository.test.ts tests/ai-review-panel.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx
git commit -m "Add phase 8 AI assisted analysis"
git push -u origin phase-8-ai-assisted-analysis
```

Expected: branch pushed for PR creation.

## Self-Review

- Spec coverage: The plan implements consent-gated analysis, data-scope preview, consent recording, and recommendation lifecycle resolution. The default payload excludes position-level values to avoid persisting sensitive AI payloads before encrypted AI-payload storage exists.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: `AIAnalysisRequest`, `AIAnalysisRunSummary`, and `AIRecommendationStatus` are shared by service, repository, API, UI, and demo mode.
