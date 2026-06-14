"use client";

import { encryptSensitiveField } from "../crypto/portfolio-crypto";
import type { AddHoldingInput, PlaintextHoldingInput } from "../../shared/holdings";

export async function prepareEncryptedHoldingSubmission(
  input: PlaintextHoldingInput,
  key: CryptoKey,
): Promise<AddHoldingInput> {
  const encryptedValues: AddHoldingInput["encryptedValues"] = {
    quantity: await encryptSensitiveField(input.quantity.trim(), key),
    costBasis: await encryptSensitiveField(input.costBasis.trim(), key),
    currentValue: await encryptSensitiveField(input.currentValue.trim(), key),
  };

  const notes = input.notes?.trim();
  if (notes) {
    encryptedValues.notes = await encryptSensitiveField(notes, key);
  }

  return {
    householdId: input.householdId,
    portfolioBucket: input.portfolioBucket,
    assetClass: input.assetClass,
    assetLabel: input.assetLabel.trim(),
    accountLabel: input.accountLabel.trim(),
    currency: input.currency.trim().toUpperCase(),
    liquidityCategory: input.liquidityCategory,
    valuationSource: input.valuationSource,
    valuationDate: input.valuationDate,
    status: input.status,
    ownershipSplits: input.ownershipSplits,
    encryptedValues,
  };
}
