import { getDatabase } from "@netlify/database";

import type { AddHoldingInput, HoldingSummary, OwnershipSplitInput } from "../shared/holdings";
import type { HoldingRepository } from "./holdings-service";
import { NetlifyDecisionRepository } from "./decisions-repository";
import { deriveAutoPriceKey } from "./pricing-service";

type NetlifyDatabase = ReturnType<typeof getDatabase>;

type HoldingRow = {
  id: string;
  household_id: string;
  portfolio_bucket: HoldingSummary["portfolioBucket"];
  asset_class: HoldingSummary["assetClass"];
  asset_label: string;
  account_label: string;
  currency: string;
  liquidity_category: HoldingSummary["liquidityCategory"];
  valuation_source: HoldingSummary["valuationSource"];
  valuation_date: string | Date;
  status: HoldingSummary["status"];
  encrypted_values: AddHoldingInput["encryptedValues"] | string;
  auto_price_key: string | null;
  latest_market_price_thb: string | number | null;
  latest_market_price_as_of: string | Date | null;
  owner_entity_id: string | null;
  percentage: string | number | null;
};

export class NetlifyHoldingRepository implements HoldingRepository {
  constructor(private readonly database: NetlifyDatabase = getDatabase()) {}

  async createWithManualValuation(
    input: AddHoldingInput,
    actorIdentityUserId?: string,
  ): Promise<HoldingSummary> {
    const encryptedValuesJson = JSON.stringify(input.encryptedValues);
    const ownershipSplitsJson = JSON.stringify(input.ownershipSplits);
    const encryptedCurrentValueJson = JSON.stringify(input.encryptedValues.currentValue);
    const autoPriceKey = deriveAutoPriceKey({
      assetClass: input.assetClass,
      assetLabel: input.assetLabel,
      currency: input.currency,
    });

    const rows = await this.database.sql<HoldingRow>`
      WITH account AS (
        INSERT INTO accounts (household_id, label)
        VALUES (${input.householdId}, ${input.accountLabel})
        ON CONFLICT (household_id, label)
        DO UPDATE SET updated_at = NOW()
        RETURNING id, label
      ),
      holding AS (
        INSERT INTO holdings (
          household_id,
          account_id,
          portfolio_bucket,
          asset_class,
          asset_label,
          currency,
          liquidity_category,
          valuation_source,
          valuation_date,
          status,
          auto_price_key,
          encrypted_values
        )
        SELECT
          ${input.householdId},
          account.id,
          ${input.portfolioBucket},
          ${input.assetClass},
          ${input.assetLabel},
          ${input.currency},
          ${input.liquidityCategory},
          ${input.valuationSource},
          ${input.valuationDate}::date,
          ${input.status},
          ${autoPriceKey},
          ${encryptedValuesJson}::jsonb
        FROM account
        RETURNING
          id,
          household_id,
          account_id,
          portfolio_bucket,
          asset_class,
          asset_label,
          currency,
          liquidity_category,
          valuation_source,
          valuation_date,
          status,
          encrypted_values,
          auto_price_key,
          latest_market_price_thb,
          latest_market_price_as_of
      ),
      ownership AS (
        INSERT INTO holding_ownership_splits (holding_id, owner_entity_id, percentage)
        SELECT
          holding.id,
          split.owner_entity_id::uuid,
          split.percentage
        FROM holding,
          jsonb_to_recordset(${ownershipSplitsJson}::jsonb)
            AS split(owner_entity_id text, percentage numeric)
        RETURNING owner_entity_id, percentage
      ),
      valuation AS (
        INSERT INTO valuation_history (
          holding_id,
          household_id,
          valuation_source,
          valuation_date,
          currency,
          encrypted_value
        )
        SELECT
          holding.id,
          ${input.householdId},
          ${input.valuationSource},
          ${input.valuationDate}::date,
          ${input.currency},
          ${encryptedCurrentValueJson}::jsonb
        FROM holding
        RETURNING id
      )
      SELECT
        holding.id,
        holding.household_id,
        holding.portfolio_bucket,
        holding.asset_class,
        holding.asset_label,
        account.label AS account_label,
        holding.currency,
        holding.liquidity_category,
        holding.valuation_source,
        holding.valuation_date,
        holding.status,
        holding.encrypted_values,
        holding.auto_price_key,
        holding.latest_market_price_thb,
        holding.latest_market_price_as_of,
        ownership.owner_entity_id,
        ownership.percentage
      FROM holding
      JOIN account ON account.id = holding.account_id
      LEFT JOIN ownership ON TRUE
      ORDER BY ownership.owner_entity_id ASC
    `;

    const holding = mapHoldingRows(rows);

    if (input.decisionLog && actorIdentityUserId) {
      const decisionRepository = new NetlifyDecisionRepository(this.database);
      await decisionRepository.create({
        ...input.decisionLog,
        householdId: input.householdId,
        holdingId: holding.id,
        actorIdentityUserId,
        metadata: {
          ...input.decisionLog.metadata,
          portfolioBucket: input.portfolioBucket,
          assetLabel: input.assetLabel,
        },
      });
    }

    return holding;
  }

  async listByHousehold(householdId: string): Promise<HoldingSummary[]> {
    const rows = await this.database.sql<HoldingRow>`
      SELECT
        h.id,
        h.household_id,
        h.portfolio_bucket,
        h.asset_class,
        h.asset_label,
        a.label AS account_label,
        h.currency,
        h.liquidity_category,
        h.valuation_source,
        h.valuation_date,
        h.status,
        h.encrypted_values,
        h.auto_price_key,
        h.latest_market_price_thb,
        h.latest_market_price_as_of,
        s.owner_entity_id,
        s.percentage
      FROM holdings h
      JOIN accounts a ON a.id = h.account_id
      LEFT JOIN holding_ownership_splits s ON s.holding_id = h.id
      WHERE h.household_id = ${householdId}
      ORDER BY h.created_at DESC, s.owner_entity_id ASC
    `;

    return mapGroupedHoldingRows(rows);
  }
}

function mapGroupedHoldingRows(rows: HoldingRow[]): HoldingSummary[] {
  const grouped = new Map<string, HoldingRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.id) ?? [];
    current.push(row);
    grouped.set(row.id, current);
  }

  return [...grouped.values()].map(mapHoldingRows);
}

function mapHoldingRows(rows: HoldingRow[]): HoldingSummary {
  const [first] = rows;
  if (!first) {
    throw new Error("Cannot map an empty holding result.");
  }

  return {
    id: first.id,
    householdId: first.household_id,
    portfolioBucket: first.portfolio_bucket,
    assetClass: first.asset_class,
    assetLabel: first.asset_label,
    accountLabel: first.account_label,
    currency: first.currency,
    liquidityCategory: first.liquidity_category,
    valuationSource: first.valuation_source,
    valuationDate:
      first.valuation_date instanceof Date
        ? first.valuation_date.toISOString().slice(0, 10)
        : String(first.valuation_date),
    status: first.status,
    encryptedValues: normalizeEncryptedValues(first.encrypted_values),
    autoPriceKey: first.auto_price_key,
    latestMarketPriceThb:
      first.latest_market_price_thb === null ? null : Number(first.latest_market_price_thb),
    latestMarketPriceAsOf: first.latest_market_price_as_of
      ? toIsoDateTime(first.latest_market_price_as_of)
      : null,
    ownershipSplits: rows
      .filter((row) => row.owner_entity_id && row.percentage !== null)
      .map(
        (row): OwnershipSplitInput => ({
          ownerEntityId: row.owner_entity_id ?? "",
          percentage: Number(row.percentage),
        }),
      ),
  };
}

function normalizeEncryptedValues(
  encryptedValues: AddHoldingInput["encryptedValues"] | string,
): AddHoldingInput["encryptedValues"] {
  return typeof encryptedValues === "string" ? JSON.parse(encryptedValues) : encryptedValues;
}

function toIsoDateTime(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
