import type { AssetClass, HoldingSummary } from "../shared/holdings";
import type {
  MarketPriceSnapshot,
  PriceDashboardPayload,
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
