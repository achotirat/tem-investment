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
} as const;

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
