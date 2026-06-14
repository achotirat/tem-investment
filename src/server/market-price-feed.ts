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
    if (!response.ok) {
      throw new Error(`Configured market price request failed with ${response.status}`);
    }

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
