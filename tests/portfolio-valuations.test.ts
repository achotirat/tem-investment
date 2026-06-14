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
