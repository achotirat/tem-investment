import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

import {
  DryRunAIAnalysisProvider,
  OpenAICompatibleAIAnalysisProvider,
  runAIAnalysis,
} from "../../src/server/ai-analysis-service";
import { NetlifyAIAnalysisRepository } from "../../src/server/ai-analysis-repository";
import { NetlifyHouseholdRepository } from "../../src/server/households-repository";
import type {
  AIAnalysisRequest,
  AIRecommendationStatus,
} from "../../src/shared/ai-analysis";

declare const Netlify: {
  env: {
    get(key: string): string | undefined;
  };
};

export default async function aiAnalysis(request: Request, _context: Context) {
  const identityUser = await getUser();
  if (!identityUser) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = normalizeIdentityUser(identityUser);
  if (!profile.identityUserId) {
    return Response.json({ error: "Identity profile is missing an id." }, { status: 400 });
  }

  try {
    const householdRepository = new NetlifyHouseholdRepository();
    const bootstrap = await householdRepository.findByIdentityUserId(profile.identityUserId);
    if (!bootstrap) return Response.json({ error: "Household not found." }, { status: 404 });

    const repository = new NetlifyAIAnalysisRepository();

    if (request.method === "GET") {
      const runs = await repository.listRuns(bootstrap.household.id);
      return Response.json({ runs });
    }

    if (request.method === "POST") {
      const payload = (await request.json()) as AIAnalysisRequest;
      const provider = createProvider();
      const run = await runAIAnalysis({
        repository,
        provider,
        householdId: bootstrap.household.id,
        actorIdentityUserId: profile.identityUserId,
        request: payload,
      });
      return Response.json({ run }, { status: 201 });
    }

    if (request.method === "PATCH") {
      const payload = (await request.json()) as {
        recommendationId?: string;
        status?: AIRecommendationStatus;
        note?: string;
      };
      if (!payload.recommendationId) {
        return Response.json({ error: "recommendationId is required." }, { status: 400 });
      }
      if (!isResolutionStatus(payload.status)) {
        return Response.json({ error: "A valid resolution status is required." }, { status: 400 });
      }

      const recommendation = await repository.resolveRecommendation({
        householdId: bootstrap.household.id,
        recommendationId: payload.recommendationId,
        status: payload.status,
        actorIdentityUserId: profile.identityUserId,
        note: payload.note ?? `${payload.status} from AI review panel.`,
        resolvedAt: new Date().toISOString(),
      });
      return Response.json({ recommendation });
    }

    return Response.json({ error: "Method not allowed." }, { status: 405 });
  } catch (error) {
    console.error("Unable to handle AI analysis request", error);
    const message = error instanceof Error ? error.message : "Unable to handle AI analysis request.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const config: Config = {
  path: "/api/ai-analysis",
};

function createProvider() {
  const baseUrl = Netlify.env.get("OPENAI_BASE_URL");
  const model = Netlify.env.get("AI_ANALYSIS_MODEL");
  if (baseUrl && model) {
    return new OpenAICompatibleAIAnalysisProvider({ baseUrl, model });
  }

  return new DryRunAIAnalysisProvider();
}

function normalizeIdentityUser(identityUser: unknown) {
  const user = identityUser as { id?: string; sub?: string };
  return { identityUserId: user.id ?? user.sub ?? "" };
}

function isResolutionStatus(
  status: AIRecommendationStatus | undefined,
): status is Exclude<AIRecommendationStatus, "open"> {
  return status === "approved" || status === "ignored" || status === "deferred" || status === "edited";
}
