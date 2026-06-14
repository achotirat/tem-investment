import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

import { PublicMarketPriceFeed } from "../../src/server/market-price-feed";
import { NetlifyHoldingRepository } from "../../src/server/holdings-repository";
import { NetlifyHouseholdRepository } from "../../src/server/households-repository";
import { buildPriceDashboardPayload, runMarketPriceSync } from "../../src/server/pricing-service";
import { NetlifyPricingRepository } from "../../src/server/pricing-repository";

declare const Netlify: {
  env: {
    get(key: string): string | undefined;
  };
};

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
