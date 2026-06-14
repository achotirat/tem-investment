import { describe, expect, it } from "vitest";

import {
  createDecisionLog,
  type DecisionLogRepository,
} from "../src/server/discipline-service";
import {
  createHoldingWithManualValuation,
  type HoldingRepository,
} from "../src/server/holdings-service";
import type { DecisionLogInput, DecisionLogSummary } from "../src/shared/discipline";
import type { AddHoldingInput, HoldingSummary } from "../src/shared/holdings";

const encryptedField = {
  version: 1 as const,
  algorithm: "AES-GCM" as const,
  iv: "iv",
  ciphertext: "ciphertext",
};

const holdingInput: AddHoldingInput = {
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
  encryptedValues: {
    quantity: encryptedField,
    costBasis: encryptedField,
    currentValue: encryptedField,
    tradePlan: encryptedField,
  },
  decisionLog: {
    action: "open_p2",
    scope: "holding",
    reasonRequired: true,
    encryptedDetails: {
      reason: encryptedField,
      tradePlan: encryptedField,
    },
    metadata: {
      portfolioBucket: "P2",
      assetLabel: "SET system trade",
    },
  },
};

const decisionInput: DecisionLogInput = {
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

class InMemoryHoldingRepository implements HoldingRepository {
  saved: Array<{ input: AddHoldingInput; actorIdentityUserId?: string }> = [];

  async createWithManualValuation(
    input: AddHoldingInput,
    actorIdentityUserId?: string,
  ): Promise<HoldingSummary> {
    this.saved.push({ input, actorIdentityUserId });
    return {
      id: "holding_1",
      householdId: input.householdId,
      portfolioBucket: input.portfolioBucket,
      assetClass: input.assetClass,
      assetLabel: input.assetLabel,
      accountLabel: input.accountLabel,
      currency: input.currency,
      liquidityCategory: input.liquidityCategory,
      valuationSource: input.valuationSource,
      valuationDate: input.valuationDate,
      status: input.status,
      ownershipSplits: input.ownershipSplits,
      encryptedValues: input.encryptedValues,
      autoPriceKey: null,
      latestMarketPriceThb: null,
      latestMarketPriceAsOf: null,
    };
  }
}

class InMemoryDecisionRepository implements DecisionLogRepository {
  saved: DecisionLogInput[] = [];

  async create(input: DecisionLogInput): Promise<DecisionLogSummary> {
    this.saved.push(input);
    return {
      ...input,
      id: "decision_1",
      createdAt: "2026-06-14T00:00:00.000Z",
    };
  }
}

describe("createHoldingWithManualValuation discipline integration", () => {
  it("passes actor and encrypted open-position decision details to the repository", async () => {
    const repository = new InMemoryHoldingRepository();

    await createHoldingWithManualValuation(repository, holdingInput, "user_1");

    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]).toMatchObject({
      actorIdentityUserId: "user_1",
      input: {
        portfolioBucket: "P2",
        encryptedValues: {
          tradePlan: encryptedField,
        },
        decisionLog: {
          action: "open_p2",
          encryptedDetails: {
            tradePlan: encryptedField,
          },
        },
      },
    });
  });

  it("rejects active P2 holdings without an encrypted trade plan", async () => {
    const repository = new InMemoryHoldingRepository();

    await expect(
      createHoldingWithManualValuation(repository, {
        ...holdingInput,
        encryptedValues: {
          quantity: encryptedField,
          costBasis: encryptedField,
          currentValue: encryptedField,
        },
      }),
    ).rejects.toThrow("P2 active positions require an encrypted trade plan before saving.");
    expect(repository.saved).toHaveLength(0);
  });
});

describe("createDecisionLog", () => {
  it("persists a valid encrypted decision log", async () => {
    const repository = new InMemoryDecisionRepository();

    const result = await createDecisionLog(repository, decisionInput);

    expect(result).toMatchObject({
      id: "decision_1",
      action: "sell",
      scope: "holding",
    });
    expect(repository.saved).toHaveLength(1);
  });

  it("rejects invalid P1 sell/reduce logs before persistence", async () => {
    const repository = new InMemoryDecisionRepository();

    await expect(
      createDecisionLog(repository, {
        ...decisionInput,
        encryptedDetails: {
          reason: {
            ...encryptedField,
            ciphertext: "",
          },
        },
      }),
    ).rejects.toThrow("P1 sell/reduce decisions require an encrypted reason.");
    expect(repository.saved).toHaveLength(0);
  });
});
