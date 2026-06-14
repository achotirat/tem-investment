import type { HoldingStatus, PortfolioBucket } from "../shared/holdings";
import type {
  DecisionLogSummary,
  DecisionLogInput,
  P2TradePlan,
  P3GuardrailContext,
} from "../shared/discipline";

export type DisciplineValidation =
  | {
      ok: true;
      warnings?: string[];
    }
  | {
      ok: false;
      message: string;
      warnings?: string[];
    };

export type DecisionLogRepository = {
  create(input: DecisionLogInput): Promise<DecisionLogSummary>;
};

type P2TradePlanValidationInput = {
  portfolioBucket: PortfolioBucket;
  status: HoldingStatus;
  tradePlan?: Partial<P2TradePlan>;
};

const P2_TRADE_PLAN_FIELDS: Array<keyof P2TradePlan> = [
  "entryReason",
  "setup",
  "stopLoss",
  "takeProfitPlan",
  "invalidationCondition",
  "positionSizing",
  "expectedHoldingPeriod",
];

export function validateP2TradePlan(input: P2TradePlanValidationInput): DisciplineValidation {
  if (input.portfolioBucket !== "P2" || input.status !== "active") {
    return { ok: true };
  }

  const complete = P2_TRADE_PLAN_FIELDS.every((field) => {
    const value = input.tradePlan?.[field];
    return typeof value === "string" && value.trim().length > 0;
  });

  if (!complete) {
    return {
      ok: false,
      message: "P2 active positions require a complete trade plan before saving.",
    };
  }

  return { ok: true };
}

export function evaluateP3Guardrails(context: P3GuardrailContext): DisciplineValidation {
  const warnings: string[] = [];
  const targetValue =
    context.portfolioTotalValueThb * (context.p3TargetAllocationPercent / 100);
  const projectedP3Value = context.p3CurrentValueThb + context.candidateValueThb;

  if (projectedP3Value > targetValue) {
    warnings.push(`P3 allocation would exceed the ${formatPercent(context.p3TargetAllocationPercent)}% target.`);
  }

  if (
    context.maxLossPerMonthThb > 0 &&
    context.currentMonthLossThb > context.maxLossPerMonthThb
  ) {
    warnings.push("P3 monthly loss limit is already breached.");
  }

  if (warnings.some((warning) => warning.includes("allocation")) && !context.overrideReason?.trim()) {
    return {
      ok: false,
      message: `P3 allocation would exceed the ${formatPercent(
        context.p3TargetAllocationPercent,
      )}% target. Add an override reason to save.`,
      warnings,
    };
  }

  if (
    warnings.some((warning) => warning.includes("monthly loss")) &&
    !context.acknowledgedLossLimitBreach
  ) {
    return {
      ok: false,
      message: "P3 monthly loss limit is already breached. Acknowledge the breach to save.",
      warnings,
    };
  }

  return warnings.length > 0 ? { ok: true, warnings } : { ok: true };
}

export function validateDecisionLogInput(input: DecisionLogInput): DisciplineValidation {
  const isP1SellOrReduce =
    input.metadata.portfolioBucket === "P1" &&
    (input.action === "sell" || input.action === "reduce");

  if (isP1SellOrReduce && !input.encryptedDetails.reason.ciphertext.trim()) {
    return {
      ok: false,
      message: "P1 sell/reduce decisions require an encrypted reason.",
    };
  }

  if (input.reasonRequired && !input.encryptedDetails.reason.ciphertext.trim()) {
    return {
      ok: false,
      message: "Decision logs that require a reason must include encrypted reason details.",
    };
  }

  return { ok: true };
}

export async function createDecisionLog(
  repository: DecisionLogRepository,
  input: DecisionLogInput,
): Promise<DecisionLogSummary> {
  const validation = validateDecisionLogInput(input);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  return repository.create(input);
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
