# Phase 5 Auto-Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add market-price sync, stale valuation warnings, manual refresh, and THB/USD dashboard totals without exposing plaintext sensitive values to the server.

**Architecture:** Server-side functions sync non-sensitive market price snapshots and stale warning metadata. Holding position values remain encrypted; the authenticated API returns encrypted value blobs, and the client computes totals only after the master-password unlock decrypts current values in memory. Scheduled sync refreshes market rates daily; manual refresh uses the same pricing service from `/api/prices`.

**Tech Stack:** Next.js App Router, React, Netlify Functions modern default-export syntax, Netlify Database/Postgres, Web Crypto AES-GCM, Vitest, Testing Library.

---

## File Structure

- Create `src/shared/pricing.ts` for market price, sync summary, stale warning, and portfolio valuation types.
- Modify `src/shared/holdings.ts` so `HoldingSummary` carries encrypted value blobs and auto-price metadata.
- Create `netlify/database/migrations/20260613004000_create-market-prices/migration.sql` for market price snapshots, sync runs, holding auto-price metadata, and household stale-threshold overrides.
- Create `src/server/pricing-service.ts` for price-key derivation, stale threshold logic, and sync orchestration.
- Create `src/server/market-price-feed.ts` for public BTC/FX feeds plus optional configured gold/SET snapshots.
- Create `src/server/pricing-repository.ts` for Netlify Database persistence and list APIs.
- Modify `src/server/holdings-repository.ts` to assign auto-price keys and return encrypted values plus price metadata.
- Create `netlify/functions/prices.mts` for authenticated GET and POST refresh.
- Create `netlify/functions/sync-prices.mts` for the daily scheduled sync.
- Create `src/client/pricing/portfolio-valuations.ts` for unlocked in-browser portfolio totals and currency conversion.
- Create `src/client/pricing/PriceRefreshPanel.tsx` for price refresh and stale warning UI.
- Modify `src/client/CommandCenterApp.tsx` to load prices and refresh them.
- Modify `src/client/DashboardShell.tsx` to show unlocked totals, price refresh controls, and stale warnings.
- Modify `app/globals.css` for compact price/warning rows.
- Add tests:
  - `tests/auto-pricing-migration.test.ts`
  - `tests/pricing-service.test.ts`
  - `tests/market-price-feed.test.ts`
  - `tests/pricing-repository.test.ts`
  - `tests/portfolio-valuations.test.ts`
  - `tests/price-refresh-panel.test.tsx`
  - update `tests/dashboard-shell.test.tsx`, `tests/holdings-service.test.ts`, and related holding tests as needed.

---

### Task 1: Schema and Shared Pricing Contracts

**Files:**
- Create: `src/shared/pricing.ts`
- Modify: `src/shared/holdings.ts`
- Create: `netlify/database/migrations/20260613004000_create-market-prices/migration.sql`
- Test: `tests/auto-pricing-migration.test.ts`

- [ ] **Step 1: Write the failing migration/type test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("auto-pricing migration", () => {
  const migration = readFileSync(
    "netlify/database/migrations/20260613004000_create-market-prices/migration.sql",
    "utf8",
  );

  it("creates market price and sync run tables", () => {
    expect(migration).toContain("CREATE TABLE market_prices");
    expect(migration).toContain("CREATE TABLE price_sync_runs");
    expect(migration).toContain("CONSTRAINT market_prices_price_key_unique UNIQUE (price_key)");
  });

  it("adds non-sensitive auto-price metadata without plaintext position values", () => {
    expect(migration).toContain("ALTER TABLE holdings");
    expect(migration).toContain("ADD COLUMN auto_price_key TEXT");
    expect(migration).toContain("ADD COLUMN latest_market_price_thb NUMERIC(20, 8)");
    expect(migration).not.toMatch(/\bquantity\b NUMERIC|\bcurrent_value\b NUMERIC|\bcost_basis\b NUMERIC/i);
  });

  it("adds household stale valuation threshold overrides", () => {
    expect(migration).toContain("ADD COLUMN valuation_stale_thresholds JSONB");
    expect(migration).toContain("liquid_market_days");
    expect(migration).toContain("real_estate_days");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/auto-pricing-migration.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add pricing shared types and extend holdings**

Add `src/shared/pricing.ts`:

```ts
export type PriceSource = "crypto" | "gold" | "set" | "fx" | "configured";

export type MarketPriceSnapshot = {
  priceKey: string;
  source: PriceSource;
  symbol: string;
  currency: string;
  price: number;
  priceThb: number;
  provider: string;
  asOf: string;
};

export type PriceSyncStatus = "success" | "partial" | "failed";

export type PriceSyncSummary = {
  id?: string;
  status: PriceSyncStatus;
  startedAt: string;
  completedAt: string;
  pricesFetched: number;
  message?: string;
};

export type ValuationFreshnessWarning = {
  holdingId: string;
  assetLabel: string;
  assetClass: string;
  valuationDate: string;
  staleAfterDays: number;
  daysOld: number;
};

export type PriceDashboardPayload = {
  prices: MarketPriceSnapshot[];
  staleWarnings: ValuationFreshnessWarning[];
  lastSync: PriceSyncSummary | null;
};

export type PortfolioValueSnapshot = {
  locked: boolean;
  baseCurrency: string;
  secondaryCurrency: string;
  totalBaseValue: number;
  totalSecondaryValue: number;
};
```

Modify `HoldingSummary` in `src/shared/holdings.ts`:

```ts
export type HoldingSummary = {
  id: string;
  householdId: string;
  portfolioBucket: PortfolioBucket;
  assetClass: AssetClass;
  assetLabel: string;
  accountLabel: string;
  currency: string;
  liquidityCategory: LiquidityCategory;
  valuationSource: ValuationSource;
  valuationDate: string;
  status: HoldingStatus;
  ownershipSplits: OwnershipSplitInput[];
  encryptedValues: EncryptedHoldingValues;
  autoPriceKey: string | null;
  latestMarketPriceThb: number | null;
  latestMarketPriceAsOf: string | null;
};
```

- [ ] **Step 4: Add the migration**

Create `netlify/database/migrations/20260613004000_create-market-prices/migration.sql`:

```sql
ALTER TABLE households
  ADD COLUMN valuation_stale_thresholds JSONB NOT NULL DEFAULT
    '{"liquid_market_days": 1, "derivative_days": 1, "private_company_days": 90, "real_estate_days": 180}'::jsonb;

ALTER TABLE holdings
  ADD COLUMN auto_price_key TEXT,
  ADD COLUMN latest_market_price_thb NUMERIC(20, 8),
  ADD COLUMN latest_market_price_as_of TIMESTAMPTZ,
  ADD COLUMN latest_market_price_provider TEXT;

CREATE TABLE market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_key TEXT NOT NULL,
  source TEXT NOT NULL,
  symbol TEXT NOT NULL,
  currency CHAR(3) NOT NULL,
  price NUMERIC(20, 8) NOT NULL,
  price_thb NUMERIC(20, 8) NOT NULL,
  provider TEXT NOT NULL,
  as_of TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_prices_price_key_unique UNIQUE (price_key),
  CONSTRAINT market_prices_source_check CHECK (source IN ('crypto', 'gold', 'set', 'fx', 'configured')),
  CONSTRAINT market_prices_positive_price_check CHECK (price > 0 AND price_thb > 0)
);

CREATE TABLE price_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  prices_fetched INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT price_sync_runs_status_check CHECK (status IN ('success', 'partial', 'failed'))
);

CREATE INDEX market_prices_source_symbol_idx
  ON market_prices(source, symbol);

CREATE INDEX holdings_auto_price_key_idx
  ON holdings(auto_price_key);

CREATE INDEX price_sync_runs_created_at_idx
  ON price_sync_runs(created_at DESC);
```

- [ ] **Step 5: Run the migration/type test**

Run: `npm test -- tests/auto-pricing-migration.test.ts`

Expected: PASS.

---

### Task 2: Pricing Service Logic

**Files:**
- Create: `src/server/pricing-service.ts`
- Test: `tests/pricing-service.test.ts`

- [ ] **Step 1: Write the failing service tests**

```ts
import { describe, expect, it } from "vitest";

import {
  DEFAULT_STALE_THRESHOLDS,
  deriveAutoPriceKey,
  findStaleValuations,
  runMarketPriceSync,
  type MarketPriceRepository,
  type MarketPriceFeed,
} from "../src/server/pricing-service";
import type { HoldingSummary } from "../src/shared/holdings";
import type { MarketPriceSnapshot } from "../src/shared/pricing";

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
    expect(deriveAutoPriceKey({ assetClass: "crypto", assetLabel: "BTC", currency: "USD" })).toBe("crypto:BTC");
    expect(deriveAutoPriceKey({ assetClass: "gold", assetLabel: "Gold bars", currency: "THB" })).toBe("gold:XAU");
    expect(deriveAutoPriceKey({ assetClass: "stock", assetLabel: "ptt", currency: "THB" })).toBe("set:PTT");
    expect(deriveAutoPriceKey({ assetClass: "cash", assetLabel: "USD cash", currency: "USD" })).toBe("fx:USDTHB");
  });

  it("does not auto-price unsupported private holdings", () => {
    expect(deriveAutoPriceKey({ assetClass: "real_estate", assetLabel: "Condo", currency: "THB" })).toBeNull();
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

class InMemoryPriceRepository implements MarketPriceRepository {
  savedPrices: MarketPriceSnapshot[] = [];
  syncRuns: Awaited<ReturnType<MarketPriceRepository["recordSyncRun"]>>[] = [];

  async upsertMarketPrices(snapshots: MarketPriceSnapshot[]) {
    this.savedPrices = snapshots;
  }

  async recordSyncRun(summary: Awaited<ReturnType<MarketPriceRepository["recordSyncRun"]>>) {
    this.syncRuns.push(summary);
    return { ...summary, id: "sync_1" };
  }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/pricing-service.test.ts`

Expected: FAIL because `src/server/pricing-service.ts` does not exist.

- [ ] **Step 3: Implement service logic**

Create `src/server/pricing-service.ts`:

```ts
import type { AssetClass, HoldingSummary } from "../shared/holdings";
import type {
  MarketPriceSnapshot,
  PriceSyncSummary,
  ValuationFreshnessWarning,
} from "../shared/pricing";

export type StaleValuationThresholds = {
  liquidMarketDays: number;
  derivativeDays: number;
  privateCompanyDays: number;
  realEstateDays: number;
};

export type MarketPriceFeed = {
  fetchLatest(): Promise<MarketPriceSnapshot[]>;
};

export type MarketPriceRepository = {
  upsertMarketPrices(snapshots: MarketPriceSnapshot[]): Promise<void>;
  recordSyncRun(summary: PriceSyncSummary): Promise<PriceSyncSummary>;
};

export const DEFAULT_STALE_THRESHOLDS: StaleValuationThresholds = {
  liquidMarketDays: 1,
  derivativeDays: 1,
  privateCompanyDays: 90,
  realEstateDays: 180,
};

export function deriveAutoPriceKey(input: {
  assetClass: AssetClass;
  assetLabel: string;
  currency: string;
}): string | null {
  const label = input.assetLabel.trim().toUpperCase();
  const currency = input.currency.trim().toUpperCase();

  if (input.assetClass === "crypto" && label === "BTC") return "crypto:BTC";
  if (input.assetClass === "gold") return "gold:XAU";
  if (input.assetClass === "stock" && label) return `set:${label}`;
  if (input.assetClass === "cash" && currency === "USD") return "fx:USDTHB";
  return null;
}

export function findStaleValuations(
  holdings: HoldingSummary[],
  thresholds: StaleValuationThresholds,
  asOf: Date,
): ValuationFreshnessWarning[] {
  return holdings
    .filter((holding) => holding.status === "active")
    .map((holding) => {
      const staleAfterDays = thresholdForAssetClass(holding.assetClass, thresholds);
      const daysOld = differenceInUtcDays(new Date(holding.valuationDate), asOf);
      return { holding, staleAfterDays, daysOld };
    })
    .filter(({ daysOld, staleAfterDays }) => daysOld > staleAfterDays)
    .map(({ holding, staleAfterDays, daysOld }) => ({
      holdingId: holding.id,
      assetLabel: holding.assetLabel,
      assetClass: holding.assetClass,
      valuationDate: holding.valuationDate,
      staleAfterDays,
      daysOld,
    }));
}

export async function runMarketPriceSync({
  feed,
  repository,
  now = new Date(),
}: {
  feed: MarketPriceFeed;
  repository: MarketPriceRepository;
  now?: Date;
}): Promise<PriceSyncSummary> {
  const startedAt = now.toISOString();

  try {
    const snapshots = await feed.fetchLatest();
    await repository.upsertMarketPrices(snapshots);
    return repository.recordSyncRun({
      status: snapshots.length > 0 ? "success" : "partial",
      startedAt,
      completedAt: new Date().toISOString(),
      pricesFetched: snapshots.length,
      message: snapshots.length > 0 ? undefined : "No market prices were returned.",
    });
  } catch (error) {
    return repository.recordSyncRun({
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      pricesFetched: 0,
      message: error instanceof Error ? error.message : "Unable to sync market prices.",
    });
  }
}

function thresholdForAssetClass(
  assetClass: AssetClass,
  thresholds: StaleValuationThresholds,
): number {
  if (assetClass === "real_estate") return thresholds.realEstateDays;
  if (assetClass === "derivative") return thresholds.derivativeDays;
  if (assetClass === "other") return thresholds.privateCompanyDays;
  return thresholds.liquidMarketDays;
}

function differenceInUtcDays(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endUtc - startUtc) / 86_400_000);
}
```

- [ ] **Step 4: Run the service tests**

Run: `npm test -- tests/pricing-service.test.ts`

Expected: PASS.

---

### Task 3: Market Price Feed Parsing

**Files:**
- Create: `src/server/market-price-feed.ts`
- Test: `tests/market-price-feed.test.ts`

- [ ] **Step 1: Write failing feed tests**

```ts
import { describe, expect, it } from "vitest";

import { PublicMarketPriceFeed } from "../src/server/market-price-feed";

describe("PublicMarketPriceFeed", () => {
  it("normalizes BTC and USDTHB responses into THB snapshots", async () => {
    const feed = new PublicMarketPriceFeed({
      fetcher: async (url) => {
        const target = String(url);
        if (target.includes("coingecko")) {
          return jsonResponse({
            bitcoin: { thb: 2500000, usd: 68000, last_updated_at: 1781395200 },
          });
        }
        if (target.includes("open.er-api.com")) {
          return jsonResponse({
            result: "success",
            time_last_update_unix: 1781395200,
            rates: { THB: 36.75, USD: 1 },
          });
        }
        throw new Error(`Unexpected URL ${target}`);
      },
    });

    await expect(feed.fetchLatest()).resolves.toEqual([
      expect.objectContaining({
        priceKey: "crypto:BTC",
        source: "crypto",
        symbol: "BTC",
        priceThb: 2500000,
        provider: "coingecko",
      }),
      expect.objectContaining({
        priceKey: "fx:USDTHB",
        source: "fx",
        symbol: "USDTHB",
        priceThb: 36.75,
        provider: "exchangerate-api",
      }),
    ]);
  });

  it("accepts configured gold and SET snapshots", async () => {
    const feed = new PublicMarketPriceFeed({
      configuredSnapshotUrl: "https://prices.example.test/latest",
      fetcher: async (url) => {
        const target = String(url);
        if (target.includes("coingecko")) {
          return jsonResponse({ bitcoin: { thb: 2500000, last_updated_at: 1781395200 } });
        }
        if (target.includes("open.er-api.com")) {
          return jsonResponse({ result: "success", time_last_update_unix: 1781395200, rates: { THB: 36.75 } });
        }
        return jsonResponse({
          prices: [
            {
              priceKey: "gold:XAU",
              source: "gold",
              symbol: "XAU",
              currency: "THB",
              price: 88000,
              priceThb: 88000,
              provider: "configured",
              asOf: "2026-06-14T00:00:00.000Z",
            },
            {
              priceKey: "set:PTT",
              source: "set",
              symbol: "PTT",
              currency: "THB",
              price: 35,
              priceThb: 35,
              provider: "configured",
              asOf: "2026-06-14T00:00:00.000Z",
            },
          ],
        });
      },
    });

    const snapshots = await feed.fetchLatest();

    expect(snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ priceKey: "gold:XAU", source: "gold" }),
        expect.objectContaining({ priceKey: "set:PTT", source: "set" }),
      ]),
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Run the feed test to verify it fails**

Run: `npm test -- tests/market-price-feed.test.ts`

Expected: FAIL because `src/server/market-price-feed.ts` does not exist.

- [ ] **Step 3: Implement feed parsing**

Create `src/server/market-price-feed.ts`:

```ts
import type { MarketPriceSnapshot, PriceSource } from "../shared/pricing";
import type { MarketPriceFeed } from "./pricing-service";

type FeedOptions = {
  fetcher?: typeof fetch;
  configuredSnapshotUrl?: string;
  configuredSnapshotToken?: string;
};

type ConfiguredPayload = {
  prices?: MarketPriceSnapshot[];
};

export class PublicMarketPriceFeed implements MarketPriceFeed {
  constructor(private readonly options: FeedOptions = {}) {}

  async fetchLatest(): Promise<MarketPriceSnapshot[]> {
    const [btc, fx, configured] = await Promise.all([
      this.fetchBtc(),
      this.fetchUsdThb(),
      this.fetchConfiguredSnapshots(),
    ]);

    return [btc, fx, ...configured].filter((snapshot): snapshot is MarketPriceSnapshot =>
      Boolean(snapshot),
    );
  }

  private async fetchBtc(): Promise<MarketPriceSnapshot | null> {
    const response = await this.fetcher()(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=thb,usd&include_last_updated_at=true",
    );
    if (!response.ok) throw new Error(`CoinGecko BTC request failed with ${response.status}`);
    const payload = (await response.json()) as {
      bitcoin?: { thb?: number; usd?: number; last_updated_at?: number };
    };
    const thb = payload.bitcoin?.thb;
    if (!Number.isFinite(thb)) return null;

    return {
      priceKey: "crypto:BTC",
      source: "crypto",
      symbol: "BTC",
      currency: "THB",
      price: Number(thb),
      priceThb: Number(thb),
      provider: "coingecko",
      asOf: unixSecondsToIso(payload.bitcoin?.last_updated_at),
    };
  }

  private async fetchUsdThb(): Promise<MarketPriceSnapshot | null> {
    const response = await this.fetcher()("https://open.er-api.com/v6/latest/USD");
    if (!response.ok) throw new Error(`USDTHB request failed with ${response.status}`);
    const payload = (await response.json()) as {
      result?: string;
      time_last_update_unix?: number;
      rates?: { THB?: number };
    };
    const thb = payload.rates?.THB;
    if (payload.result !== "success" || !Number.isFinite(thb)) return null;

    return {
      priceKey: "fx:USDTHB",
      source: "fx",
      symbol: "USDTHB",
      currency: "THB",
      price: Number(thb),
      priceThb: Number(thb),
      provider: "exchangerate-api",
      asOf: unixSecondsToIso(payload.time_last_update_unix),
    };
  }

  private async fetchConfiguredSnapshots(): Promise<MarketPriceSnapshot[]> {
    const url = this.options.configuredSnapshotUrl?.trim();
    if (!url) return [];

    const headers = this.options.configuredSnapshotToken
      ? { Authorization: `Bearer ${this.options.configuredSnapshotToken}` }
      : undefined;
    const response = await this.fetcher()(url, { headers });
    if (!response.ok) throw new Error(`Configured market price request failed with ${response.status}`);

    const payload = (await response.json()) as ConfiguredPayload;
    return (payload.prices ?? []).map(validateConfiguredSnapshot);
  }

  private fetcher(): typeof fetch {
    return this.options.fetcher ?? fetch;
  }
}

function validateConfiguredSnapshot(snapshot: MarketPriceSnapshot): MarketPriceSnapshot {
  const source: PriceSource = snapshot.source;
  if (!snapshot.priceKey || !snapshot.symbol || !source) {
    throw new Error("Configured market price snapshot is missing key metadata.");
  }
  if (!Number.isFinite(snapshot.price) || !Number.isFinite(snapshot.priceThb)) {
    throw new Error(`Configured market price ${snapshot.priceKey} has an invalid price.`);
  }
  return {
    ...snapshot,
    symbol: snapshot.symbol.trim().toUpperCase(),
    currency: snapshot.currency.trim().toUpperCase(),
  };
}

function unixSecondsToIso(value: number | undefined): string {
  return new Date(Number.isFinite(value) ? Number(value) * 1000 : Date.now()).toISOString();
}
```

- [ ] **Step 4: Run feed tests**

Run: `npm test -- tests/market-price-feed.test.ts`

Expected: PASS.

---

### Task 4: Pricing Repository and Holding Auto-Price Metadata

**Files:**
- Create: `src/server/pricing-repository.ts`
- Modify: `src/server/holdings-repository.ts`
- Test: `tests/pricing-repository.test.ts`
- Test: `tests/holdings-service.test.ts`

- [ ] **Step 1: Write failing repository mapper tests**

```ts
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
```

- [ ] **Step 2: Run repository tests to verify failure**

Run: `npm test -- tests/pricing-repository.test.ts`

Expected: FAIL because `src/server/pricing-repository.ts` does not exist.

- [ ] **Step 3: Implement repository mappers and DB methods**

Create `src/server/pricing-repository.ts` with:

```ts
import { getDatabase } from "@netlify/database";

import type { MarketPriceRepository } from "./pricing-service";
import type { MarketPriceSnapshot, PriceSyncSummary } from "../shared/pricing";

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
        price_key,
        source,
        symbol,
        currency,
        price,
        price_thb,
        provider,
        as_of::timestamptz
      FROM jsonb_to_recordset(${snapshotsJson}::jsonb)
        AS snapshot(
          price_key text,
          source text,
          symbol text,
          currency text,
          price numeric,
          price_thb numeric,
          provider text,
          as_of text
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
```

- [ ] **Step 4: Modify holdings repository mapping**

In `src/server/holdings-repository.ts`:

- Import `deriveAutoPriceKey`.
- Include `encrypted_values`, `auto_price_key`, `latest_market_price_thb`, and `latest_market_price_as_of` in `HoldingRow`.
- During insert, set `auto_price_key` from `deriveAutoPriceKey(input)`.
- Return `encryptedValues`, `autoPriceKey`, `latestMarketPriceThb`, and `latestMarketPriceAsOf` from `mapHoldingRows`.

The row type must include:

```ts
encrypted_values: AddHoldingInput["encryptedValues"];
auto_price_key: string | null;
latest_market_price_thb: string | number | null;
latest_market_price_as_of: string | Date | null;
```

The mapped summary fields must be:

```ts
encryptedValues: first.encrypted_values,
autoPriceKey: first.auto_price_key,
latestMarketPriceThb:
  first.latest_market_price_thb === null ? null : Number(first.latest_market_price_thb),
latestMarketPriceAsOf: first.latest_market_price_as_of
  ? first.latest_market_price_as_of instanceof Date
    ? first.latest_market_price_as_of.toISOString()
    : new Date(first.latest_market_price_as_of).toISOString()
  : null,
```

- [ ] **Step 5: Update affected holding service tests**

In test holding summaries, add:

```ts
encryptedValues: input.encryptedValues,
autoPriceKey: null,
latestMarketPriceThb: null,
latestMarketPriceAsOf: null,
```

- [ ] **Step 6: Run repository and holding tests**

Run: `npm test -- tests/pricing-repository.test.ts tests/holdings-service.test.ts tests/holding-encryption-workflow.test.ts tests/holdings-list.test.tsx`

Expected: PASS.

---

### Task 5: Pricing API and Scheduled Sync Functions

**Files:**
- Create: `netlify/functions/prices.mts`
- Create: `netlify/functions/sync-prices.mts`
- Modify: `src/server/pricing-service.ts`
- Test: `tests/pricing-service.test.ts`

- [ ] **Step 1: Add a service test for price dashboard payload**

Append to `tests/pricing-service.test.ts`:

```ts
import { buildPriceDashboardPayload } from "../src/server/pricing-service";

it("builds price dashboard payload with latest prices, warnings, and last sync", async () => {
  const prices = [
    {
      priceKey: "fx:USDTHB",
      source: "fx" as const,
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
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `npm test -- tests/pricing-service.test.ts`

Expected: FAIL because `buildPriceDashboardPayload` does not exist.

- [ ] **Step 3: Implement dashboard payload service**

Add to `src/server/pricing-service.ts`:

```ts
import type { PriceDashboardPayload, PriceSyncSummary } from "../shared/pricing";

export async function buildPriceDashboardPayload({
  holdings,
  listLatestPrices,
  findLastSyncRun,
  now = new Date(),
  thresholds = DEFAULT_STALE_THRESHOLDS,
}: {
  holdings: HoldingSummary[];
  listLatestPrices: () => Promise<MarketPriceSnapshot[]>;
  findLastSyncRun: () => Promise<PriceSyncSummary | null>;
  now?: Date;
  thresholds?: StaleValuationThresholds;
}): Promise<PriceDashboardPayload> {
  const [prices, lastSync] = await Promise.all([listLatestPrices(), findLastSyncRun()]);
  return {
    prices,
    lastSync,
    staleWarnings: findStaleValuations(holdings, thresholds, now),
  };
}
```

- [ ] **Step 4: Create authenticated prices function**

Create `netlify/functions/prices.mts`:

```ts
import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

import { PublicMarketPriceFeed } from "../../src/server/market-price-feed";
import { NetlifyHoldingRepository } from "../../src/server/holdings-repository";
import { NetlifyHouseholdRepository } from "../../src/server/households-repository";
import { buildPriceDashboardPayload, runMarketPriceSync } from "../../src/server/pricing-service";
import { NetlifyPricingRepository } from "../../src/server/pricing-repository";

export default async function prices(request: Request, _context: Context) {
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

    const pricingRepository = new NetlifyPricingRepository();
    const holdingRepository = new NetlifyHoldingRepository();

    if (request.method === "POST") {
      await runMarketPriceSync({
        repository: pricingRepository,
        feed: new PublicMarketPriceFeed({
          configuredSnapshotUrl: Netlify.env.get("MARKET_PRICE_FEED_URL") ?? undefined,
          configuredSnapshotToken: Netlify.env.get("MARKET_PRICE_FEED_TOKEN") ?? undefined,
        }),
      });
    } else if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const holdings = await holdingRepository.listByHousehold(bootstrap.household.id);
    const payload = await buildPriceDashboardPayload({
      holdings,
      listLatestPrices: () => pricingRepository.listLatestPrices(),
      findLastSyncRun: () => pricingRepository.findLastSyncRun(),
    });
    return Response.json(payload);
  } catch (error) {
    console.error("Unable to handle prices request", error);
    const message = error instanceof Error ? error.message : "Unable to handle prices request.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const config: Config = {
  path: "/api/prices",
};

function normalizeIdentityUser(identityUser: unknown) {
  const user = identityUser as { id?: string; sub?: string };
  return { identityUserId: user.id ?? user.sub ?? "" };
}
```

- [ ] **Step 5: Create daily scheduled sync function**

Create `netlify/functions/sync-prices.mts`:

```ts
import type { Config } from "@netlify/functions";

import { PublicMarketPriceFeed } from "../../src/server/market-price-feed";
import { runMarketPriceSync } from "../../src/server/pricing-service";
import { NetlifyPricingRepository } from "../../src/server/pricing-repository";

export default async function syncPrices(_request: Request) {
  const repository = new NetlifyPricingRepository();
  const summary = await runMarketPriceSync({
    repository,
    feed: new PublicMarketPriceFeed({
      configuredSnapshotUrl: Netlify.env.get("MARKET_PRICE_FEED_URL") ?? undefined,
      configuredSnapshotToken: Netlify.env.get("MARKET_PRICE_FEED_TOKEN") ?? undefined,
    }),
  });

  return Response.json(summary);
}

export const config: Config = {
  schedule: "@daily",
};
```

- [ ] **Step 6: Run service tests**

Run: `npm test -- tests/pricing-service.test.ts`

Expected: PASS.

---

### Task 6: Client Portfolio Totals and Refresh UI

**Files:**
- Create: `src/client/pricing/portfolio-valuations.ts`
- Create: `src/client/pricing/PriceRefreshPanel.tsx`
- Modify: `src/client/DashboardShell.tsx`
- Modify: `src/client/CommandCenterApp.tsx`
- Modify: `app/globals.css`
- Test: `tests/portfolio-valuations.test.ts`
- Test: `tests/price-refresh-panel.test.tsx`
- Test: `tests/dashboard-shell.test.tsx`

- [ ] **Step 1: Write failing client valuation tests**

```ts
import { describe, expect, it } from "vitest";

import { deriveMasterKey, encryptSensitiveField } from "../src/client/crypto/portfolio-crypto";
import { calculatePortfolioValue } from "../src/client/pricing/portfolio-valuations";
import type { HoldingSummary } from "../src/shared/holdings";

describe("calculatePortfolioValue", () => {
  it("returns locked totals without a session key", async () => {
    const snapshot = await calculatePortfolioValue({
      holdings: [],
      prices: [],
      baseCurrency: "THB",
      secondaryCurrency: "USD",
      sessionKey: null,
    });

    expect(snapshot).toMatchObject({ locked: true, totalBaseValue: 0, totalSecondaryValue: 0 });
  });

  it("decrypts current values and converts USD holdings to THB and USD totals", async () => {
    const { key } = await deriveMasterKey({
      masterPassword: "secret",
      salt: new Uint8Array(16).fill(1),
      argon2id: async () => new Uint8Array(32).fill(2),
    });
    const holding: HoldingSummary = {
      id: "holding_1",
      householdId: "household_1",
      portfolioBucket: "P1",
      assetClass: "crypto",
      assetLabel: "BTC",
      accountLabel: "Wallet",
      currency: "USD",
      liquidityCategory: "liquid",
      valuationSource: "manual",
      valuationDate: "2026-06-14",
      status: "active",
      ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 100 }],
      encryptedValues: {
        quantity: await encryptSensitiveField("1", key),
        costBasis: await encryptSensitiveField("50000", key),
        currentValue: await encryptSensitiveField("1000", key),
      },
      autoPriceKey: "crypto:BTC",
      latestMarketPriceThb: 2500000,
      latestMarketPriceAsOf: "2026-06-14T00:00:00.000Z",
    };

    const snapshot = await calculatePortfolioValue({
      holdings: [holding],
      prices: [
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
      ],
      baseCurrency: "THB",
      secondaryCurrency: "USD",
      sessionKey: key,
    });

    expect(snapshot.locked).toBe(false);
    expect(snapshot.totalBaseValue).toBe(36000);
    expect(snapshot.totalSecondaryValue).toBe(1000);
  });
});
```

- [ ] **Step 2: Run valuation tests to verify failure**

Run: `npm test -- tests/portfolio-valuations.test.ts`

Expected: FAIL because `portfolio-valuations.ts` does not exist.

- [ ] **Step 3: Implement client valuation helper**

Create `src/client/pricing/portfolio-valuations.ts`:

```ts
"use client";

import type { HoldingSummary } from "../../shared/holdings";
import type { MarketPriceSnapshot, PortfolioValueSnapshot } from "../../shared/pricing";
import { decryptSensitiveField } from "../crypto/portfolio-crypto";

export async function calculatePortfolioValue({
  holdings,
  prices,
  baseCurrency,
  secondaryCurrency,
  sessionKey,
}: {
  holdings: HoldingSummary[];
  prices: MarketPriceSnapshot[];
  baseCurrency: string;
  secondaryCurrency: string;
  sessionKey: CryptoKey | null;
}): Promise<PortfolioValueSnapshot> {
  if (!sessionKey) {
    return {
      locked: true,
      baseCurrency,
      secondaryCurrency,
      totalBaseValue: 0,
      totalSecondaryValue: 0,
    };
  }

  const usdThb = prices.find((price) => price.priceKey === "fx:USDTHB")?.priceThb ?? null;
  let totalBaseValue = 0;

  for (const holding of holdings.filter((item) => item.status === "active")) {
    const plaintextValue = await decryptSensitiveField(holding.encryptedValues.currentValue, sessionKey);
    const numericValue = Number(plaintextValue.replace(/,/g, ""));
    if (!Number.isFinite(numericValue)) continue;
    totalBaseValue += convertToBaseCurrency(numericValue, holding.currency, baseCurrency, usdThb);
  }

  const totalSecondaryValue = convertFromBaseCurrency(
    totalBaseValue,
    baseCurrency,
    secondaryCurrency,
    usdThb,
  );

  return {
    locked: false,
    baseCurrency,
    secondaryCurrency,
    totalBaseValue,
    totalSecondaryValue,
  };
}

function convertToBaseCurrency(
  value: number,
  currency: string,
  baseCurrency: string,
  usdThb: number | null,
): number {
  const normalizedCurrency = currency.toUpperCase();
  const normalizedBase = baseCurrency.toUpperCase();
  if (normalizedCurrency === normalizedBase) return value;
  if (normalizedCurrency === "USD" && normalizedBase === "THB" && usdThb) return value * usdThb;
  if (normalizedCurrency === "THB" && normalizedBase === "USD" && usdThb) return value / usdThb;
  return 0;
}

function convertFromBaseCurrency(
  value: number,
  baseCurrency: string,
  secondaryCurrency: string,
  usdThb: number | null,
): number {
  const normalizedBase = baseCurrency.toUpperCase();
  const normalizedSecondary = secondaryCurrency.toUpperCase();
  if (normalizedBase === normalizedSecondary) return value;
  if (normalizedBase === "THB" && normalizedSecondary === "USD" && usdThb) return value / usdThb;
  if (normalizedBase === "USD" && normalizedSecondary === "THB" && usdThb) return value * usdThb;
  return 0;
}
```

- [ ] **Step 4: Write failing refresh panel tests**

```ts
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PriceRefreshPanel } from "../src/client/pricing/PriceRefreshPanel";

describe("PriceRefreshPanel", () => {
  it("shows last sync status and stale valuation warnings", () => {
    render(
      <PriceRefreshPanel
        lastSync={{
          id: "sync_1",
          status: "success",
          startedAt: "2026-06-14T00:00:00.000Z",
          completedAt: "2026-06-14T00:00:05.000Z",
          pricesFetched: 2,
        }}
        onRefreshPrices={vi.fn()}
        prices={[]}
        staleWarnings={[
          {
            holdingId: "holding_1",
            assetLabel: "BTC",
            assetClass: "crypto",
            valuationDate: "2026-06-10",
            staleAfterDays: 1,
            daysOld: 4,
          },
        ]}
      />,
    );

    expect(screen.getByText("Price refresh")).toBeInTheDocument();
    expect(screen.getByText("2 prices")).toBeInTheDocument();
    expect(screen.getByText("BTC valuation is 4 days old")).toBeInTheDocument();
  });

  it("runs manual refresh when clicked", async () => {
    const onRefreshPrices = vi.fn().mockResolvedValue(undefined);
    render(
      <PriceRefreshPanel
        lastSync={null}
        onRefreshPrices={onRefreshPrices}
        prices={[]}
        staleWarnings={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh prices now" }));

    await waitFor(() => expect(onRefreshPrices).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 5: Run refresh panel tests to verify failure**

Run: `npm test -- tests/price-refresh-panel.test.tsx`

Expected: FAIL because `PriceRefreshPanel` does not exist.

- [ ] **Step 6: Implement refresh panel**

Create `src/client/pricing/PriceRefreshPanel.tsx`:

```tsx
"use client";

import { RefreshCw, TimerReset } from "lucide-react";

import type {
  MarketPriceSnapshot,
  PriceSyncSummary,
  ValuationFreshnessWarning,
} from "../../shared/pricing";

type PriceRefreshPanelProps = {
  prices: MarketPriceSnapshot[];
  staleWarnings: ValuationFreshnessWarning[];
  lastSync: PriceSyncSummary | null;
  refreshing?: boolean;
  onRefreshPrices: () => Promise<void> | void;
};

export function PriceRefreshPanel({
  prices,
  staleWarnings,
  lastSync,
  refreshing = false,
  onRefreshPrices,
}: PriceRefreshPanelProps) {
  return (
    <section className="panel span-4">
      <div className="panel-header">
        <div className="panel-title">
          <TimerReset aria-hidden="true" size={18} />
          Price refresh
        </div>
        <span className="pill">{prices.length} prices</span>
      </div>
      <div className="panel-body price-refresh">
        <div className="price-sync-state">
          <span>{lastSync ? `${lastSync.status} sync` : "No sync yet"}</span>
          <small>{lastSync ? formatDateTime(lastSync.completedAt) : "Market prices pending"}</small>
        </div>
        <button className="secondary-button" disabled={refreshing} onClick={onRefreshPrices} type="button">
          <RefreshCw aria-hidden="true" size={16} />
          {refreshing ? "Refreshing" : "Refresh prices now"}
        </button>
        <div className="stale-list">
          {staleWarnings.length === 0 ? (
            <div className="empty-state">Valuations are fresh</div>
          ) : (
            staleWarnings.map((warning) => (
              <div className="stale-row" key={warning.holdingId}>
                <strong>{warning.assetLabel} valuation is {warning.daysOld} days old</strong>
                <small>Refresh threshold: {warning.staleAfterDays} days</small>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
```

- [ ] **Step 7: Wire dashboard/client state**

Modify `src/client/CommandCenterApp.tsx`:

- Import `PriceDashboardPayload`.
- Add state for `prices`, `staleWarnings`, `lastSync`, and `refreshingPrices`.
- Load `/api/prices` with bootstrap data.
- Implement `handleRefreshPrices()` with `POST /api/prices`.
- Pass price props to `DashboardShell`.

Modify `src/client/DashboardShell.tsx`:

- Import `useMemo` if needed, `PriceRefreshPanel`, `calculatePortfolioValue`, and pricing types.
- Add price props and `onRefreshPrices`.
- Maintain `portfolioValue` state.
- Recalculate when `sessionKey`, `localHoldings`, `prices`, or household currencies change.
- Replace hard-coded `THB 0` and `USD 0` with formatted unlocked totals or `Locked`.
- Pass `staleWarnings` into the warnings and price panel.

Add these helpers in `DashboardShell.tsx`:

```ts
function formatMoney(currency: string, value: number): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "THB" ? 0 : 2,
  }).format(value);
}
```

- [ ] **Step 8: Add CSS styles**

Add compact styles to `app/globals.css`:

```css
.price-refresh,
.stale-list {
  display: grid;
  gap: 12px;
}

.price-sync-state,
.stale-row {
  display: grid;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  background: #f8fafc;
}

.price-sync-state small,
.stale-row small {
  color: var(--muted);
  font-size: 0.78rem;
}
```

- [ ] **Step 9: Run client tests**

Run: `npm test -- tests/portfolio-valuations.test.ts tests/price-refresh-panel.test.tsx tests/dashboard-shell.test.tsx`

Expected: PASS.

---

### Task 7: Full Verification and Publish

**Files:**
- All Phase 5 files

- [ ] **Step 1: Run focused Phase 5 tests**

Run:

```bash
npm test -- tests/auto-pricing-migration.test.ts tests/pricing-service.test.ts tests/market-price-feed.test.ts tests/pricing-repository.test.ts tests/portfolio-valuations.test.ts tests/price-refresh-panel.test.tsx tests/dashboard-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: Next.js build and TypeScript pass.

- [ ] **Step 4: Run production dependency audit**

Run: `npm audit --omit=dev`

Expected: `found 0 vulnerabilities`.

- [ ] **Step 5: Run Netlify offline build**

Run: `./node_modules/.bin/netlify build --offline`

Expected: Next build passes and functions bundle, including `prices.mts` and `sync-prices.mts`.

- [ ] **Step 6: Browser smoke**

Run the Netlify dev server and verify in a browser:

- Dashboard loads with no console errors.
- Base/secondary total cards show `Locked` before unlock.
- Price refresh panel is visible.
- Mobile viewport has no horizontal overflow.

- [ ] **Step 7: Commit and open PR**

Commit:

```bash
git add app/globals.css docs/superpowers/plans/2026-06-14-phase-5-auto-pricing.md netlify/database/migrations/20260613004000_create-market-prices/migration.sql netlify/functions/prices.mts netlify/functions/sync-prices.mts src/client/CommandCenterApp.tsx src/client/DashboardShell.tsx src/client/pricing/PriceRefreshPanel.tsx src/client/pricing/portfolio-valuations.ts src/server/market-price-feed.ts src/server/pricing-repository.ts src/server/pricing-service.ts src/server/holdings-repository.ts src/shared/holdings.ts src/shared/pricing.ts tests/auto-pricing-migration.test.ts tests/dashboard-shell.test.tsx tests/holding-encryption-workflow.test.ts tests/holdings-service.test.ts tests/market-price-feed.test.ts tests/portfolio-valuations.test.ts tests/price-refresh-panel.test.tsx tests/pricing-repository.test.ts tests/pricing-service.test.ts
git commit -m "Add phase 5 auto pricing"
git push -u origin phase-5-auto-pricing
```

Open a draft PR titled:

```text
[codex] Add Phase 5 auto pricing
```

PR body should include:

- Market price sync and scheduled/manual refresh.
- Stale valuation warnings.
- Unlocked THB/USD portfolio totals.
- Validation commands and browser smoke evidence.

---

## Self-Review

- Spec coverage: Phase 5 requires daily sync, manual refresh, stale thresholds/warnings, and THB/USD dual-currency view. The plan covers scheduled/manual sync, stale valuation warnings, synced FX price snapshots, and client-side unlocked totals.
- Security consistency: Raw quantity, cost basis, and current value remain encrypted. Server sync stores market prices and stale metadata only; decrypted portfolio totals live in client memory after unlock.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: `MarketPriceSnapshot`, `PriceDashboardPayload`, `HoldingSummary`, and repository mapper names are consistent across server, client, and tests.
