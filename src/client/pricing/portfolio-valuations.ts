"use client";

import type { OwnerEntity } from "../../server/household-service";
import type {
  DashboardAllocation,
  DashboardExposureGroup,
  DashboardExposureSummary,
  OwnerNetWorthSummary,
  PortfolioReviewSnapshot,
} from "../../shared/dashboard";
import type { HoldingSummary } from "../../shared/holdings";
import type { MarketPriceSnapshot, PortfolioValueSnapshot } from "../../shared/pricing";
import { decryptSensitiveField } from "../crypto/portfolio-crypto";

const BUCKETS = [
  { key: "P1" as const, label: "P1 Store of Wealth", targetPercent: 60 },
  { key: "P2" as const, label: "P2 Investment / System Trading", targetPercent: 30 },
  { key: "P3" as const, label: "P3 Speculation", targetPercent: 10 },
];

export async function calculatePortfolioValue({
  holdings,
  prices,
  baseCurrency,
  secondaryCurrency,
  sessionKey,
}: {
  holdings: HoldingSummary[];
  prices: MarketPriceSnapshot[];
  baseCurrency: string;
  secondaryCurrency: string;
  sessionKey: CryptoKey | null;
}): Promise<PortfolioValueSnapshot> {
  const review = await calculatePortfolioReview({
    holdings,
    prices,
    baseCurrency,
    secondaryCurrency,
    ownerEntities: [],
    sessionKey,
  });

  return {
    locked: review.locked,
    baseCurrency: review.baseCurrency,
    secondaryCurrency: review.secondaryCurrency,
    totalBaseValue: review.totalBaseValue,
    totalSecondaryValue: review.totalSecondaryValue,
  };
}

export async function calculatePortfolioReview({
  holdings,
  prices,
  baseCurrency,
  secondaryCurrency,
  ownerEntities,
  sessionKey,
}: {
  holdings: HoldingSummary[];
  prices: MarketPriceSnapshot[];
  baseCurrency: string;
  secondaryCurrency: string;
  ownerEntities: OwnerEntity[];
  sessionKey: CryptoKey | null;
}): Promise<PortfolioReviewSnapshot> {
  if (!sessionKey) return lockedReview(baseCurrency, secondaryCurrency);

  const usdThb = prices.find((price) => price.priceKey === "fx:USDTHB")?.priceThb ?? null;
  let totalBaseValue = 0;
  const valuedHoldings: Array<{ holding: HoldingSummary; valueBase: number }> = [];

  for (const holding of holdings.filter((item) => item.status === "active")) {
    const plaintextValue = await decryptSensitiveField(
      holding.encryptedValues.currentValue,
      sessionKey,
    );
    const numericValue = Number(plaintextValue.replace(/,/g, ""));
    if (!Number.isFinite(numericValue)) continue;
    const valueBase = convertToBaseCurrency(numericValue, holding.currency, baseCurrency, usdThb);
    totalBaseValue += valueBase;
    valuedHoldings.push({ holding, valueBase });
  }

  const totalSecondaryValue = convertFromBaseCurrency(
    totalBaseValue,
    baseCurrency,
    secondaryCurrency,
    usdThb,
  );

  return {
    locked: false,
    baseCurrency,
    secondaryCurrency,
    totalBaseValue,
    totalSecondaryValue,
    bucketAllocations: buildBucketAllocations(valuedHoldings, totalBaseValue),
    ownerNetWorth: buildOwnerNetWorth(valuedHoldings, totalBaseValue, ownerEntities),
    exposures: buildExposures(valuedHoldings, totalBaseValue, ownerEntities),
  };
}

function lockedReview(baseCurrency: string, secondaryCurrency: string): PortfolioReviewSnapshot {
  return {
    locked: true,
    baseCurrency,
    secondaryCurrency,
    totalBaseValue: 0,
    totalSecondaryValue: 0,
    bucketAllocations: BUCKETS.map((bucket) => ({
      ...bucket,
      valueBase: 0,
      percent: 0,
      driftPercent: 0 - bucket.targetPercent,
    })),
    ownerNetWorth: [],
    exposures: {
      assetClass: [],
      platform: [],
      currency: [],
      owner: [],
      liquidity: [],
      leverage: [],
    },
  };
}

function buildBucketAllocations(
  valuedHoldings: Array<{ holding: HoldingSummary; valueBase: number }>,
  totalBaseValue: number,
): DashboardAllocation[] {
  return BUCKETS.map((bucket) => {
    const valueBase = sumBy(
      valuedHoldings.filter(({ holding }) => holding.portfolioBucket === bucket.key),
      ({ valueBase }) => valueBase,
    );
    const percent = percentOf(valueBase, totalBaseValue);
    return {
      ...bucket,
      valueBase,
      percent,
      driftPercent: roundPercent(percent - bucket.targetPercent),
    };
  });
}

function buildOwnerNetWorth(
  valuedHoldings: Array<{ holding: HoldingSummary; valueBase: number }>,
  totalBaseValue: number,
  ownerEntities: OwnerEntity[],
): OwnerNetWorthSummary[] {
  const ownerLabels = new Map(ownerEntities.map((owner) => [owner.id, owner.displayName]));
  const ownerValues = new Map<string, number>();

  for (const { holding, valueBase } of valuedHoldings) {
    for (const split of holding.ownershipSplits) {
      ownerValues.set(
        split.ownerEntityId,
        (ownerValues.get(split.ownerEntityId) ?? 0) + valueBase * (split.percentage / 100),
      );
    }
  }

  return [...ownerValues.entries()]
    .map(([ownerEntityId, valueBase]) => ({
      ownerEntityId,
      displayName: ownerLabels.get(ownerEntityId) ?? ownerEntityId,
      valueBase,
      percent: percentOf(valueBase, totalBaseValue),
    }))
    .sort((a, b) => b.valueBase - a.valueBase);
}

function buildExposures(
  valuedHoldings: Array<{ holding: HoldingSummary; valueBase: number }>,
  totalBaseValue: number,
  ownerEntities: OwnerEntity[],
): DashboardExposureSummary {
  const ownerLabels = new Map(ownerEntities.map((owner) => [owner.id, owner.displayName]));

  return {
    assetClass: groupExposure(
      valuedHoldings.map(({ holding, valueBase }) => ({
        key: holding.assetClass,
        label: labelize(holding.assetClass),
        valueBase,
      })),
      totalBaseValue,
    ),
    platform: groupExposure(
      valuedHoldings.map(({ holding, valueBase }) => ({
        key: holding.accountLabel,
        label: holding.accountLabel,
        valueBase,
      })),
      totalBaseValue,
    ),
    currency: groupExposure(
      valuedHoldings.map(({ holding, valueBase }) => ({
        key: holding.currency.toUpperCase(),
        label: holding.currency.toUpperCase(),
        valueBase,
      })),
      totalBaseValue,
    ),
    owner: groupExposure(
      valuedHoldings.flatMap(({ holding, valueBase }) =>
        holding.ownershipSplits.map((split) => ({
          key: split.ownerEntityId,
          label: ownerLabels.get(split.ownerEntityId) ?? split.ownerEntityId,
          valueBase: valueBase * (split.percentage / 100),
        })),
      ),
      totalBaseValue,
    ),
    liquidity: groupExposure(
      valuedHoldings.map(({ holding, valueBase }) => ({
        key: holding.liquidityCategory,
        label: labelize(holding.liquidityCategory),
        valueBase,
      })),
      totalBaseValue,
    ),
    leverage: groupExposure(
      valuedHoldings.map(({ holding, valueBase }) => ({
        ...leverageKeyFor(holding.assetClass),
        valueBase,
      })),
      totalBaseValue,
    ),
  };
}

function groupExposure(
  items: Array<{ key: string; label: string; valueBase: number }>,
  totalBaseValue: number,
): DashboardExposureGroup[] {
  const grouped = new Map<string, { label: string; valueBase: number }>();

  for (const item of items) {
    const current = grouped.get(item.key);
    grouped.set(item.key, {
      label: current?.label ?? item.label,
      valueBase: (current?.valueBase ?? 0) + item.valueBase,
    });
  }

  return [...grouped.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      valueBase: group.valueBase,
      percent: percentOf(group.valueBase, totalBaseValue),
    }))
    .sort((a, b) => b.valueBase - a.valueBase);
}

function percentOf(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return roundPercent((value / total) * 100);
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2));
}

function sumBy<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((total, item) => total + selector(item), 0);
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function leverageKeyFor(assetClass: string): { key: string; label: string } {
  if (assetClass === "derivative") return { key: "leveraged", label: "Leveraged / derivative" };
  return { key: "unlevered", label: "Unlevered / not tracked" };
}

function convertToBaseCurrency(
  value: number,
  currency: string,
  baseCurrency: string,
  usdThb: number | null,
): number {
  const normalizedCurrency = currency.toUpperCase();
  const normalizedBase = baseCurrency.toUpperCase();
  if (normalizedCurrency === normalizedBase) return value;
  if (normalizedCurrency === "USD" && normalizedBase === "THB" && usdThb) return value * usdThb;
  if (normalizedCurrency === "THB" && normalizedBase === "USD" && usdThb) return value / usdThb;
  return 0;
}

function convertFromBaseCurrency(
  value: number,
  baseCurrency: string,
  secondaryCurrency: string,
  usdThb: number | null,
): number {
  const normalizedBase = baseCurrency.toUpperCase();
  const normalizedSecondary = secondaryCurrency.toUpperCase();
  if (normalizedBase === normalizedSecondary) return value;
  if (normalizedBase === "THB" && normalizedSecondary === "USD" && usdThb) return value / usdThb;
  if (normalizedBase === "USD" && normalizedSecondary === "THB" && usdThb) return value * usdThb;
  return 0;
}
