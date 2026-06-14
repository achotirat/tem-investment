import { describe, expect, it } from "vitest";

import {
  DEFAULT_STALE_THRESHOLDS,
  buildPriceDashboardPayload,
  deriveAutoPriceKey,
  findStaleValuations,
  runMarketPriceSync,
  type MarketPriceFeed,
  type MarketPriceRepository,
} from "../src/server/pricing-service";
import type { HoldingSummary } from "../src/shared/holdings";
import type { MarketPriceSnapshot, PriceSyncSummary } from "../src/shared/pricing";

const encryptedValues = {
  quantity: { version: 1 as const, algorithm: "AES-GCM" as const, iv: "iv", ciphertext: "q" },
  costBasis: { version: 1 as const, algorithm: "AES-GCM" as const, iv: "iv", ciphertext: "b" },
  currentValue: { version: 1 as const, algorithm: "AES-GCM" as const, iv: "iv", ciphertext: "v" },
};

const holding = (overrides: Partial<HoldingSummary>): HoldingSummary => ({
  id: "holding_1",
  householdId: "household_1",
  portfolioBucket: "P1",
  assetClass: "crypto",
  assetLabel: "BTC",
  accountLabel: "Wallet",
  currency: "USD",
  liquidityCategory: "liquid",
  valuationSource: "manual",
  valuationDate: "2026-06-13",
  status: "active",
  ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 100 }],
  encryptedValues,
  autoPriceKey: null,
  latestMarketPriceThb: null,
  latestMarketPriceAsOf: null,
  ...overrides,
});

describe("deriveAutoPriceKey", () => {
  it("derives stable keys for BTC, gold, SET equities, and FX cash", () => {
    expect(deriveAutoPriceKey({ assetClass: "crypto", assetLabel: "BTC", currency: "USD" })).toBe(
      "crypto:BTC",
    );
    expect(
      deriveAutoPriceKey({ assetClass: "gold", assetLabel: "Gold bars", currency: "THB" }),
    ).toBe("gold:XAU");
    expect(deriveAutoPriceKey({ assetClass: "stock", assetLabel: "ptt", currency: "THB" })).toBe(
      "set:PTT",
    );
    expect(deriveAutoPriceKey({ assetClass: "cash", assetLabel: "USD cash", currency: "USD" })).toBe(
      "fx:USDTHB",
    );
  });

  it("does not auto-price unsupported private holdings", () => {
    expect(
      deriveAutoPriceKey({ assetClass: "real_estate", assetLabel: "Condo", currency: "THB" }),
    ).toBeNull();
  });
});

describe("findStaleValuations", () => {
  it("flags liquid market assets older than one day", () => {
    const warnings = findStaleValuations(
      [holding({ valuationDate: "2026-06-10" })],
      DEFAULT_STALE_THRESHOLDS,
      new Date("2026-06-14T12:00:00Z"),
    );

    expect(warnings).toEqual([
      expect.objectContaining({
        holdingId: "holding_1",
        assetLabel: "BTC",
        staleAfterDays: 1,
        daysOld: 4,
      }),
    ]);
  });

  it("uses real estate stale threshold of 180 days", () => {
    const warnings = findStaleValuations(
      [holding({ assetClass: "real_estate", assetLabel: "Condo", valuationDate: "2026-01-01" })],
      DEFAULT_STALE_THRESHOLDS,
      new Date("2026-06-14T12:00:00Z"),
    );

    expect(warnings).toHaveLength(0);
  });
});

describe("runMarketPriceSync", () => {
  it("stores fetched prices and records a successful sync run", async () => {
    const snapshots: MarketPriceSnapshot[] = [
      {
        priceKey: "crypto:BTC",
        source: "crypto",
        symbol: "BTC",
        currency: "THB",
        price: 2500000,
        priceThb: 2500000,
        provider: "test",
        asOf: "2026-06-14T00:00:00.000Z",
      },
    ];
    const feed: MarketPriceFeed = { fetchLatest: async () => snapshots };
    const repository = new InMemoryPriceRepository();

    const summary = await runMarketPriceSync({
      feed,
      repository,
      now: new Date("2026-06-14T00:01:00.000Z"),
    });

    expect(repository.savedPrices).toEqual(snapshots);
    expect(summary).toMatchObject({ status: "success", pricesFetched: 1 });
    expect(repository.syncRuns[0]).toMatchObject({ status: "success", pricesFetched: 1 });
  });
});

describe("buildPriceDashboardPayload", () => {
  it("builds price dashboard payload with latest prices, warnings, and last sync", async () => {
    const prices: MarketPriceSnapshot[] = [
      {
        priceKey: "fx:USDTHB",
        source: "fx",
        symbol: "USDTHB",
        currency: "THB",
        price: 36,
        priceThb: 36,
        provider: "test",
        asOf: "2026-06-14T00:00:00.000Z",
      },
    ];
    const payload = await buildPriceDashboardPayload({
      holdings: [holding({ valuationDate: "2026-06-10" })],
      listLatestPrices: async () => prices,
      findLastSyncRun: async () => ({
        id: "sync_1",
        status: "success",
        startedAt: "2026-06-14T00:00:00.000Z",
        completedAt: "2026-06-14T00:00:01.000Z",
        pricesFetched: 1,
      }),
      now: new Date("2026-06-14T12:00:00.000Z"),
    });

    expect(payload.prices).toEqual(prices);
    expect(payload.lastSync?.id).toBe("sync_1");
    expect(payload.staleWarnings).toHaveLength(1);
  });
});

class InMemoryPriceRepository implements MarketPriceRepository {
  savedPrices: MarketPriceSnapshot[] = [];
  syncRuns: PriceSyncSummary[] = [];

  async upsertMarketPrices(snapshots: MarketPriceSnapshot[]) {
    this.savedPrices = snapshots;
  }

  async recordSyncRun(summary: PriceSyncSummary) {
    const saved = { ...summary, id: "sync_1" };
    this.syncRuns.push(saved);
    return saved;
  }
}
