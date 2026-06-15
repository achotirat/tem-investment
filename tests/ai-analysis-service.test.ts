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
    resolveRecommendation: vi.fn(
      async () => ({} as AIAnalysisRunSummary["recommendations"][number]),
    ),
  };
}
