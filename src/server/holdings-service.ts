import type { AddHoldingInput, HoldingSummary, OwnershipSplitInput } from "../shared/holdings";
import type { EncryptedField } from "../shared/encryption";
import { validateDecisionLogInput } from "./discipline-service";

export type HoldingRepository = {
  createWithManualValuation(
    input: AddHoldingInput,
    actorIdentityUserId?: string,
  ): Promise<HoldingSummary>;
};

export type OwnershipValidation =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

export function validateOwnershipSplits(splits: OwnershipSplitInput[]): OwnershipValidation {
  const nonNumericSplit = splits.find((split) => !Number.isFinite(split.percentage));
  if (nonNumericSplit) {
    return {
      ok: false,
      message: "Ownership split percentages must be finite numbers.",
    };
  }

  const total = splits.reduce((sum, split) => sum + split.percentage, 0);

  if (splits.length === 0 || Math.abs(total - 100) > 0.0001) {
    return {
      ok: false,
      message: `Ownership splits must total 100%. Current total is ${formatPercentage(total)}%.`,
    };
  }

  const invalidSplit = splits.find((split) => split.percentage <= 0 || split.percentage > 100);
  if (invalidSplit) {
    return {
      ok: false,
      message: "Ownership split percentages must be greater than 0 and no more than 100.",
    };
  }

  return { ok: true };
}

export async function createHoldingWithManualValuation(
  repository: HoldingRepository,
  input: AddHoldingInput,
  actorIdentityUserId?: string,
): Promise<HoldingSummary> {
  const ownershipValidation = validateOwnershipSplits(input.ownershipSplits);
  if (!ownershipValidation.ok) {
    throw new Error(ownershipValidation.message);
  }

  if (input.valuationSource !== "manual") {
    throw new Error("Phase 3 holdings must use manual valuation.");
  }

  const disciplineValidation = validateHoldingDiscipline(input, actorIdentityUserId);
  if (!disciplineValidation.ok) {
    throw new Error(disciplineValidation.message);
  }

  return repository.createWithManualValuation(input, actorIdentityUserId);
}

function validateHoldingDiscipline(
  input: AddHoldingInput,
  actorIdentityUserId?: string,
): OwnershipValidation {
  if (
    input.portfolioBucket === "P2" &&
    input.status === "active" &&
    !hasEncryptedField(input.encryptedValues.tradePlan)
  ) {
    return {
      ok: false,
      message: "P2 active positions require an encrypted trade plan before saving.",
    };
  }

  if (input.decisionLog && actorIdentityUserId) {
    const decisionValidation = validateDecisionLogInput({
      ...input.decisionLog,
      householdId: input.householdId,
      actorIdentityUserId,
      metadata: {
        ...input.decisionLog.metadata,
        portfolioBucket: input.portfolioBucket,
      },
    });

    if (!decisionValidation.ok) return decisionValidation;
  }

  return { ok: true };
}

function hasEncryptedField(payload: EncryptedField | undefined): boolean {
  return Boolean(payload?.ciphertext.trim() && payload.iv.trim());
}

function formatPercentage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
