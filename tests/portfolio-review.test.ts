import { describe, expect, it } from "vitest";

import { deriveMasterKey, encryptSensitiveField } from "../src/client/crypto/portfolio-crypto";
import { calculatePortfolioReview } from "../src/client/pricing/portfolio-valuations";
import type { HoldingSummary } from "../src/shared/holdings";

async function encryptedHolding(
  key: CryptoKey,
  overrides: Partial<HoldingSummary> & {
    id: string;
    currentValue: string;
    ownerEntityId?: string;
    ownerPercentage?: number;
  },
): Promise<HoldingSummary> {
  return {
    id: overrides.id,
    householdId: "household_1",
    portfolioBucket: overrides.portfolioBucket ?? "P1",
    assetClass: overrides.assetClass ?? "crypto",
    assetLabel: overrides.assetLabel ?? "BTC cold storage",
    accountLabel: overrides.accountLabel ?? "Hardware wallet",
    currency: overrides.currency ?? "THB",
    liquidityCategory: overrides.liquidityCategory ?? "liquid",
    valuationSource: overrides.valuationSource ?? "manual",
    valuationDate: overrides.valuationDate ?? "2026-06-15",
    status: overrides.status ?? "active",
    ownershipSplits: [
      {
        ownerEntityId: overrides.ownerEntityId ?? "owner_1",
        percentage: overrides.ownerPercentage ?? 100,
      },
    ],
    encryptedValues: {
      quantity: await encryptSensitiveField("1", key),
      costBasis: await encryptSensitiveField("100", key),
      currentValue: await encryptSensitiveField(overrides.currentValue, key),
    },
    autoPriceKey: overrides.autoPriceKey ?? null,
    latestMarketPriceThb: overrides.latestMarketPriceThb ?? null,
    latestMarketPriceAsOf: overrides.latestMarketPriceAsOf ?? null,
  };
}

describe("calculatePortfolioReview", () => {
  it("returns locked review groups without a session key", async () => {
    const review = await calculatePortfolioReview({
      holdings: [],
      prices: [],
      baseCurrency: "THB",
      secondaryCurrency: "USD",
      ownerEntities: [{ id: "owner_1", displayName: "Tem", kind: "person" }],
      sessionKey: null,
    });

    expect(review.locked).toBe(true);
    expect(review.bucketAllocations).toHaveLength(3);
    expect(review.bucketAllocations[0]).toMatchObject({
      key: "P1",
      targetPercent: 60,
      valueBase: 0,
    });
  });

  it("decrypts values and computes bucket, owner, and exposure percentages", async () => {
    const { key } = await deriveMasterKey({
      masterPassword: "secret",
      salt: new Uint8Array(16).fill(1),
      argon2id: async () => new Uint8Array(32).fill(2),
    });
    const holdings = [
      await encryptedHolding(key, {
        id: "p1_btc",
        portfolioBucket: "P1",
        assetClass: "crypto",
        assetLabel: "BTC cold storage",
        accountLabel: "Hardware wallet",
        currency: "USD",
        currentValue: "1000",
        ownerEntityId: "owner_1",
        ownerPercentage: 60,
      }),
      await encryptedHolding(key, {
        id: "p3_trade",
        portfolioBucket: "P3",
        assetClass: "derivative",
        assetLabel: "TFEX trade",
        accountLabel: "Broker",
        currency: "THB",
        liquidityCategory: "liquid",
        currentValue: "14000",
        ownerEntityId: "owner_2",
        ownerPercentage: 100,
      }),
    ];

    const review = await calculatePortfolioReview({
      holdings,
      prices: [
        {
          priceKey: "fx:USDTHB",
          source: "fx",
          symbol: "USDTHB",
          currency: "THB",
          price: 36,
          priceThb: 36,
          provider: "test",
          asOf: "2026-06-15T00:00:00.000Z",
        },
      ],
      baseCurrency: "THB",
      secondaryCurrency: "USD",
      ownerEntities: [
        { id: "owner_1", displayName: "Tem", kind: "person" },
        { id: "owner_2", displayName: "Partner", kind: "person" },
      ],
      sessionKey: key,
    });

    expect(review.locked).toBe(false);
    expect(review.totalBaseValue).toBe(50000);
    expect(review.totalSecondaryValue).toBeCloseTo(1388.89, 2);
    expect(review.bucketAllocations.find((bucket) => bucket.key === "P1")).toMatchObject({
      valueBase: 36000,
      percent: 72,
      targetPercent: 60,
      driftPercent: 12,
    });
    expect(review.bucketAllocations.find((bucket) => bucket.key === "P3")).toMatchObject({
      valueBase: 14000,
      percent: 28,
      targetPercent: 10,
      driftPercent: 18,
    });
    expect(review.ownerNetWorth.find((owner) => owner.ownerEntityId === "owner_1")).toMatchObject({
      displayName: "Tem",
      valueBase: 21600,
      percent: 43.2,
    });
    expect(review.exposures.assetClass.find((group) => group.key === "crypto")).toMatchObject({
      valueBase: 36000,
      percent: 72,
    });
    expect(review.exposures.leverage.find((group) => group.key === "leveraged")).toMatchObject({
      valueBase: 14000,
      percent: 28,
    });
  });
});
