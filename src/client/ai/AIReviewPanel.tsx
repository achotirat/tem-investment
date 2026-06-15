"use client";

import { useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, ShieldAlert } from "lucide-react";

import type {
  AIAnalysisRequest,
  AIAnalysisRunSummary,
  AIConsentScope,
  AIRecommendationStatus,
} from "../../shared/ai-analysis";
import type { PortfolioReviewSnapshot, RuleRecommendation } from "../../shared/dashboard";

type AIReviewPanelProps = {
  analysisRuns: AIAnalysisRunSummary[];
  recommendations: RuleRecommendation[];
  review: PortfolioReviewSnapshot;
  unlocked: boolean;
  onRunAnalysis?: (request: AIAnalysisRequest) => Promise<AIAnalysisRunSummary>;
  onResolveRecommendation?: (input: {
    recommendationId: string;
    status: Exclude<AIRecommendationStatus, "open">;
    note: string;
  }) => Promise<void> | void;
};

export function AIReviewPanel({
  analysisRuns,
  recommendations,
  review,
  unlocked,
  onRunAnalysis,
  onResolveRecommendation,
}: AIReviewPanelProps) {
  const [consented, setConsented] = useState(false);
  const [running, setRunning] = useState(false);
  const [localRun, setLocalRun] = useState<AIAnalysisRunSummary | null>(null);
  const latestRun = analysisRuns[0] ?? localRun;
  const openRecommendations = useMemo(
    () =>
      latestRun?.recommendations.filter((recommendation) => recommendation.status === "open") ?? [],
    [latestRun],
  );

  async function handleAnalyze() {
    if (!onRunAnalysis || !consented) return;
    setRunning(true);
    try {
      const run = await onRunAnalysis({
        consentScope: createDefaultAIConsentScope(),
        review: sanitizeReview(review),
        recommendations,
      });
      setLocalRun(run);
    } finally {
      setRunning(false);
    }
  }

  async function handleResolve(
    recommendationId: string,
    status: Exclude<AIRecommendationStatus, "open">,
  ) {
    await onResolveRecommendation?.({
      recommendationId,
      status,
      note: `${labelForResolution(status)} from AI review panel.`,
    });
  }

  return (
    <section className="panel span-12 ai-panel">
      <div className="panel-header">
        <div className="panel-title">
          <BrainCircuit aria-hidden="true" size={18} />
          AI review
        </div>
        <span className="pill">{openRecommendations.length} open</span>
      </div>
      <div className="panel-body ai-review-body">
        {!unlocked || review.locked ? (
          <div className="empty-state compact">
            <ShieldAlert aria-hidden="true" size={18} />
            Unlock sensitive data to analyze
          </div>
        ) : (
          <>
            <div className="ai-scope-list">
              <span>Bucket allocation percentages</span>
              <span>Concentration categories</span>
              <span>Active rules-based recommendations</span>
              <span>No position-level values</span>
            </div>

            <label className="checkbox-line">
              <input
                checked={consented}
                onChange={(event) => setConsented(event.target.checked)}
                type="checkbox"
              />
              I consent to sending category-level portfolio data for AI review.
            </label>

            <button
              className="primary-button"
              disabled={!consented || running || !onRunAnalysis}
              onClick={handleAnalyze}
              type="button"
            >
              {running ? "Analyzing" : "Analyze with AI"}
            </button>

            <div className="ai-result-list">
              {!latestRun ? (
                <div className="empty-state compact">
                  <CheckCircle2 aria-hidden="true" size={18} />
                  No AI review yet
                </div>
              ) : (
                latestRun.recommendations.map((recommendation) => (
                  <article
                    className={`ai-recommendation-row ${recommendation.severity}`}
                    key={recommendation.id}
                  >
                    <span className={`severity-pill ${recommendation.severity}`}>
                      {labelForSeverity(recommendation.severity)}
                    </span>
                    <div>
                      <strong>{recommendation.title}</strong>
                      <small>{recommendation.detail}</small>
                    </div>
                    {recommendation.status === "open" ? (
                      <div className="ai-actions">
                        <button
                          className="secondary-button"
                          onClick={() => handleResolve(recommendation.id, "approved")}
                          type="button"
                        >
                          Approve
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => handleResolve(recommendation.id, "ignored")}
                          type="button"
                        >
                          Ignore
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => handleResolve(recommendation.id, "deferred")}
                          type="button"
                        >
                          Defer
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => handleResolve(recommendation.id, "edited")}
                          type="button"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <span className="action-label">{labelForResolution(recommendation.status)}</span>
                    )}
                  </article>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function createDefaultAIConsentScope(): AIConsentScope {
  return {
    bucketAllocations: true,
    concentrationViews: true,
    activeRecommendations: true,
    positionLevelValues: false,
  };
}

function sanitizeReview(review: PortfolioReviewSnapshot): AIAnalysisRequest["review"] {
  return {
    baseCurrency: review.baseCurrency,
    secondaryCurrency: review.secondaryCurrency,
    bucketAllocations: review.bucketAllocations.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      targetPercent: bucket.targetPercent,
      percent: bucket.percent,
      driftPercent: bucket.driftPercent,
    })),
    exposures: Object.fromEntries(
      Object.entries(review.exposures).map(([key, groups]) => [
        key,
        groups.map((group) => ({
          key: group.key,
          label: group.label,
          percent: group.percent,
        })),
      ]),
    ),
  };
}

function labelForSeverity(severity: RuleRecommendation["severity"]): string {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Warning";
  return "Info";
}

function labelForResolution(status: AIRecommendationStatus): string {
  if (status === "approved") return "Approved";
  if (status === "ignored") return "Ignored";
  if (status === "deferred") return "Deferred";
  if (status === "edited") return "Edited";
  return "Open";
}
