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
    {
      key: "P1",
      label: "P1 Store of Wealth",
      targetPercent: 60,
      valueBase: 52,
      percent: 52,
      driftPercent: -8,
    },
    {
      key: "P2",
      label: "P2 Investment",
      targetPercent: 30,
      valueBase: 30,
      percent: 30,
      driftPercent: 0,
    },
    {
      key: "P3",
      label: "P3 Speculation",
      targetPercent: 10,
      valueBase: 18,
      percent: 18,
      driftPercent: 8,
    },
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

    fireEvent.click(
      screen.getByLabelText("I consent to sending category-level portfolio data for AI review."),
    );
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
