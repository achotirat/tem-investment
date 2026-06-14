"use client";

import { encryptSensitiveField } from "../crypto/portfolio-crypto";
import type { CreateHoldingDecisionLogInput } from "../../shared/discipline";
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

  const tradePlan = input.tradePlan;
  const encryptedTradePlan = tradePlan
    ? await encryptSensitiveField(JSON.stringify(tradePlan), key)
    : undefined;
  if (encryptedTradePlan) {
    encryptedValues.tradePlan = encryptedTradePlan;
  }

  const p3OverrideReason = input.p3Acknowledgement?.overrideReason?.trim();
  const encryptedP3OverrideReason = p3OverrideReason
    ? await encryptSensitiveField(p3OverrideReason, key)
    : undefined;
  if (encryptedP3OverrideReason) {
    encryptedValues.p3OverrideReason = encryptedP3OverrideReason;
  }

  const decisionLog = await createDecisionLogPayload({
    input,
    key,
    encryptedTradePlan,
    encryptedP3OverrideReason,
  });

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
    decisionLog,
  };
}

async function createDecisionLogPayload({
  input,
  key,
  encryptedTradePlan,
  encryptedP3OverrideReason,
}: {
  input: PlaintextHoldingInput;
  key: CryptoKey;
  encryptedTradePlan?: AddHoldingInput["encryptedValues"]["tradePlan"];
  encryptedP3OverrideReason?: AddHoldingInput["encryptedValues"]["p3OverrideReason"];
}): Promise<CreateHoldingDecisionLogInput | undefined> {
  const decisionReason = input.decisionReason?.trim();
  const needsDecisionLog =
    input.portfolioBucket === "P2" ||
    input.portfolioBucket === "P3" ||
    Boolean(decisionReason);

  if (!needsDecisionLog) return undefined;

  const action =
    input.portfolioBucket === "P2"
      ? "open_p2"
      : encryptedP3OverrideReason
        ? "p3_override"
        : "buy";

  const reason =
    decisionReason ||
    (input.portfolioBucket === "P2"
      ? "Opened P2 position with strict trade plan."
      : "Recorded household holding.");

  return {
    action,
    scope: "holding",
    reasonRequired: action !== "buy",
    encryptedDetails: {
      reason: await encryptSensitiveField(reason, key),
      ...(encryptedTradePlan ? { tradePlan: encryptedTradePlan } : {}),
      ...(encryptedP3OverrideReason ? { p3OverrideReason: encryptedP3OverrideReason } : {}),
    },
    metadata: {
      portfolioBucket: input.portfolioBucket,
      assetLabel: input.assetLabel.trim(),
      valuationDate: input.valuationDate,
      acknowledgedLossLimitBreach:
        input.p3Acknowledgement?.acknowledgedLossLimitBreach ?? null,
    },
  };
}
