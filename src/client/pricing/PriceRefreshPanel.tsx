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
  const priceCount = lastSync?.pricesFetched ?? prices.length;

  return (
    <section className="panel span-4">
      <div className="panel-header">
        <div className="panel-title">
          <TimerReset aria-hidden="true" size={18} />
          Price refresh
        </div>
        <span className="pill">{priceCount} prices</span>
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
                <strong>
                  {warning.assetLabel} valuation is {warning.daysOld} days old
                </strong>
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
