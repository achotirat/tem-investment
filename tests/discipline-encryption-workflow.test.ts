import { describe, expect, it } from "vitest";

import { deriveMasterKey } from "../src/client/crypto/portfolio-crypto";
import { prepareEncryptedDecisionSubmission } from "../src/client/decisions/encrypted-decision-submission";
import { prepareEncryptedHoldingSubmission } from "../src/client/holdings/encrypted-holding-submission";

async function testKey() {
  const { key } = await deriveMasterKey({
    masterPassword: "household-secret",
    salt: new Uint8Array(16).fill(7),
    argon2id: async () => new Uint8Array(32).fill(8),
  });
  return key;
}

describe("Phase 4 encrypted discipline submissions", () => {
  it("encrypts P2 trade-plan and decision reason details before holding submission", async () => {
    const submission = await prepareEncryptedHoldingSubmission(
      {
        householdId: "household_1",
        portfolioBucket: "P2",
        assetClass: "stock",
        assetLabel: "SET system trade",
        accountLabel: "Broker",
        currency: "THB",
        liquidityCategory: "liquid",
        valuationSource: "manual",
        valuationDate: "2026-06-14",
        status: "active",
        ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 100 }],
        quantity: "100",
        costBasis: "100000",
        currentValue: "120000",
        decisionReason: "Follow the system, not the mood",
        tradePlan: {
          entryReason: "Breakout with defined risk",
          setup: "System A",
          stopLoss: "Below weekly low",
          takeProfitPlan: "Scale at 2R and trail",
          invalidationCondition: "Weekly close below support",
          positionSizing: "1% risk",
          expectedHoldingPeriod: "3 months",
        },
      },
      await testKey(),
    );

    const serialized = JSON.stringify(submission);
    expect(serialized).not.toContain("Breakout with defined risk");
    expect(serialized).not.toContain("System A");
    expect(serialized).not.toContain("Follow the system");
    expect(submission.encryptedValues.tradePlan?.algorithm).toBe("AES-GCM");
    expect(submission.decisionLog?.action).toBe("open_p2");
    expect(submission.decisionLog?.encryptedDetails.reason.algorithm).toBe("AES-GCM");
    expect(submission.decisionLog?.encryptedDetails.tradePlan?.algorithm).toBe("AES-GCM");
  });

  it("encrypts P3 override details before holding submission", async () => {
    const submission = await prepareEncryptedHoldingSubmission(
      {
        householdId: "household_1",
        portfolioBucket: "P3",
        assetClass: "crypto",
        assetLabel: "Speculative token",
        accountLabel: "Exchange",
        currency: "THB",
        liquidityCategory: "liquid",
        valuationSource: "manual",
        valuationDate: "2026-06-14",
        status: "active",
        ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 100 }],
        quantity: "500",
        costBasis: "50000",
        currentValue: "60000",
        decisionReason: "Controlled speculation slot",
        p3Acknowledgement: {
          overrideReason: "One-week thesis with fixed stop",
          acknowledgedLossLimitBreach: true,
        },
      },
      await testKey(),
    );

    const serialized = JSON.stringify(submission);
    expect(serialized).not.toContain("One-week thesis");
    expect(serialized).not.toContain("Controlled speculation");
    expect(submission.encryptedValues.p3OverrideReason?.algorithm).toBe("AES-GCM");
    expect(submission.decisionLog?.action).toBe("p3_override");
    expect(submission.decisionLog?.encryptedDetails.p3OverrideReason?.algorithm).toBe("AES-GCM");
  });

  it("encrypts manual P1 sell/reduce decision reasons before submission", async () => {
    const submission = await prepareEncryptedDecisionSubmission(
      {
        householdId: "household_1",
        holdingId: "holding_1",
        actorIdentityUserId: "user_1",
        action: "sell",
        scope: "holding",
        reasonRequired: true,
        reason: "Need liquidity for house payment",
        metadata: {
          portfolioBucket: "P1",
          assetLabel: "Gold bars",
        },
      },
      await testKey(),
    );

    const serialized = JSON.stringify(submission);
    expect(serialized).not.toContain("Need liquidity");
    expect(submission.encryptedDetails.reason.algorithm).toBe("AES-GCM");
    expect(submission.action).toBe("sell");
  });
});
