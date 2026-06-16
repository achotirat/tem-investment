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

export type AIRecommendationCategory = RecommendationCategory | "risk" | "behavior" | "valuation";

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
