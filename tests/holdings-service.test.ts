import { describe, expect, it } from "vitest";

import {
  createHoldingWithManualValuation,
  validateOwnershipSplits,
  type HoldingRepository,
} from "../src/server/holdings-service";
import type { AddHoldingInput } from "../src/shared/holdings";

const encryptedField = {
  version: 1 as const,
  algorithm: "AES-GCM" as const,
  iv: "iv",
  ciphertext: "ciphertext",
};

const validInput: AddHoldingInput = {
  householdId: "household_1",
  portfolioBucket: "P1",
  assetClass: "gold",
  assetLabel: "Gold bars",
  accountLabel: "Vault",
  currency: "THB",
  liquidityCategory: "semi_liquid",
  valuationSource: "manual",
  valuationDate: "2026-06-13",
  status: "active",
  ownershipSplits: [
    { ownerEntityId: "owner_1", percentage: 70 },
    { ownerEntityId: "owner_2", percentage: 30 },
  ],
  encryptedValues: {
    quantity: encryptedField,
    costBasis: encryptedField,
    currentValue: encryptedField,
  },
};

class InMemoryHoldingRepository implements HoldingRepository {
  saved: AddHoldingInput[] = [];

  async createWithManualValuation(input: AddHoldingInput) {
    this.saved.push(input);
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
    };
  }
}

describe("validateOwnershipSplits", () => {
  it("accepts ownership splits that total 100 percent", () => {
    expect(validateOwnershipSplits(validInput.ownershipSplits)).toEqual({ ok: true });
  });

  it("rejects ownership splits that do not total 100 percent", () => {
    expect(
      validateOwnershipSplits([
        { ownerEntityId: "owner_1", percentage: 80 },
        { ownerEntityId: "owner_2", percentage: 10 },
      ]),
    ).toEqual({
      ok: false,
      message: "Ownership splits must total 100%. Current total is 90%.",
    });
  });

  it("rejects non-numeric ownership percentages", () => {
    expect(validateOwnershipSplits([{ ownerEntityId: "owner_1", percentage: Number.NaN }])).toEqual({
      ok: false,
      message: "Ownership split percentages must be finite numbers.",
    });
  });
});

describe("createHoldingWithManualValuation", () => {
  it("persists a holding with manual valuation and ownership splits", async () => {
    const repo = new InMemoryHoldingRepository();

    const result = await createHoldingWithManualValuation(repo, validInput);

    expect(result).toMatchObject({
      id: "holding_1",
      assetLabel: "Gold bars",
      valuationDate: "2026-06-13",
      valuationSource: "manual",
    });
    expect(repo.saved).toHaveLength(1);
  });

  it("does not persist a holding when ownership does not total 100 percent", async () => {
    const repo = new InMemoryHoldingRepository();

    await expect(
      createHoldingWithManualValuation(repo, {
        ...validInput,
        ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 99 }],
      }),
    ).rejects.toThrow("Ownership splits must total 100%");
    expect(repo.saved).toHaveLength(0);
  });
});
