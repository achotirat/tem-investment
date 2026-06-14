import { describe, expect, it } from "vitest";

import {
  evaluateP3Guardrails,
  validateDecisionLogInput,
  validateP2TradePlan,
} from "../src/server/discipline-service";
import type { DecisionLogInput, P2TradePlan } from "../src/shared/discipline";

const encryptedField = {
  version: 1 as const,
  algorithm: "AES-GCM" as const,
  iv: "iv",
  ciphertext: "ciphertext",
};

const completeTradePlan: P2TradePlan = {
  entryReason: "Breakout with defined risk",
  setup: "System A",
  stopLoss: "Below weekly low",
  takeProfitPlan: "Scale at 2R and trail",
  invalidationCondition: "Weekly close below support",
  positionSizing: "1% risk",
  expectedHoldingPeriod: "3 months",
};

const decisionLog: DecisionLogInput = {
  householdId: "household_1",
  holdingId: "holding_1",
  actorIdentityUserId: "user_1",
  action: "sell",
  scope: "holding",
  reasonRequired: true,
  encryptedDetails: {
    reason: encryptedField,
  },
  metadata: {
    portfolioBucket: "P1",
  },
};

describe("validateP2TradePlan", () => {
  it("requires every strict trade-plan field for active P2 positions", () => {
    expect(
      validateP2TradePlan({
        portfolioBucket: "P2",
        status: "active",
        tradePlan: {
          ...completeTradePlan,
          stopLoss: "",
        },
      }),
    ).toEqual({
      ok: false,
      message: "P2 active positions require a complete trade plan before saving.",
    });
  });

  it("accepts complete strict trade plans for active P2 positions", () => {
    expect(
      validateP2TradePlan({
        portfolioBucket: "P2",
        status: "active",
        tradePlan: completeTradePlan,
      }),
    ).toEqual({ ok: true });
  });

  it("does not require a strict trade plan outside P2", () => {
    expect(
      validateP2TradePlan({
        portfolioBucket: "P1",
        status: "active",
      }),
    ).toEqual({ ok: true });
  });
});

describe("evaluateP3Guardrails", () => {
  it("requires an override reason when a P3 entry exceeds the target cap", () => {
    expect(
      evaluateP3Guardrails({
        portfolioTotalValueThb: 1_000_000,
        p3CurrentValueThb: 90_000,
        candidateValueThb: 25_000,
        p3TargetAllocationPercent: 10,
        maxLossPerTradeThb: 10_000,
        maxLossPerMonthThb: 30_000,
        currentMonthLossThb: 0,
      }),
    ).toEqual({
      ok: false,
      message: "P3 allocation would exceed the 10% target. Add an override reason to save.",
      warnings: ["P3 allocation would exceed the 10% target."],
    });
  });

  it("accepts an over-cap P3 entry when an override reason is supplied", () => {
    expect(
      evaluateP3Guardrails({
        portfolioTotalValueThb: 1_000_000,
        p3CurrentValueThb: 90_000,
        candidateValueThb: 25_000,
        p3TargetAllocationPercent: 10,
        maxLossPerTradeThb: 10_000,
        maxLossPerMonthThb: 30_000,
        currentMonthLossThb: 0,
        overrideReason: "Small controlled tactical position",
      }),
    ).toEqual({
      ok: true,
      warnings: ["P3 allocation would exceed the 10% target."],
    });
  });

  it("requires acknowledgement when P3 loss limits are already breached", () => {
    expect(
      evaluateP3Guardrails({
        portfolioTotalValueThb: 1_000_000,
        p3CurrentValueThb: 30_000,
        candidateValueThb: 10_000,
        p3TargetAllocationPercent: 10,
        maxLossPerTradeThb: 10_000,
        maxLossPerMonthThb: 30_000,
        currentMonthLossThb: 31_000,
      }),
    ).toEqual({
      ok: false,
      message: "P3 monthly loss limit is already breached. Acknowledge the breach to save.",
      warnings: ["P3 monthly loss limit is already breached."],
    });
  });
});

describe("validateDecisionLogInput", () => {
  it("requires encrypted reason details for P1 sell and reduce decisions", () => {
    expect(
      validateDecisionLogInput({
        ...decisionLog,
        encryptedDetails: {
          reason: {
            ...encryptedField,
            ciphertext: "",
          },
        },
      }),
    ).toEqual({
      ok: false,
      message: "P1 sell/reduce decisions require an encrypted reason.",
    });
  });
});
