import { describe, expect, it } from "vitest";

import {
  mapMarketPriceRows,
  mapPriceSyncRow,
  type MarketPriceRow,
  type PriceSyncRunRow,
} from "../src/server/pricing-repository";

describe("pricing repository mappers", () => {
  it("maps market price rows into dashboard snapshots", () => {
    const rows: MarketPriceRow[] = [
      {
        price_key: "crypto:BTC",
        source: "crypto",
        symbol: "BTC",
        currency: "THB",
        price: "2500000",
        price_thb: "2500000",
        provider: "coingecko",
        as_of: new Date("2026-06-14T00:00:00.000Z"),
      },
    ];

    expect(mapMarketPriceRows(rows)).toEqual([
      {
        priceKey: "crypto:BTC",
        source: "crypto",
        symbol: "BTC",
        currency: "THB",
        price: 2500000,
        priceThb: 2500000,
        provider: "coingecko",
        asOf: "2026-06-14T00:00:00.000Z",
      },
    ]);
  });

  it("maps the last sync run", () => {
    const row: PriceSyncRunRow = {
      id: "sync_1",
      status: "success",
      started_at: "2026-06-14T00:00:00.000Z",
      completed_at: "2026-06-14T00:00:05.000Z",
      prices_fetched: 2,
      message: null,
    };

    expect(mapPriceSyncRow(row)).toEqual({
      id: "sync_1",
      status: "success",
      startedAt: "2026-06-14T00:00:00.000Z",
      completedAt: "2026-06-14T00:00:05.000Z",
      pricesFetched: 2,
      message: undefined,
    });
  });
});
