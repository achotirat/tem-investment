import { getDatabase } from "@netlify/database";

import type { DecisionLogInput, DecisionLogSummary } from "../shared/discipline";
import type { DecisionLogRepository } from "./discipline-service";

type NetlifyDatabase = ReturnType<typeof getDatabase>;

type DecisionLogRow = {
  id: string;
  household_id: string;
  holding_id: string | null;
  actor_identity_user_id: string;
  action: DecisionLogSummary["action"];
  scope: DecisionLogSummary["scope"];
  reason_required: boolean;
  metadata: DecisionLogSummary["metadata"];
  created_at: string | Date;
};

export class NetlifyDecisionRepository implements DecisionLogRepository {
  constructor(private readonly database: NetlifyDatabase = getDatabase()) {}

  async create(input: DecisionLogInput): Promise<DecisionLogSummary> {
    const encryptedDetailsJson = JSON.stringify(input.encryptedDetails);
    const metadataJson = JSON.stringify(input.metadata);

    const rows = await this.database.sql<DecisionLogRow>`
      INSERT INTO decision_logs (
        household_id,
        holding_id,
        actor_identity_user_id,
        action,
        scope,
        reason_required,
        encrypted_details,
        metadata
      )
      VALUES (
        ${input.householdId},
        ${input.holdingId ?? null},
        ${input.actorIdentityUserId},
        ${input.action},
        ${input.scope},
        ${input.reasonRequired},
        ${encryptedDetailsJson}::jsonb,
        ${metadataJson}::jsonb
      )
      RETURNING
        id,
        household_id,
        holding_id,
        actor_identity_user_id,
        action,
        scope,
        reason_required,
        metadata,
        created_at
    `;

    return mapDecisionLogRow(rows[0]);
  }

  async listByHousehold(householdId: string): Promise<DecisionLogSummary[]> {
    const rows = await this.database.sql<DecisionLogRow>`
      SELECT
        id,
        household_id,
        holding_id,
        actor_identity_user_id,
        action,
        scope,
        reason_required,
        metadata,
        created_at
      FROM decision_logs
      WHERE household_id = ${householdId}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return rows.map(mapDecisionLogRow);
  }
}

function mapDecisionLogRow(row: DecisionLogRow | undefined): DecisionLogSummary {
  if (!row) {
    throw new Error("Cannot map an empty decision log result.");
  }

  return {
    id: row.id,
    householdId: row.household_id,
    holdingId: row.holding_id ?? undefined,
    actorIdentityUserId: row.actor_identity_user_id,
    action: row.action,
    scope: row.scope,
    reasonRequired: row.reason_required,
    metadata: row.metadata,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}
