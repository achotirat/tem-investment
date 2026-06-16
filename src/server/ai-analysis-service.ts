import type {
  AIAnalysisRequest,
  AIAnalysisRunSummary,
  AIConsentScope,
  AIInputSummary,
  AIProviderKind,
  AIRecommendationDraft,
  AIRecommendationStatus,
  AIRecommendationSummary,
} from "../shared/ai-analysis";

export type AIAnalysisRunCreateInput = {
  householdId: string;
  actorIdentityUserId: string;
  status: "completed";
  provider: AIProviderKind;
  model: string;
  consentScope: AIConsentScope;
  inputSummary: AIInputSummary;
  completedAt: string;
};

export type AIRecommendationResolutionInput = {
  householdId: string;
  recommendationId: string;
  status: Exclude<AIRecommendationStatus, "open">;
  actorIdentityUserId: string;
  note: string;
  resolvedAt: string;
};

export type AIAnalysisRepository = {
  createRun(
    run: AIAnalysisRunCreateInput,
    recommendations: AIRecommendationDraft[],
  ): Promise<AIAnalysisRunSummary>;
  listRuns(householdId: string): Promise<AIAnalysisRunSummary[]>;
  resolveRecommendation(
    input: AIRecommendationResolutionInput,
  ): Promise<AIRecommendationSummary>;
};

export type AIAnalysisProvider = {
  provider: AIProviderKind;
  model: string;
  analyze(request: AIAnalysisRequest): Promise<AIRecommendationDraft[]>;
};

export function createDefaultAIConsentScope(): AIConsentScope {
  return {
    bucketAllocations: true,
    concentrationViews: true,
    activeRecommendations: true,
    positionLevelValues: false,
  };
}

export function buildAIInputSummary(request: AIAnalysisRequest): AIInputSummary {
  const exposureGroupCount = Object.values(request.review.exposures).reduce(
    (total, groups) => total + groups.length,
    0,
  );

  return {
    baseCurrency: request.review.baseCurrency,
    secondaryCurrency: request.review.secondaryCurrency,
    bucketCount: request.review.bucketAllocations.length,
    exposureGroupCount,
    recommendationCount: request.recommendations.length,
    criticalRecommendationCount: request.recommendations.filter(
      (recommendation) => recommendation.severity === "critical",
    ).length,
    warningRecommendationCount: request.recommendations.filter(
      (recommendation) => recommendation.severity === "warning",
    ).length,
  };
}

export async function runAIAnalysis({
  repository,
  provider,
  householdId,
  actorIdentityUserId,
  request,
  now = new Date(),
}: {
  repository: AIAnalysisRepository;
  provider: AIAnalysisProvider;
  householdId: string;
  actorIdentityUserId: string;
  request: AIAnalysisRequest;
  now?: Date;
}): Promise<AIAnalysisRunSummary> {
  if (request.consentScope.positionLevelValues) {
    throw new Error("Position-level AI analysis is not enabled in Phase 8.");
  }

  const recommendations = await provider.analyze(request);

  return repository.createRun(
    {
      householdId,
      actorIdentityUserId,
      status: "completed",
      provider: provider.provider,
      model: provider.model,
      consentScope: request.consentScope,
      inputSummary: buildAIInputSummary(request),
      completedAt: now.toISOString(),
    },
    recommendations,
  );
}

export class DryRunAIAnalysisProvider implements AIAnalysisProvider {
  provider = "dry_run" as const;
  model = "dry-run-rules";

  async analyze(request: AIAnalysisRequest): Promise<AIRecommendationDraft[]> {
    const sourceRecommendations =
      request.recommendations.length > 0
        ? request.recommendations
        : [
            {
              id: "portfolio:review",
              severity: "info" as const,
              category: "risk" as const,
              title: "Portfolio review is ready",
              detail: "No urgent rule-based warnings are open.",
              actionLabel: "Record review decision",
            },
          ];

    return sourceRecommendations.slice(0, 3).map((recommendation) => ({
      severity: recommendation.severity,
      category: recommendation.category,
      title: `AI review: ${recommendation.title}`,
      detail: `${recommendation.detail} Challenge the assumption, document the decision, and avoid taking action until the household review is complete.`,
      actionLabel: recommendation.actionLabel,
      sourceRecommendationId: recommendation.id,
    }));
  }
}

export class OpenAICompatibleAIAnalysisProvider implements AIAnalysisProvider {
  provider = "netlify_ai_gateway" as const;
  model: string;

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor({
    baseUrl,
    model,
    fetchImpl = fetch,
  }: {
    baseUrl: string;
    model: string;
    fetchImpl?: typeof fetch;
  }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async analyze(request: AIAnalysisRequest): Promise<AIRecommendationDraft[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a cautious household portfolio review assistant. Return only JSON with a recommendations array. Do not provide financial advice, do not tell the user to trade, and do not include exact position-level values.",
          },
          {
            role: "user",
            content: JSON.stringify(buildPromptPayload(request)),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(`AI analysis request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return [];

    return normalizeAIRecommendations(JSON.parse(content));
  }
}

function buildPromptPayload(request: AIAnalysisRequest) {
  return {
    consentScope: request.consentScope,
    portfolioContext: {
      baseCurrency: request.review.baseCurrency,
      secondaryCurrency: request.review.secondaryCurrency,
      bucketAllocations: request.review.bucketAllocations,
      exposures: request.review.exposures,
      activeRecommendations: request.recommendations,
    },
    instructions: [
      "Challenge assumptions and identify review questions.",
      "Suggest decision-log prompts, not trades.",
      "Return at most three recommendations.",
    ],
  };
}

function normalizeAIRecommendations(payload: unknown): AIRecommendationDraft[] {
  const recommendations =
    typeof payload === "object" && payload !== null && "recommendations" in payload
      ? (payload as { recommendations?: unknown }).recommendations
      : [];

  if (!Array.isArray(recommendations)) return [];

  return recommendations.flatMap((recommendation): AIRecommendationDraft[] => {
    if (typeof recommendation !== "object" || recommendation === null) return [];
    const item = recommendation as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const detail = typeof item.detail === "string" ? item.detail.trim() : "";
    const actionLabel = typeof item.actionLabel === "string" ? item.actionLabel.trim() : "";
    if (!title || !detail || !actionLabel) return [];

    return [
      {
        severity:
          item.severity === "critical" || item.severity === "warning" ? item.severity : "info",
        category: typeof item.category === "string" ? item.category : "risk",
        title,
        detail,
        actionLabel,
        sourceRecommendationId:
          typeof item.sourceRecommendationId === "string" ? item.sourceRecommendationId : undefined,
      } as AIRecommendationDraft,
    ];
  });
}
