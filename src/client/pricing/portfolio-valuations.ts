"use client";

import type { HoldingSummary } from "../../shared/holdings";
import type { MarketPriceSnapshot, PortfolioValueSnapshot } from "../../shared/pricing";
import { decryptSensitiveField } from "../crypto/portfolio-crypto";

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
  if (!sessionKey) {
    return {
      locked: true,
      baseCurrency,
      secondaryCurrency,
      totalBaseValue: 0,
      totalSecondaryValue: 0,
    };
  }

  const usdThb = prices.find((price) => price.priceKey === "fx:USDTHB")?.priceThb ?? null;
  let totalBaseValue = 0;

  for (const holding of holdings.filter((item) => item.status === "active")) {
    const plaintextValue = await decryptSensitiveField(
      holding.encryptedValues.currentValue,
      sessionKey,
    );
    const numericValue = Number(plaintextValue.replace(/,/g, ""));
    if (!Number.isFinite(numericValue)) continue;
    totalBaseValue += convertToBaseCurrency(numericValue, holding.currency, baseCurrency, usdThb);
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
  };
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
