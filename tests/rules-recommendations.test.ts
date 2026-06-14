import { describe, expect, it } from "vitest";

import { buildRulesBasedRecommendations } from "../src/client/recommendations/rules-recommendations";
import type { PortfolioReviewSnapshot } from "../src/shared/dashboard";
import type { HoldingSummary } from "../src/shared/holdings";

const encryptedValues = {
  quantity: { version: 1 as const, algorithm: "AES-GCM" as const, iv: "iv", ciphertext: "q" },
  costBasis: { version: 1 as const, algorithm: "AES-GCM" as const, iv: "iv", ciphertext: "b" },
  currentValue: { version: 1 as const, algorithm: "AES-GCM" as const, iv: "iv", ciphertext: "v" },
};

const review: PortfolioReviewSnapshot = {
  locked: false,
  baseCurrency: "THB",
  secondaryCurrency: "USD",
  totalBaseValue: 100000,
  totalSecondaryValue: 2777.78,
  bucketAllocations: [
    {
      key: "P1",
      label: "P1 Store of Wealth",
      targetPercent: 60,
      valueBase: 72000,
      percent: 72,
      driftPercent: 12,
    },
    {
      key: "P2",
      label: "P2 Investment / System Trading",
      targetPercent: 30,
      valueBase: 8000,
      percent: 8,
      driftPercent: -22,
    },
    {
      key: "P3",
      label: "P3 Speculation",
      targetPercent: 10,
      valueBase: 20000,
      percent: 20,
      driftPercent: 10,
    },
  ],
  ownerNetWorth: [
    { ownerEntityId: "owner_1", displayName: "Tem", valueBase: 100000, percent: 100 },
  ],
  exposures: {
    assetClass: [{ key: "crypto", label: "Crypto", valueBase: 72000, percent: 72 }],
    platform: [{ key: "Hardware wallet", label: "Hardware wallet", valueBase: 72000, percent: 72 }],
    currency: [{ key: "USD", label: "USD", valueBase: 72000, percent: 72 }],
    owner: [{ key: "owner_1", label: "Tem", valueBase: 100000, percent: 100 }],
    liquidity: [{ key: "liquid", label: "Liquid", valueBase: 100000, percent: 100 }],
    leverage: [{ key: "leveraged", label: "Leveraged / derivative", valueBase: 20000, percent: 20 }],
  },
};

const holding = (overrides: Partial<HoldingSummary>): HoldingSummary => ({
  id: "holding_1",
  householdId: "household_1",
  portfolioBucket: "P2",
  assetClass: "stock",
  assetLabel: "SET system trade",
  accountLabel: "Broker",
  currency: "THB",
  liquidityCategory: "liquid",
  valuationSource: "manual",
  valuationDate: "2026-06-15",
  status: "active",
  ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 100 }],
  encryptedValues,
  autoPriceKey: null,
  latestMarketPriceThb: null,
  latestMarketPriceAsOf: null,
  ...overrides,
});

describe("buildRulesBasedRecommendations", () => {
  it("raises allocation, concentration, stale valuation, leverage, and P2 plan recommendations", () => {
    const recommendations = buildRulesBasedRecommendations({
      review,
      holdings: [holding({ encryptedValues })],
      staleWarnings: [
        {
          holdingId: "stale_1",
          assetLabel: "Gold bars",
          assetClass: "gold",
          valuationDate: "2026-01-01",
          staleAfterDays: 1,
          daysOld: 165,
        },
      ],
      p1RebalanceBandPercent: 5,
      concentrationWarningPercent: 50,
    });

    expect(recommendations.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "allocation:P1",
        "p3:allocation-cap",
        "trade-plan:holding_1",
        "stale:stale_1",
        "concentration:assetClass:crypto",
        "leverage:derivative-exposure",
      ]),
    );
    expect(recommendations.find((item) => item.id === "allocation:P1")).toMatchObject({
      severity: "warning",
      title: "P1 drifted outside its rebalance band",
    });
    expect(recommendations.find((item) => item.id === "p3:allocation-cap")).toMatchObject({
      severity: "critical",
    });
  });

  it("does not emit value-dependent recommendations while locked", () => {
    const recommendations = buildRulesBasedRecommendations({
      review: { ...review, locked: true, totalBaseValue: 0 },
      holdings: [],
      staleWarnings: [],
    });

    expect(recommendations).toEqual([]);
  });
});
