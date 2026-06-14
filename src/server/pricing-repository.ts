import { getDatabase } from "@netlify/database";

import type { MarketPriceSnapshot, PriceSyncSummary } from "../shared/pricing";
import type { MarketPriceRepository } from "./pricing-service";

type NetlifyDatabase = ReturnType<typeof getDatabase>;

export type MarketPriceRow = {
  price_key: string;
  source: MarketPriceSnapshot["source"];
  symbol: string;
  currency: string;
  price: string | number;
  price_thb: string | number;
  provider: string;
  as_of: string | Date;
};

export type PriceSyncRunRow = {
  id: string;
  status: PriceSyncSummary["status"];
  started_at: string | Date;
  completed_at: string | Date;
  prices_fetched: string | number;
  message: string | null;
};

export class NetlifyPricingRepository implements MarketPriceRepository {
  constructor(private readonly database: NetlifyDatabase = getDatabase()) {}

  async upsertMarketPrices(snapshots: MarketPriceSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    const snapshotsJson = JSON.stringify(snapshots);
    await this.database.sql`
      INSERT INTO market_prices (
        price_key,
        source,
        symbol,
        currency,
        price,
        price_thb,
        provider,
        as_of
      )
      SELECT
        snapshot."priceKey",
        snapshot.source,
        snapshot.symbol,
        snapshot.currency,
        snapshot.price,
        snapshot."priceThb",
        snapshot.provider,
        snapshot."asOf"::timestamptz
      FROM jsonb_to_recordset(${snapshotsJson}::jsonb)
        AS snapshot(
          "priceKey" text,
          source text,
          symbol text,
          currency text,
          price numeric,
          "priceThb" numeric,
          provider text,
          "asOf" text
        )
      ON CONFLICT (price_key)
      DO UPDATE SET
        source = EXCLUDED.source,
        symbol = EXCLUDED.symbol,
        currency = EXCLUDED.currency,
        price = EXCLUDED.price,
        price_thb = EXCLUDED.price_thb,
        provider = EXCLUDED.provider,
        as_of = EXCLUDED.as_of,
        updated_at = NOW()
    `;
  }

  async recordSyncRun(summary: PriceSyncSummary): Promise<PriceSyncSummary> {
    const rows = await this.database.sql<PriceSyncRunRow>`
      INSERT INTO price_sync_runs (
        status,
        started_at,
        completed_at,
        prices_fetched,
        message
      )
      VALUES (
        ${summary.status},
        ${summary.startedAt}::timestamptz,
        ${summary.completedAt}::timestamptz,
        ${summary.pricesFetched},
        ${summary.message ?? null}
      )
      RETURNING id, status, started_at, completed_at, prices_fetched, message
    `;
    return mapPriceSyncRow(rows[0]);
  }

  async listLatestPrices(): Promise<MarketPriceSnapshot[]> {
    const rows = await this.database.sql<MarketPriceRow>`
      SELECT price_key, source, symbol, currency, price, price_thb, provider, as_of
      FROM market_prices
      ORDER BY source ASC, symbol ASC
    `;
    return mapMarketPriceRows(rows);
  }

  async findLastSyncRun(): Promise<PriceSyncSummary | null> {
    const rows = await this.database.sql<PriceSyncRunRow>`
      SELECT id, status, started_at, completed_at, prices_fetched, message
      FROM price_sync_runs
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ? mapPriceSyncRow(rows[0]) : null;
  }
}

export function mapMarketPriceRows(rows: MarketPriceRow[]): MarketPriceSnapshot[] {
  return rows.map((row) => ({
    priceKey: row.price_key,
    source: row.source,
    symbol: row.symbol,
    currency: row.currency,
    price: Number(row.price),
    priceThb: Number(row.price_thb),
    provider: row.provider,
    asOf: toIso(row.as_of),
  }));
}

export function mapPriceSyncRow(row: PriceSyncRunRow): PriceSyncSummary {
  return {
    id: row.id,
    status: row.status,
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    pricesFetched: Number(row.prices_fetched),
    message: row.message ?? undefined,
  };
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
