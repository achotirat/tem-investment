import { describe, expect, it } from "vitest";

import { deriveMasterKey } from "../src/client/crypto/portfolio-crypto";
import { prepareEncryptedHoldingSubmission } from "../src/client/holdings/encrypted-holding-submission";

describe("prepareEncryptedHoldingSubmission", () => {
  it("encrypts position size, basis, current value, and notes before submission", async () => {
    const { key } = await deriveMasterKey({
      masterPassword: "household-secret",
      salt: new Uint8Array(16).fill(5),
      argon2id: async () => new Uint8Array(32).fill(6),
    });

    const submission = await prepareEncryptedHoldingSubmission(
      {
        householdId: "household_1",
        portfolioBucket: "P1",
        assetClass: "crypto",
        assetLabel: "BTC",
        accountLabel: "Hardware wallet",
        currency: "USD",
        liquidityCategory: "liquid",
        valuationSource: "manual",
        valuationDate: "2026-06-13",
        status: "active",
        ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 100 }],
        quantity: "0.25",
        costBasis: "500000",
        currentValue: "750000",
        notes: "cold storage",
      },
      key,
    );

    const serialized = JSON.stringify(submission);
    expect(serialized).not.toContain("0.25");
    expect(serialized).not.toContain("500000");
    expect(serialized).not.toContain("750000");
    expect(serialized).not.toContain("cold storage");
    expect(submission.encryptedValues.currentValue.algorithm).toBe("AES-GCM");
    expect(submission.assetLabel).toBe("BTC");
  });
});
