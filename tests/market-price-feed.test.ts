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
          return jsonResponse({
            result: "success",
            time_last_update_unix: 1781395200,
            rates: { THB: 36.75 },
          });
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
