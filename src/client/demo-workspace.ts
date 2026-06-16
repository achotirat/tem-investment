"use client";

import type { HouseholdBootstrap } from "../server/household-service";
import type { AIAnalysisRunSummary } from "../shared/ai-analysis";
import type { DecisionLogSummary } from "../shared/discipline";
import type { ExportBackupMetadata } from "../shared/export-backup";
import type { HoldingSummary } from "../shared/holdings";
import type { NotificationSummary } from "../shared/notifications";
import type { PriceDashboardPayload } from "../shared/pricing";
import { encryptSensitiveField, type DerivedMasterKey } from "./crypto/portfolio-crypto";

export type DemoWorkspace = {
  bootstrap: HouseholdBootstrap;
  holdings: HoldingSummary[];
  decisions: DecisionLogSummary[];
  notifications: NotificationSummary[];
  aiAnalysisRuns: AIAnalysisRunSummary[];
  exportBackups: ExportBackupMetadata[];
  priceDashboard: PriceDashboardPayload;
};

export const DEMO_IDENTITY_USER = {
  id: "demo_user",
  email: "demo@example.com",
};

const DEMO_HOUSEHOLD_ID = "demo_household";
const DEMO_OWNER_ID = "demo_owner";
const DEMO_PARTNER_ID = "demo_partner";

export async function createDemoWorkspace(): Promise<DemoWorkspace> {
  const key = await createDemoKey();

  const holdings: HoldingSummary[] = [
    await createDemoHolding(key, {
      id: "demo_btc",
      portfolioBucket: "P1",
      assetClass: "crypto",
      assetLabel: "BTC cold storage",
      accountLabel: "Hardware wallet",
      currency: "USD",
      liquidityCategory: "liquid",
      valuationSource: "auto_price",
      valuationDate: "2026-06-15",
      quantity: "1.25",
      costBasis: "45000",
      currentValue: "85000",
      ownerEntityId: DEMO_OWNER_ID,
      autoPriceKey: "crypto:BTC",
      latestMarketPriceThb: 3102500,
    }),
    await createDemoHolding(key, {
      id: "demo_gold",
      portfolioBucket: "P1",
      assetClass: "gold",
      assetLabel: "Gold bars",
      accountLabel: "Vault",
      currency: "THB",
      liquidityCategory: "semi_liquid",
      valuationSource: "auto_price",
      valuationDate: "2026-06-15",
      quantity: "5",
      costBasis: "350000",
      currentValue: "420000",
      ownerEntityId: DEMO_PARTNER_ID,
      autoPriceKey: "gold:XAU",
      latestMarketPriceThb: 84000,
    }),
    await createDemoHolding(key, {
      id: "demo_set_trade",
      portfolioBucket: "P2",
      assetClass: "stock",
      assetLabel: "SET system trade",
      accountLabel: "Broker",
      currency: "THB",
      liquidityCategory: "liquid",
      valuationSource: "manual",
      valuationDate: "2026-06-14",
      quantity: "1000",
      costBasis: "100000",
      currentValue: "120000",
      ownerEntityId: DEMO_OWNER_ID,
      autoPriceKey: "set:SET",
      latestMarketPriceThb: 120,
      tradePlan: JSON.stringify({
        entryReason: "System breakout with monthly risk inside plan.",
        setup: "SET trend-following system",
        stopLoss: "Close below system stop",
        takeProfitPlan: "Trail with system signal",
        invalidationCondition: "System exit signal",
        positionSizing: "1 risk unit",
        expectedHoldingPeriod: "1-2 years",
      }),
    }),
    await createDemoHolding(key, {
      id: "demo_tfex_speculation",
      portfolioBucket: "P3",
      assetClass: "derivative",
      assetLabel: "TFEX speculation sleeve",
      accountLabel: "Broker",
      currency: "THB",
      liquidityCategory: "liquid",
      valuationSource: "manual",
      valuationDate: "2026-06-15",
      quantity: "1",
      costBasis: "400000",
      currentValue: "550000",
      ownerEntityId: DEMO_OWNER_ID,
      autoPriceKey: "configured:TFEX",
      latestMarketPriceThb: 550000,
      p3OverrideReason: "Demo scenario showing the P3 cap warning.",
    }),
  ];

  return {
    bootstrap: {
      household: {
        id: DEMO_HOUSEHOLD_ID,
        name: "Demo Household",
        baseCurrency: "THB",
        secondaryCurrency: "USD",
      },
      member: {
        identityUserId: DEMO_IDENTITY_USER.id,
        email: DEMO_IDENTITY_USER.email,
        role: "owner",
      },
      ownerEntities: [
        { id: DEMO_OWNER_ID, displayName: "Tem", kind: "person" },
        { id: DEMO_PARTNER_ID, displayName: "Partner", kind: "person" },
      ],
    },
    holdings,
    decisions: [
      {
        id: "demo_decision_1",
        householdId: DEMO_HOUSEHOLD_ID,
        holdingId: "demo_set_trade",
        actorIdentityUserId: DEMO_IDENTITY_USER.id,
        action: "open_p2",
        scope: "holding",
        reasonRequired: true,
        metadata: {
          portfolioBucket: "P2",
          assetLabel: "SET system trade",
        },
        createdAt: "2026-06-15T02:00:00.000Z",
      },
    ],
    notifications: [
      {
        id: "demo_notification_review",
        householdId: DEMO_HOUSEHOLD_ID,
        kind: "scheduled_review",
        severity: "info",
        title: "Portfolio review is due",
        body: "Open the dashboard, unlock sensitive values, and clear the current review alerts.",
        actionLabel: "Open dashboard",
        sourceType: "household",
        sourceId: DEMO_HOUSEHOLD_ID,
        dueAt: "2026-06-15T02:00:00.000Z",
        channels: ["in_app", "email"],
        metadata: { email: DEMO_IDENTITY_USER.email },
        status: "unread",
        createdAt: "2026-06-15T02:00:00.000Z",
        readAt: null,
        emailedAt: null,
      },
      {
        id: "demo_notification_p3",
        householdId: DEMO_HOUSEHOLD_ID,
        kind: "p3_guardrail",
        severity: "critical",
        title: "P3 cap review needed",
        body: "TFEX speculation sleeve pushes P3 above its 10% target.",
        actionLabel: "Review P3 cap",
        sourceType: "holding",
        sourceId: "demo_tfex_speculation",
        dueAt: "2026-06-15T02:00:00.000Z",
        channels: ["in_app"],
        metadata: { assetLabel: "TFEX speculation sleeve" },
        status: "unread",
        createdAt: "2026-06-15T02:00:00.000Z",
        readAt: null,
        emailedAt: null,
      },
    ],
    aiAnalysisRuns: [],
    exportBackups: [],
    priceDashboard: {
      prices: [
        {
          priceKey: "fx:USDTHB",
          source: "fx",
          symbol: "USDTHB",
          currency: "THB",
          price: 36.5,
          priceThb: 36.5,
          provider: "demo",
          asOf: "2026-06-15T02:00:00.000Z",
        },
        {
          priceKey: "crypto:BTC",
          source: "crypto",
          symbol: "BTC",
          currency: "THB",
          price: 3102500,
          priceThb: 3102500,
          provider: "demo",
          asOf: "2026-06-15T02:00:00.000Z",
        },
      ],
      staleWarnings: [],
      lastSync: {
        id: "demo_sync_1",
        status: "success",
        startedAt: "2026-06-15T02:00:00.000Z",
        completedAt: "2026-06-15T02:00:03.000Z",
        pricesFetched: 2,
      },
    },
  };
}

export async function unlockDemoWorkspace(_masterPassword: string): Promise<DerivedMasterKey> {
  return {
    key: await createDemoKey(),
    method: "pbkdf2",
  };
}

async function createDemoHolding(
  key: CryptoKey,
  input: {
    id: string;
    portfolioBucket: HoldingSummary["portfolioBucket"];
    assetClass: HoldingSummary["assetClass"];
    assetLabel: string;
    accountLabel: string;
    currency: string;
    liquidityCategory: HoldingSummary["liquidityCategory"];
    valuationSource: HoldingSummary["valuationSource"];
    valuationDate: string;
    quantity: string;
    costBasis: string;
    currentValue: string;
    ownerEntityId: string;
    autoPriceKey: string;
    latestMarketPriceThb: number;
    tradePlan?: string;
    p3OverrideReason?: string;
  },
): Promise<HoldingSummary> {
  const encryptedValues: HoldingSummary["encryptedValues"] = {
    quantity: await encryptSensitiveField(input.quantity, key),
    costBasis: await encryptSensitiveField(input.costBasis, key),
    currentValue: await encryptSensitiveField(input.currentValue, key),
  };
  if (input.tradePlan) {
    encryptedValues.tradePlan = await encryptSensitiveField(input.tradePlan, key);
  }
  if (input.p3OverrideReason) {
    encryptedValues.p3OverrideReason = await encryptSensitiveField(input.p3OverrideReason, key);
  }

  return {
    id: input.id,
    householdId: DEMO_HOUSEHOLD_ID,
    portfolioBucket: input.portfolioBucket,
    assetClass: input.assetClass,
    assetLabel: input.assetLabel,
    accountLabel: input.accountLabel,
    currency: input.currency,
    liquidityCategory: input.liquidityCategory,
    valuationSource: input.valuationSource,
    valuationDate: input.valuationDate,
    status: "active",
    ownershipSplits: [{ ownerEntityId: input.ownerEntityId, percentage: 100 }],
    encryptedValues,
    autoPriceKey: input.autoPriceKey,
    latestMarketPriceThb: input.latestMarketPriceThb,
    latestMarketPriceAsOf: "2026-06-15T02:00:00.000Z",
  };
}

function createDemoKey(): Promise<CryptoKey> {
  const rawKey = new Uint8Array(32).fill(42);
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]);
}
