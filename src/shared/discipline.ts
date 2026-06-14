import type { EncryptedField } from "./encryption";

export type DecisionAction =
  | "buy"
  | "sell"
  | "reduce"
  | "open_p2"
  | "edit_p2_plan"
  | "close_p2"
  | "p3_override";

export type DecisionScope = "holding" | "portfolio";

export type P2TradePlan = {
  entryReason: string;
  setup: string;
  stopLoss: string;
  takeProfitPlan: string;
  invalidationCondition: string;
  positionSizing: string;
  expectedHoldingPeriod: string;
};

export type P3GuardrailAcknowledgement = {
  overrideReason?: string;
  acknowledgedLossLimitBreach?: boolean;
};

export type P3GuardrailContext = {
  portfolioTotalValueThb: number;
  p3CurrentValueThb: number;
  candidateValueThb: number;
  p3TargetAllocationPercent: number;
  maxLossPerTradeThb: number;
  maxLossPerMonthThb: number;
  currentMonthLossThb: number;
  overrideReason?: string;
  acknowledgedLossLimitBreach?: boolean;
};

export type EncryptedDecisionDetails = {
  reason: EncryptedField;
  tradePlan?: EncryptedField;
  p3OverrideReason?: EncryptedField;
};

export type DecisionMetadata = Record<string, string | number | boolean | null>;

export type DecisionLogInput = {
  householdId: string;
  holdingId?: string;
  actorIdentityUserId: string;
  action: DecisionAction;
  scope: DecisionScope;
  reasonRequired: boolean;
  encryptedDetails: EncryptedDecisionDetails;
  metadata: DecisionMetadata;
};

export type CreateHoldingDecisionLogInput = Omit<
  DecisionLogInput,
  "householdId" | "holdingId" | "actorIdentityUserId"
>;

export type DecisionLogSummary = Omit<DecisionLogInput, "encryptedDetails"> & {
  id: string;
  createdAt: string;
};
