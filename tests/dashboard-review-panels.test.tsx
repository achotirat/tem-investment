import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PortfolioReviewPanel } from "../src/client/dashboard/PortfolioReviewPanel";
import { RulesRecommendationPanel } from "../src/client/dashboard/RulesRecommendationPanel";
import type { PortfolioReviewSnapshot, RuleRecommendation } from "../src/shared/dashboard";

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
    platform: [{ key: "wallet", label: "Hardware wallet", valueBase: 72000, percent: 72 }],
    currency: [{ key: "USD", label: "USD", valueBase: 72000, percent: 72 }],
    owner: [{ key: "owner_1", label: "Tem", valueBase: 100000, percent: 100 }],
    liquidity: [{ key: "liquid", label: "Liquid", valueBase: 100000, percent: 100 }],
    leverage: [
      { key: "leveraged", label: "Leveraged / derivative", valueBase: 20000, percent: 20 },
    ],
  },
};

const recommendations: RuleRecommendation[] = [
  {
    id: "p3:allocation-cap",
    severity: "critical",
    category: "p3_guardrail",
    title: "P3 is above its speculation cap",
    detail: "P3 is 20% versus a 10% target.",
    actionLabel: "Reduce or log override",
  },
];

describe("dashboard review panels", () => {
  it("renders unlocked allocation, owner net worth, and concentration summaries", () => {
    render(<PortfolioReviewPanel review={review} />);

    expect(screen.getByText("Allocation review")).toBeInTheDocument();
    expect(screen.getByText("72% actual")).toBeInTheDocument();
    expect(screen.getAllByText("Tem")).toHaveLength(2);
    expect(screen.getByText("Asset class")).toBeInTheDocument();
    expect(screen.getByText("Hardware wallet")).toBeInTheDocument();
    expect(screen.getByText("Leveraged / derivative")).toBeInTheDocument();
  });

  it("renders rules-based recommendations with severity labels", () => {
    render(<RulesRecommendationPanel recommendations={recommendations} />);

    expect(screen.getByText("Rules-based recommendations")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("P3 is above its speculation cap")).toBeInTheDocument();
  });
});
