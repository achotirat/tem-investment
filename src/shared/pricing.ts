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
