import type { PortfolioBucket } from "./holdings";
import type { PortfolioValueSnapshot } from "./pricing";

export type DashboardAllocation = {
  key: PortfolioBucket;
  label: string;
  targetPercent: number;
  valueBase: number;
  percent: number;
  driftPercent: number;
};

export type DashboardExposureGroup = {
  key: string;
  label: string;
  valueBase: number;
  percent: number;
};

export type DashboardExposureSummary = {
  assetClass: DashboardExposureGroup[];
  platform: DashboardExposureGroup[];
  currency: DashboardExposureGroup[];
  owner: DashboardExposureGroup[];
  liquidity: DashboardExposureGroup[];
  leverage: DashboardExposureGroup[];
};

export type OwnerNetWorthSummary = {
  ownerEntityId: string;
  displayName: string;
  valueBase: number;
  percent: number;
};

export type PortfolioReviewSnapshot = PortfolioValueSnapshot & {
  bucketAllocations: DashboardAllocation[];
  ownerNetWorth: OwnerNetWorthSummary[];
  exposures: DashboardExposureSummary;
};

export type RecommendationSeverity = "info" | "warning" | "critical";

export type RecommendationCategory =
  | "allocation"
  | "stale_valuation"
  | "trade_plan"
  | "p3_guardrail"
  | "concentration"
  | "leverage";

export type RuleRecommendation = {
  id: string;
  severity: RecommendationSeverity;
  category: RecommendationCategory;
  title: string;
  detail: string;
  actionLabel: string;
  relatedHoldingId?: string;
};
