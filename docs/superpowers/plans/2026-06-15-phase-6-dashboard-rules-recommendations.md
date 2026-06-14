# Phase 6 Dashboard Rules Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete review dashboard layer: allocation, ownership, concentration, and rules-based recommendations after the user unlocks sensitive values.

**Architecture:** Keep all value calculations in the browser, using the existing session-only CryptoKey to decrypt holding values in memory. Add pure analytics and recommendation modules, then render those summaries in focused dashboard panels. Existing server APIs remain unchanged because the server still never sees plaintext values.

**Tech Stack:** Next.js App Router client components, React, Web Crypto AES-GCM helpers, Vitest, Testing Library.

---

## File Structure

- Create `src/shared/dashboard.ts` for portfolio review analytics and recommendation types.
- Modify `src/client/pricing/portfolio-valuations.ts` to add unlocked review analytics while preserving `calculatePortfolioValue`.
- Create `src/client/recommendations/rules-recommendations.ts` for deterministic guardrail recommendations.
- Create `src/client/dashboard/PortfolioReviewPanel.tsx` for allocation, owner net worth, and concentration panels.
- Create `src/client/dashboard/RulesRecommendationPanel.tsx` for rule recommendation display.
- Modify `src/client/DashboardShell.tsx` to calculate review analytics and render the new panels.
- Modify `src/client/demo-workspace.ts` so demo mode illustrates phase 6 warnings and concentration data.
- Modify `app/globals.css` for compact analytics and recommendation rows.
- Add tests:
  - `tests/portfolio-review.test.ts`
  - `tests/rules-recommendations.test.ts`
  - `tests/dashboard-review-panels.test.tsx`
  - update `tests/dashboard-shell.test.tsx` and `tests/demo-login.test.tsx` as needed.

## Task 1: Portfolio Review Analytics

**Files:**
- Create: `src/shared/dashboard.ts`
- Modify: `src/client/pricing/portfolio-valuations.ts`
- Create: `tests/portfolio-review.test.ts`

- [ ] **Step 1: Write the failing analytics tests**

Create `tests/portfolio-review.test.ts`:

```ts
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
    expect(review.bucketAllocations[0]).toMatchObject({ key: "P1", targetPercent: 60, valueBase: 0 });
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
```

- [ ] **Step 2: Run the analytics tests to verify RED**

Run: `npm test -- tests/portfolio-review.test.ts`

Expected: FAIL because `calculatePortfolioReview` and `src/shared/dashboard.ts` do not exist.

- [ ] **Step 3: Add shared dashboard types**

Create `src/shared/dashboard.ts`:

```ts
import type { PortfolioBucket } from "./holdings";
import type { PortfolioValueSnapshot } from "./pricing";

export type DashboardAllocation = {
  key: PortfolioBucket;
  label: string;
  targetPercent: number;
  valueBase: number;
  percent: number;
  driftPercent: number;
};

export type DashboardExposureGroup = {
  key: string;
  label: string;
  valueBase: number;
  percent: number;
};

export type DashboardExposureSummary = {
  assetClass: DashboardExposureGroup[];
  platform: DashboardExposureGroup[];
  currency: DashboardExposureGroup[];
  owner: DashboardExposureGroup[];
  liquidity: DashboardExposureGroup[];
  leverage: DashboardExposureGroup[];
};

export type OwnerNetWorthSummary = {
  ownerEntityId: string;
  displayName: string;
  valueBase: number;
  percent: number;
};

export type PortfolioReviewSnapshot = PortfolioValueSnapshot & {
  bucketAllocations: DashboardAllocation[];
  ownerNetWorth: OwnerNetWorthSummary[];
  exposures: DashboardExposureSummary;
};

export type RecommendationSeverity = "info" | "warning" | "critical";

export type RecommendationCategory =
  | "allocation"
  | "stale_valuation"
  | "trade_plan"
  | "p3_guardrail"
  | "concentration"
  | "leverage";

export type RuleRecommendation = {
  id: string;
  severity: RecommendationSeverity;
  category: RecommendationCategory;
  title: string;
  detail: string;
  actionLabel: string;
  relatedHoldingId?: string;
};
```

- [ ] **Step 4: Implement the minimal review analytics**

Modify `src/client/pricing/portfolio-valuations.ts` to keep `calculatePortfolioValue` and add `calculatePortfolioReview`. Use these internal helpers:

```ts
const BUCKETS = [
  { key: "P1" as const, label: "P1 Store of Wealth", targetPercent: 60 },
  { key: "P2" as const, label: "P2 Investment / System Trading", targetPercent: 30 },
  { key: "P3" as const, label: "P3 Speculation", targetPercent: 10 },
];

function percentOf(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

function leverageKeyFor(assetClass: string): { key: string; label: string } {
  if (assetClass === "derivative") return { key: "leveraged", label: "Leveraged / derivative" };
  return { key: "unlevered", label: "Unlevered / not tracked" };
}
```

`calculatePortfolioReview` should:

- Return locked totals plus empty review groups when `sessionKey` is null.
- Decrypt `currentValue` for active holdings only.
- Convert values to the household base currency using the existing USD/THB conversion helpers.
- Compute bucket allocation values and target drift.
- Compute owner net worth from `ownershipSplits`.
- Compute concentration exposure groups for asset class, platform/account, currency, owner, liquidity, and leverage.
- Keep `calculatePortfolioValue` implemented as a wrapper that returns the value fields from `calculatePortfolioReview`.

- [ ] **Step 5: Run analytics tests to verify GREEN**

Run: `npm test -- tests/portfolio-review.test.ts tests/portfolio-valuations.test.ts`

Expected: PASS.

## Task 2: Rules-Based Recommendations

**Files:**
- Create: `src/client/recommendations/rules-recommendations.ts`
- Create: `tests/rules-recommendations.test.ts`

- [ ] **Step 1: Write the failing recommendation tests**

Create `tests/rules-recommendations.test.ts`:

```ts
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
    { key: "P1", label: "P1 Store of Wealth", targetPercent: 60, valueBase: 72000, percent: 72, driftPercent: 12 },
    { key: "P2", label: "P2 Investment / System Trading", targetPercent: 30, valueBase: 8000, percent: 8, driftPercent: -22 },
    { key: "P3", label: "P3 Speculation", targetPercent: 10, valueBase: 20000, percent: 20, driftPercent: 10 },
  ],
  ownerNetWorth: [{ ownerEntityId: "owner_1", displayName: "Tem", valueBase: 100000, percent: 100 }],
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
```

- [ ] **Step 2: Run recommendation tests to verify RED**

Run: `npm test -- tests/rules-recommendations.test.ts`

Expected: FAIL because `rules-recommendations.ts` does not exist.

- [ ] **Step 3: Implement the rules engine**

Create `src/client/recommendations/rules-recommendations.ts`:

```ts
import type { PortfolioReviewSnapshot, RuleRecommendation } from "../../shared/dashboard";
import type { HoldingSummary } from "../../shared/holdings";
import type { ValuationFreshnessWarning } from "../../shared/pricing";

type BuildRulesInput = {
  review: PortfolioReviewSnapshot;
  holdings: HoldingSummary[];
  staleWarnings: ValuationFreshnessWarning[];
  p1RebalanceBandPercent?: number;
  concentrationWarningPercent?: number;
};

export function buildRulesBasedRecommendations({
  review,
  holdings,
  staleWarnings,
  p1RebalanceBandPercent = 5,
  concentrationWarningPercent = 50,
}: BuildRulesInput): RuleRecommendation[] {
  if (review.locked) return [];

  const recommendations: RuleRecommendation[] = [];

  const p1 = review.bucketAllocations.find((bucket) => bucket.key === "P1");
  if (p1 && Math.abs(p1.driftPercent) > p1RebalanceBandPercent) {
    recommendations.push({
      id: "allocation:P1",
      severity: "warning",
      category: "allocation",
      title: "P1 drifted outside its rebalance band",
      detail: `P1 is ${formatPercent(p1.percent)}% versus a ${formatPercent(p1.targetPercent)}% target.`,
      actionLabel: "Review rebalance decision",
    });
  }

  const p3 = review.bucketAllocations.find((bucket) => bucket.key === "P3");
  if (p3 && p3.percent > p3.targetPercent) {
    recommendations.push({
      id: "p3:allocation-cap",
      severity: "critical",
      category: "p3_guardrail",
      title: "P3 is above its speculation cap",
      detail: `P3 is ${formatPercent(p3.percent)}% versus a ${formatPercent(p3.targetPercent)}% target.`,
      actionLabel: "Reduce or log override",
    });
  }

  for (const holding of holdings) {
    if (
      holding.status === "active" &&
      holding.portfolioBucket === "P2" &&
      !holding.encryptedValues.tradePlan
    ) {
      recommendations.push({
        id: `trade-plan:${holding.id}`,
        severity: "warning",
        category: "trade_plan",
        title: "P2 position is missing a trade plan",
        detail: `${holding.assetLabel} needs entry, stop, target, invalidation, sizing, and holding-period logic.`,
        actionLabel: "Add trade plan",
        relatedHoldingId: holding.id,
      });
    }
  }

  for (const warning of staleWarnings) {
    recommendations.push({
      id: `stale:${warning.holdingId}`,
      severity: "warning",
      category: "stale_valuation",
      title: "Valuation is stale",
      detail: `${warning.assetLabel} is ${warning.daysOld} days old; threshold is ${warning.staleAfterDays} days.`,
      actionLabel: "Update valuation",
      relatedHoldingId: warning.holdingId,
    });
  }

  addConcentrationRecommendations(recommendations, review, concentrationWarningPercent);

  const leveraged = review.exposures.leverage.find((group) => group.key === "leveraged");
  if (leveraged && leveraged.percent > 0) {
    recommendations.push({
      id: "leverage:derivative-exposure",
      severity: leveraged.percent >= 10 ? "warning" : "info",
      category: "leverage",
      title: "Leveraged or derivative exposure exists",
      detail: `${formatPercent(leveraged.percent)}% of portfolio value is in derivative-class holdings.`,
      actionLabel: "Review risk controls",
    });
  }

  return recommendations.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function addConcentrationRecommendations(
  recommendations: RuleRecommendation[],
  review: PortfolioReviewSnapshot,
  concentrationWarningPercent: number,
) {
  const categories = [
    ["assetClass", "asset class"],
    ["platform", "platform"],
    ["currency", "currency"],
    ["owner", "owner/entity"],
    ["liquidity", "liquidity"],
  ] as const;

  for (const [key, label] of categories) {
    const concentrated = review.exposures[key].find((group) => group.percent >= concentrationWarningPercent);
    if (!concentrated) continue;
    recommendations.push({
      id: `concentration:${key}:${concentrated.key}`,
      severity: "warning",
      category: "concentration",
      title: `High ${label} concentration`,
      detail: `${concentrated.label} represents ${formatPercent(concentrated.percent)}% of portfolio value.`,
      actionLabel: "Review concentration",
    });
  }
}

function formatPercent(value: number): string {
  return value.toFixed(value % 1 === 0 ? 0 : 1);
}

function severityRank(severity: RuleRecommendation["severity"]): number {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}
```

- [ ] **Step 4: Run recommendation tests to verify GREEN**

Run: `npm test -- tests/rules-recommendations.test.ts`

Expected: PASS.

## Task 3: Dashboard Review Panels

**Files:**
- Create: `src/client/dashboard/PortfolioReviewPanel.tsx`
- Create: `src/client/dashboard/RulesRecommendationPanel.tsx`
- Modify: `src/client/DashboardShell.tsx`
- Modify: `app/globals.css`
- Create: `tests/dashboard-review-panels.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `tests/dashboard-review-panels.test.tsx`:

```tsx
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
    { key: "P1", label: "P1 Store of Wealth", targetPercent: 60, valueBase: 72000, percent: 72, driftPercent: 12 },
    { key: "P2", label: "P2 Investment / System Trading", targetPercent: 30, valueBase: 8000, percent: 8, driftPercent: -22 },
    { key: "P3", label: "P3 Speculation", targetPercent: 10, valueBase: 20000, percent: 20, driftPercent: 10 },
  ],
  ownerNetWorth: [{ ownerEntityId: "owner_1", displayName: "Tem", valueBase: 100000, percent: 100 }],
  exposures: {
    assetClass: [{ key: "crypto", label: "Crypto", valueBase: 72000, percent: 72 }],
    platform: [{ key: "wallet", label: "Hardware wallet", valueBase: 72000, percent: 72 }],
    currency: [{ key: "USD", label: "USD", valueBase: 72000, percent: 72 }],
    owner: [{ key: "owner_1", label: "Tem", valueBase: 100000, percent: 100 }],
    liquidity: [{ key: "liquid", label: "Liquid", valueBase: 100000, percent: 100 }],
    leverage: [{ key: "leveraged", label: "Leveraged / derivative", valueBase: 20000, percent: 20 }],
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
    expect(screen.getByText("Tem")).toBeInTheDocument();
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
```

- [ ] **Step 2: Run component tests to verify RED**

Run: `npm test -- tests/dashboard-review-panels.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement review panel components**

Create `src/client/dashboard/PortfolioReviewPanel.tsx` with:

```tsx
"use client";

import { BarChart3, PieChart, Users } from "lucide-react";

import type { DashboardExposureGroup, PortfolioReviewSnapshot } from "../../shared/dashboard";

type PortfolioReviewPanelProps = {
  review: PortfolioReviewSnapshot;
};

export function PortfolioReviewPanel({ review }: PortfolioReviewPanelProps) {
  return (
    <>
      <section className="panel span-8">
        <div className="panel-header">
          <div className="panel-title">
            <PieChart aria-hidden="true" size={18} />
            Allocation review
          </div>
          <span className="pill">60 / 30 / 10</span>
        </div>
        <div className="panel-body bucket-list">
          {review.bucketAllocations.map((bucket) => (
            <div className="bucket-row review-row" key={bucket.key}>
              <span className="bucket-name">{bucket.label}</span>
              <span className="bucket-target">
                {review.locked ? "Locked" : `${formatPercent(bucket.percent)}% actual`}
              </span>
              <div className="bucket-bar">
                <span className={bucket.key.toLowerCase()} style={{ width: `${review.locked ? bucket.targetPercent : bucket.percent}%` }} />
              </div>
              <small>
                Target {formatPercent(bucket.targetPercent)}%
                {review.locked ? "" : ` · drift ${formatSignedPercent(bucket.driftPercent)} pts`}
              </small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-4">
        <div className="panel-header">
          <div className="panel-title">
            <Users aria-hidden="true" size={18} />
            Owner net worth
          </div>
          <span className="pill">{review.baseCurrency}</span>
        </div>
        <div className="panel-body review-list">
          {review.ownerNetWorth.length === 0 ? (
            <div className="empty-state compact">Unlock to calculate ownership</div>
          ) : (
            review.ownerNetWorth.map((owner) => (
              <MetricRow
                group={{
                  key: owner.ownerEntityId,
                  label: owner.displayName,
                  valueBase: owner.valueBase,
                  percent: owner.percent,
                }}
                key={owner.ownerEntityId}
              />
            ))
          )}
        </div>
      </section>

      <section className="panel span-12">
        <div className="panel-header">
          <div className="panel-title">
            <BarChart3 aria-hidden="true" size={18} />
            Concentration views
          </div>
          <span className="pill">Category risk</span>
        </div>
        <div className="panel-body exposure-grid">
          <ExposureColumn title="Asset class" groups={review.exposures.assetClass} />
          <ExposureColumn title="Platform" groups={review.exposures.platform} />
          <ExposureColumn title="Currency" groups={review.exposures.currency} />
          <ExposureColumn title="Owner/entity" groups={review.exposures.owner} />
          <ExposureColumn title="Liquidity" groups={review.exposures.liquidity} />
          <ExposureColumn title="Leverage" groups={review.exposures.leverage} />
        </div>
      </section>
    </>
  );
}

function ExposureColumn({ title, groups }: { title: string; groups: DashboardExposureGroup[] }) {
  return (
    <div className="exposure-column">
      <div className="metric-label">{title}</div>
      {groups.length === 0 ? (
        <div className="empty-state compact">Locked</div>
      ) : (
        groups.slice(0, 3).map((group) => <MetricRow group={group} key={group.key} />)
      )}
    </div>
  );
}

function MetricRow({ group }: { group: DashboardExposureGroup }) {
  return (
    <div className="metric-row">
      <strong>{group.label}</strong>
      <span>{formatPercent(group.percent)}%</span>
    </div>
  );
}

function formatPercent(value: number): string {
  return value.toFixed(value % 1 === 0 ? 0 : 1);
}

function formatSignedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${formatPercent(value)}`;
}
```

Create `src/client/dashboard/RulesRecommendationPanel.tsx` with:

```tsx
"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { RuleRecommendation } from "../../shared/dashboard";

type RulesRecommendationPanelProps = {
  recommendations: RuleRecommendation[];
};

export function RulesRecommendationPanel({ recommendations }: RulesRecommendationPanelProps) {
  return (
    <section className="panel span-12 recommendation-panel">
      <div className="panel-header">
        <div className="panel-title">
          <AlertTriangle aria-hidden="true" size={18} />
          Rules-based recommendations
        </div>
        <span className="pill">{recommendations.length} open</span>
      </div>
      <div className="panel-body recommendation-list">
        {recommendations.length === 0 ? (
          <div className="empty-state compact">
            <CheckCircle2 aria-hidden="true" size={18} />
            No rules-based recommendations
          </div>
        ) : (
          recommendations.map((recommendation) => (
            <article className={`recommendation-row ${recommendation.severity}`} key={recommendation.id}>
              <span className="severity-pill">{labelForSeverity(recommendation.severity)}</span>
              <div>
                <strong>{recommendation.title}</strong>
                <small>{recommendation.detail}</small>
              </div>
              <span className="action-label">{recommendation.actionLabel}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function labelForSeverity(severity: RuleRecommendation["severity"]): string {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Warning";
  return "Info";
}
```

- [ ] **Step 4: Integrate panels in DashboardShell**

Modify `src/client/DashboardShell.tsx`:

- Import `useMemo`, `PortfolioReviewSnapshot`, `PortfolioReviewPanel`, `RulesRecommendationPanel`, `calculatePortfolioReview`, and `buildRulesBasedRecommendations`.
- Replace the `portfolioValue` state with `portfolioReview`.
- Use `calculatePortfolioReview({ holdings: localHoldings, prices, baseCurrency: household.baseCurrency, secondaryCurrency: household.secondaryCurrency, ownerEntities, sessionKey })`.
- Build recommendations with `useMemo`:

```ts
const recommendations = useMemo(
  () =>
    buildRulesBasedRecommendations({
      review: portfolioReview,
      holdings: localHoldings,
      staleWarnings,
    }),
  [localHoldings, portfolioReview, staleWarnings],
);
```

- Keep the Base value and Secondary view panels using `portfolioReview.totalBaseValue`, `portfolioReview.totalSecondaryValue`, and `portfolioReview.locked`.
- Replace the old static Bucket discipline panel and old Warnings panel with:

```tsx
<PortfolioReviewPanel review={portfolioReview} />
<RulesRecommendationPanel recommendations={recommendations} />
```

- Keep `PriceRefreshPanel`, `AddHoldingPanel`, `HoldingsList`, `LogHoldingDecisionPanel`, and `DecisionLogPanel` below the review panels.

- [ ] **Step 5: Add compact review CSS**

Modify `app/globals.css`:

```css
.review-row small {
  grid-column: 1 / -1;
  color: var(--muted-ink);
  font-size: 12px;
  font-weight: 800;
}

.review-list,
.recommendation-list {
  display: grid;
  gap: 10px;
}

.exposure-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.exposure-column {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
}

.metric-row,
.recommendation-row {
  display: grid;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 10px 12px;
}

.metric-row {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.metric-row strong,
.recommendation-row strong {
  overflow-wrap: anywhere;
}

.metric-row span,
.action-label {
  color: var(--muted-ink);
  font-size: 12px;
  font-weight: 900;
}

.recommendation-row {
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
}

.recommendation-row.critical {
  border-color: rgba(180, 59, 46, 0.45);
  background: var(--red-soft);
}

.recommendation-row.warning {
  border-color: rgba(184, 121, 22, 0.45);
  background: var(--amber-soft);
}

.severity-pill {
  display: inline-grid;
  min-width: 72px;
  min-height: 28px;
  place-items: center;
  border-radius: 999px;
  background: var(--ink);
  color: white;
  font-size: 12px;
  font-weight: 900;
}

.empty-state.compact {
  min-height: 64px;
  gap: 8px;
}
```

Extend the mobile media rule:

```css
  .exposure-grid,
  .recommendation-row {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 6: Run component tests to verify GREEN**

Run: `npm test -- tests/dashboard-review-panels.test.tsx tests/dashboard-shell.test.tsx`

Expected: PASS.

## Task 4: Demo Workspace and End-to-End Coverage

**Files:**
- Modify: `src/client/demo-workspace.ts`
- Modify: `tests/demo-login.test.tsx`

- [ ] **Step 1: Write failing demo dashboard expectations**

Update `tests/demo-login.test.tsx` after the unlock assertion:

```ts
    expect(await screen.findByText("Allocation review")).toBeInTheDocument();
    expect(screen.getByText("Owner net worth")).toBeInTheDocument();
    expect(screen.getByText("Concentration views")).toBeInTheDocument();
    expect(screen.getByText("Rules-based recommendations")).toBeInTheDocument();
    expect(screen.getByText("P3 is above its speculation cap")).toBeInTheDocument();
```

- [ ] **Step 2: Run demo test to verify RED**

Run: `npm test -- tests/demo-login.test.tsx`

Expected: FAIL until the demo dataset creates a P3 over-cap scenario and dashboard panels are integrated.

- [ ] **Step 3: Adjust demo holdings to exercise phase 6**

Modify `src/client/demo-workspace.ts`:

- Keep `BTC cold storage` in P1.
- Keep `Gold bars` in P1.
- Keep `SET system trade` in P2 with a trade plan in `encryptedValues.tradePlan` so it does not create a missing-plan recommendation.
- Add a P3 derivative holding named `TFEX speculation sleeve` with a THB current value high enough to exceed 10% of total demo value.
- Ensure ownership splits include both `Tem` and `Partner` so the owner net-worth panel is meaningful.

- [ ] **Step 4: Run demo test to verify GREEN**

Run: `npm test -- tests/demo-login.test.tsx`

Expected: PASS.

## Task 5: Full Verification, Browser Smoke, and Branch Completion

**Files:**
- All Phase 6 files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/portfolio-review.test.ts tests/rules-recommendations.test.ts tests/dashboard-review-panels.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Browser smoke the demo review flow**

Run: `npm run next:dev -- -p 3000`

Open `http://localhost:3000`, click `Use demo`, unlock with `demo`, and verify:

- Base value and secondary value show numbers.
- Allocation review shows actual percentages.
- Owner net worth is populated.
- Concentration views list asset class, platform, currency, owner/entity, liquidity, and leverage.
- Rules-based recommendations includes the P3 cap recommendation.
- Mobile width around 390px has no horizontal overflow.

Stop the dev server after smoke testing.

- [ ] **Step 5: Complete the branch**

Run:

```bash
git status --short --branch
git add docs/superpowers/plans/2026-06-15-phase-6-dashboard-rules-recommendations.md src/shared/dashboard.ts src/client/pricing/portfolio-valuations.ts src/client/recommendations/rules-recommendations.ts src/client/dashboard/PortfolioReviewPanel.tsx src/client/dashboard/RulesRecommendationPanel.tsx src/client/DashboardShell.tsx src/client/demo-workspace.ts app/globals.css tests/portfolio-review.test.ts tests/rules-recommendations.test.ts tests/dashboard-review-panels.test.tsx tests/dashboard-shell.test.tsx tests/demo-login.test.tsx
git commit -m "Add phase 6 dashboard recommendations"
git push -u origin phase-6-dashboard-rules-recommendations
```

Expected: branch pushed for PR creation or update.

## Self-Review

- Spec coverage: Phase 6 requirements are covered for total value, allocation versus 60/30/10, owner net worth summary, concentration views, P1 drift, P2 missing trade plan, P3 cap, stale valuations, leverage exposure, and rule recommendations. P3 loss-budget warnings depend on existing phase 4 metadata and remain represented by the P3 cap recommendation until persisted loss history exists.
- Placeholder scan: no placeholders or deferred code instructions remain in the plan.
- Type consistency: `PortfolioReviewSnapshot`, `DashboardExposureSummary`, and `RuleRecommendation` are defined before use and consumed by analytics, recommendation, and UI tasks.
