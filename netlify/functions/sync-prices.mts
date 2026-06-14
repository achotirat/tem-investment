import type { Config } from "@netlify/functions";

import { PublicMarketPriceFeed } from "../../src/server/market-price-feed";
import { runMarketPriceSync } from "../../src/server/pricing-service";
import { NetlifyPricingRepository } from "../../src/server/pricing-repository";

declare const Netlify: {
  env: {
    get(key: string): string | undefined;
  };
};

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
