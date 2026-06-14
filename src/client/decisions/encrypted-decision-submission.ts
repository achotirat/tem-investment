"use client";

import { encryptSensitiveField } from "../crypto/portfolio-crypto";
import type { DecisionLogInput } from "../../shared/discipline";

export type PlaintextDecisionLogInput = Omit<DecisionLogInput, "encryptedDetails"> & {
  reason: string;
};

export async function prepareEncryptedDecisionSubmission(
  input: PlaintextDecisionLogInput,
  key: CryptoKey,
): Promise<DecisionLogInput> {
  return {
    householdId: input.householdId,
    holdingId: input.holdingId,
    actorIdentityUserId: input.actorIdentityUserId,
    action: input.action,
    scope: input.scope,
    reasonRequired: input.reasonRequired,
    metadata: input.metadata,
    encryptedDetails: {
      reason: await encryptSensitiveField(input.reason.trim(), key),
    },
  };
}
