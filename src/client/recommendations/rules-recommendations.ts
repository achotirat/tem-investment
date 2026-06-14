import type { PortfolioReviewSnapshot, RuleRecommendation } from "../../shared/dashboard";
import type { HoldingSummary } from "../../shared/holdings";
import type { ValuationFreshnessWarning } from "../../shared/pricing";

type BuildRulesInput = {
  review: PortfolioReviewSnapshot;
  holdings: HoldingSummary[];
  staleWarnings: ValuationFreshnessWarning[];
  p1RebalanceBandPercent?: number;
  concentrationWarningPercent?: number;
};

export function buildRulesBasedRecommendations({
  review,
  holdings,
  staleWarnings,
  p1RebalanceBandPercent = 5,
  concentrationWarningPercent = 50,
}: BuildRulesInput): RuleRecommendation[] {
  if (review.locked) return [];

  const recommendations: RuleRecommendation[] = [];

  const p1 = review.bucketAllocations.find((bucket) => bucket.key === "P1");
  if (p1 && Math.abs(p1.driftPercent) > p1RebalanceBandPercent) {
    recommendations.push({
      id: "allocation:P1",
      severity: "warning",
      category: "allocation",
      title: "P1 drifted outside its rebalance band",
      detail: `P1 is ${formatPercent(p1.percent)}% versus a ${formatPercent(
        p1.targetPercent,
      )}% target.`,
      actionLabel: "Review rebalance decision",
    });
  }

  const p3 = review.bucketAllocations.find((bucket) => bucket.key === "P3");
  if (p3 && p3.percent > p3.targetPercent) {
    recommendations.push({
      id: "p3:allocation-cap",
      severity: "critical",
      category: "p3_guardrail",
      title: "P3 is above its speculation cap",
      detail: `P3 is ${formatPercent(p3.percent)}% versus a ${formatPercent(
        p3.targetPercent,
      )}% target.`,
      actionLabel: "Reduce or log override",
    });
  }

  for (const holding of holdings) {
    if (
      holding.status === "active" &&
      holding.portfolioBucket === "P2" &&
      !holding.encryptedValues.tradePlan
    ) {
      recommendations.push({
        id: `trade-plan:${holding.id}`,
        severity: "warning",
        category: "trade_plan",
        title: "P2 position is missing a trade plan",
        detail: `${holding.assetLabel} needs entry, stop, target, invalidation, sizing, and holding-period logic.`,
        actionLabel: "Add trade plan",
        relatedHoldingId: holding.id,
      });
    }
  }

  for (const warning of staleWarnings) {
    recommendations.push({
      id: `stale:${warning.holdingId}`,
      severity: "warning",
      category: "stale_valuation",
      title: "Valuation is stale",
      detail: `${warning.assetLabel} is ${warning.daysOld} days old; threshold is ${warning.staleAfterDays} days.`,
      actionLabel: "Update valuation",
      relatedHoldingId: warning.holdingId,
    });
  }

  addConcentrationRecommendations(recommendations, review, concentrationWarningPercent);

  const leveraged = review.exposures.leverage.find((group) => group.key === "leveraged");
  if (leveraged && leveraged.percent > 0) {
    recommendations.push({
      id: "leverage:derivative-exposure",
      severity: leveraged.percent >= 10 ? "warning" : "info",
      category: "leverage",
      title: "Leveraged or derivative exposure exists",
      detail: `${formatPercent(
        leveraged.percent,
      )}% of portfolio value is in derivative-class holdings.`,
      actionLabel: "Review risk controls",
    });
  }

  return recommendations.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function addConcentrationRecommendations(
  recommendations: RuleRecommendation[],
  review: PortfolioReviewSnapshot,
  concentrationWarningPercent: number,
) {
  const categories = [
    ["assetClass", "asset class"],
    ["platform", "platform"],
    ["currency", "currency"],
    ["owner", "owner/entity"],
    ["liquidity", "liquidity"],
  ] as const;

  for (const [key, label] of categories) {
    const concentrated = review.exposures[key].find(
      (group) => group.percent >= concentrationWarningPercent,
    );
    if (!concentrated) continue;
    recommendations.push({
      id: `concentration:${key}:${concentrated.key}`,
      severity: "warning",
      category: "concentration",
      title: `High ${label} concentration`,
      detail: `${concentrated.label} represents ${formatPercent(
        concentrated.percent,
      )}% of portfolio value.`,
      actionLabel: "Review concentration",
    });
  }
}

function formatPercent(value: number): string {
  return value.toFixed(value % 1 === 0 ? 0 : 1);
}

function severityRank(severity: RuleRecommendation["severity"]): number {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}
