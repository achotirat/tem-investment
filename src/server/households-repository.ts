import { getDatabase } from "@netlify/database";

import {
  HOUSEHOLD_DEFAULTS,
  type CreateHouseholdForIdentityInput,
  type HouseholdBootstrap,
  type HouseholdRepository,
  type OwnerEntityKind,
} from "./household-service";

type NetlifyDatabase = ReturnType<typeof getDatabase>;

type HouseholdRow = {
  household_id: string;
  household_name: string;
  base_currency: string;
  secondary_currency: string;
  identity_user_id: string;
  email: string;
  role: "owner" | "member";
  owner_entity_id: string;
  owner_display_name: string;
  owner_kind: OwnerEntityKind;
};

export class NetlifyHouseholdRepository implements HouseholdRepository {
  constructor(private readonly database: NetlifyDatabase = getDatabase()) {}

  async findByIdentityUserId(identityUserId: string): Promise<HouseholdBootstrap | null> {
    const rows = await this.database.sql<HouseholdRow>`
      SELECT
        h.id AS household_id,
        h.name AS household_name,
        h.base_currency,
        h.secondary_currency,
        hm.identity_user_id,
        hm.email,
        hm.role,
        oe.id AS owner_entity_id,
        oe.display_name AS owner_display_name,
        oe.kind AS owner_kind
      FROM household_members hm
      JOIN households h ON h.id = hm.household_id
      LEFT JOIN owner_entities oe ON oe.household_id = h.id
      WHERE hm.identity_user_id = ${identityUserId}
      ORDER BY oe.created_at ASC
    `;

    if (rows.length === 0) return null;
    return mapBootstrapRows(rows);
  }

  async createForIdentityUser(input: CreateHouseholdForIdentityInput): Promise<HouseholdBootstrap> {
    const rows = await this.database.sql<HouseholdRow>`
      WITH household AS (
        INSERT INTO households (name, base_currency, secondary_currency)
        VALUES (
          ${input.householdName},
          ${HOUSEHOLD_DEFAULTS.baseCurrency},
          ${HOUSEHOLD_DEFAULTS.secondaryCurrency}
        )
        RETURNING id, name, base_currency, secondary_currency
      ),
      owner_entity AS (
        INSERT INTO owner_entities (household_id, display_name, kind, identity_user_id)
        SELECT id, ${input.ownerName}, ${"person"}, ${input.identityUserId}
        FROM household
        RETURNING id, household_id, display_name, kind, created_at
      ),
      membership AS (
        INSERT INTO household_members (
          household_id,
          identity_user_id,
          email,
          role,
          owner_entity_id
        )
        SELECT
          h.id,
          ${input.identityUserId},
          ${input.email},
          ${"owner"},
          oe.id
        FROM household h, owner_entity oe
        RETURNING household_id, identity_user_id, email, role, owner_entity_id
      )
      SELECT
        h.id AS household_id,
        h.name AS household_name,
        h.base_currency,
        h.secondary_currency,
        m.identity_user_id,
        m.email,
        m.role,
        oe.id AS owner_entity_id,
        oe.display_name AS owner_display_name,
        oe.kind AS owner_kind
      FROM household h
      JOIN membership m ON m.household_id = h.id
      JOIN owner_entity oe ON oe.household_id = h.id
    `;

    return mapBootstrapRows(rows);
  }
}

function mapBootstrapRows(rows: HouseholdRow[]): HouseholdBootstrap {
  const [first] = rows;
  if (!first) {
    throw new Error("Cannot map an empty household result.");
  }

  return {
    household: {
      id: first.household_id,
      name: first.household_name,
      baseCurrency: first.base_currency as "THB",
      secondaryCurrency: first.secondary_currency as "USD",
    },
    member: {
      identityUserId: first.identity_user_id,
      email: first.email,
      role: first.role,
    },
    ownerEntities: rows
      .filter((row) => row.owner_entity_id)
      .map((row) => ({
        id: row.owner_entity_id,
        displayName: row.owner_display_name,
        kind: row.owner_kind,
      })),
  };
}
