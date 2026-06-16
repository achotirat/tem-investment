import { getDatabase } from "@netlify/database";

import type {
  AIAnalysisRunSummary,
  AIConsentScope,
  AIInputSummary,
  AIProviderKind,
  AIRecommendationCategory,
  AIRecommendationDraft,
  AIRecommendationStatus,
  AIRecommendationSummary,
} from "../shared/ai-analysis";
import type { RecommendationSeverity } from "../shared/dashboard";
import type {
  AIAnalysisRepository,
  AIAnalysisRunCreateInput,
  AIRecommendationResolutionInput,
} from "./ai-analysis-service";

type NetlifyDatabase = ReturnType<typeof getDatabase>;

export type AIAnalysisRunRow = {
  id: string;
  household_id: string;
  actor_identity_user_id: string;
  status: AIAnalysisRunSummary["status"];
  provider: AIProviderKind;
  model: string;
  consent_scope: AIConsentScope | string;
  input_summary: AIInputSummary | string;
  created_at: string | Date;
  completed_at: string | Date;
  error_message: string | null;
};

export type AIRecommendationRow = {
  id: string;
  run_id: string;
  household_id: string;
  severity: RecommendationSeverity;
  category: AIRecommendationCategory;
  title: string;
  detail: string;
  action_label: string;
  source_recommendation_id: string | null;
  status: AIRecommendationStatus;
  created_at: string | Date;
  resolved_at: string | Date | null;
  resolution_actor_identity_user_id: string | null;
  resolution_note: string | null;
};

export class NetlifyAIAnalysisRepository implements AIAnalysisRepository {
  constructor(private readonly database: NetlifyDatabase = getDatabase()) {}

  async createRun(
    run: AIAnalysisRunCreateInput,
    recommendations: AIRecommendationDraft[],
  ): Promise<AIAnalysisRunSummary> {
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");
      const runResult = await client.query<AIAnalysisRunRow>(
        `
          INSERT INTO ai_analysis_runs (
            household_id,
            actor_identity_user_id,
            status,
            provider,
            model,
            consent_scope,
            input_summary,
            completed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz)
          RETURNING
            id,
            household_id,
            actor_identity_user_id,
            status,
            provider,
            model,
            consent_scope,
            input_summary,
            created_at,
            completed_at,
            error_message
        `,
        [
          run.householdId,
          run.actorIdentityUserId,
          run.status,
          run.provider,
          run.model,
          JSON.stringify(run.consentScope),
          JSON.stringify(run.inputSummary),
          run.completedAt,
        ],
      );

      const analysisRun = runResult.rows[0];
      if (!analysisRun) throw new Error("AI analysis run was not created.");

      const recommendationRows: AIRecommendationRow[] = [];
      for (const recommendation of recommendations) {
        const recommendationResult = await client.query<AIRecommendationRow>(
          `
            INSERT INTO ai_recommendations (
              run_id,
              household_id,
              severity,
              category,
              title,
              detail,
              action_label,
              source_recommendation_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING
              id,
              run_id,
              household_id,
              severity,
              category,
              title,
              detail,
              action_label,
              source_recommendation_id,
              status,
              created_at,
              resolved_at,
              resolution_actor_identity_user_id,
              resolution_note
          `,
          [
            analysisRun.id,
            run.householdId,
            recommendation.severity,
            recommendation.category,
            recommendation.title,
            recommendation.detail,
            recommendation.actionLabel,
            recommendation.sourceRecommendationId ?? null,
          ],
        );
        if (recommendationResult.rows[0]) recommendationRows.push(recommendationResult.rows[0]);
      }

      await client.query("COMMIT");
      return mapAIAnalysisRuns([analysisRun], recommendationRows)[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listRuns(householdId: string): Promise<AIAnalysisRunSummary[]> {
    const runRows = await this.database.sql<AIAnalysisRunRow>`
      SELECT
        id,
        household_id,
        actor_identity_user_id,
        status,
        provider,
        model,
        consent_scope,
        input_summary,
        created_at,
        completed_at,
        error_message
      FROM ai_analysis_runs
      WHERE household_id = ${householdId}
      ORDER BY created_at DESC
      LIMIT 10
    `;

    if (runRows.length === 0) return [];

    const runIds = runRows.map((run) => run.id);
    const recommendationRows = await this.database.sql<AIRecommendationRow>`
      SELECT
        id,
        run_id,
        household_id,
        severity,
        category,
        title,
        detail,
        action_label,
        source_recommendation_id,
        status,
        created_at,
        resolved_at,
        resolution_actor_identity_user_id,
        resolution_note
      FROM ai_recommendations
      WHERE run_id = ANY(${runIds}::uuid[])
      ORDER BY created_at ASC
    `;

    return mapAIAnalysisRuns(runRows, recommendationRows);
  }

  async resolveRecommendation(
    input: AIRecommendationResolutionInput,
  ): Promise<AIRecommendationSummary> {
    const rows = await this.database.sql<AIRecommendationRow>`
      UPDATE ai_recommendations
      SET status = ${input.status},
        resolution_actor_identity_user_id = ${input.actorIdentityUserId},
        resolution_note = ${input.note},
        resolved_at = ${input.resolvedAt}::timestamptz,
        updated_at = NOW()
      WHERE id = ${input.recommendationId}
        AND household_id = ${input.householdId}
      RETURNING
        id,
        run_id,
        household_id,
        severity,
        category,
        title,
        detail,
        action_label,
        source_recommendation_id,
        status,
        created_at,
        resolved_at,
        resolution_actor_identity_user_id,
        resolution_note
    `;

    const [recommendation] = mapAIRecommendationRows(rows);
    if (!recommendation) throw new Error("AI recommendation not found.");
    return recommendation;
  }
}

export function mapAIAnalysisRuns(
  rows: AIAnalysisRunRow[],
  recommendationRows: AIRecommendationRow[],
): AIAnalysisRunSummary[] {
  const recommendations = mapAIRecommendationRows(recommendationRows);

  return rows.map((row) => ({
    id: row.id,
    householdId: row.household_id,
    actorIdentityUserId: row.actor_identity_user_id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    consentScope: normalizeJson<AIConsentScope>(row.consent_scope),
    inputSummary: normalizeJson<AIInputSummary>(row.input_summary),
    createdAt: toIso(row.created_at),
    completedAt: toIso(row.completed_at),
    errorMessage: row.error_message,
    recommendations: recommendations.filter((recommendation) => recommendation.runId === row.id),
  }));
}

export function mapAIRecommendationRows(rows: AIRecommendationRow[]): AIRecommendationSummary[] {
  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    householdId: row.household_id,
    severity: row.severity,
    category: row.category,
    title: row.title,
    detail: row.detail,
    actionLabel: row.action_label,
    sourceRecommendationId: row.source_recommendation_id ?? undefined,
    status: row.status,
    createdAt: toIso(row.created_at),
    resolvedAt: row.resolved_at ? toIso(row.resolved_at) : null,
    resolutionActorIdentityUserId: row.resolution_actor_identity_user_id,
    resolutionNote: row.resolution_note,
  }));
}

function normalizeJson<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
