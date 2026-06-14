"use client";

import { FormEvent, useMemo, useState } from "react";
import { Plus, ShieldCheck, WalletCards } from "lucide-react";

import type { OwnerEntity } from "../../server/household-service";
import type {
  AddHoldingInput,
  AssetClass,
  HoldingStatus,
  LiquidityCategory,
  PlaintextHoldingInput,
  PortfolioBucket,
  ValuationSource,
} from "../../shared/holdings";
import type { P2TradePlan, P3GuardrailContext } from "../../shared/discipline";
import { prepareEncryptedHoldingSubmission } from "./encrypted-holding-submission";

type AddHoldingPanelProps = {
  householdId: string;
  ownerEntities: OwnerEntity[];
  sessionKey: CryptoKey | null;
  onCreateHolding: (input: AddHoldingInput) => Promise<void> | void;
  encryptSubmission?: (input: PlaintextHoldingInput, key: CryptoKey) => Promise<AddHoldingInput>;
  p3GuardrailContext?: Omit<P3GuardrailContext, "candidateValueThb" | "overrideReason" | "acknowledgedLossLimitBreach">;
};

type FormState = {
  portfolioBucket: PortfolioBucket;
  assetClass: AssetClass;
  assetLabel: string;
  accountLabel: string;
  currency: string;
  quantity: string;
  costBasis: string;
  currentValue: string;
  liquidityCategory: LiquidityCategory;
  valuationSource: ValuationSource;
  valuationDate: string;
  status: HoldingStatus;
  notes: string;
  decisionReason: string;
  p2EntryReason: string;
  p2Setup: string;
  p2StopLoss: string;
  p2TakeProfitPlan: string;
  p2InvalidationCondition: string;
  p2PositionSizing: string;
  p2ExpectedHoldingPeriod: string;
  p3OverrideReason: string;
  p3AcknowledgedLossLimitBreach: boolean;
};

const defaultState: FormState = {
  portfolioBucket: "P1",
  assetClass: "gold",
  assetLabel: "",
  accountLabel: "",
  currency: "THB",
  quantity: "",
  costBasis: "",
  currentValue: "",
  liquidityCategory: "semi_liquid",
  valuationSource: "manual",
  valuationDate: new Date().toISOString().slice(0, 10),
  status: "active",
  notes: "",
  decisionReason: "",
  p2EntryReason: "",
  p2Setup: "",
  p2StopLoss: "",
  p2TakeProfitPlan: "",
  p2InvalidationCondition: "",
  p2PositionSizing: "",
  p2ExpectedHoldingPeriod: "",
  p3OverrideReason: "",
  p3AcknowledgedLossLimitBreach: false,
};

export function AddHoldingPanel({
  householdId,
  ownerEntities,
  sessionKey,
  onCreateHolding,
  encryptSubmission = prepareEncryptedHoldingSubmission,
  p3GuardrailContext,
}: AddHoldingPanelProps) {
  const defaultOwnerId = ownerEntities[0]?.id ?? "";
  const [form, setForm] = useState<FormState>(defaultState);
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [ownerPercentage, setOwnerPercentage] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const locked = sessionKey === null;
  const ownershipSplits = useMemo(
    () =>
      ownerId
        ? [
            {
              ownerEntityId: ownerId,
              percentage: Number(ownerPercentage),
            },
          ]
        : [],
    [ownerId, ownerPercentage],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionKey) return;

    const disciplineError = validateDisciplineForm(form, p3GuardrailContext);
    if (disciplineError) {
      setError(disciplineError);
      return;
    }

    const ownershipTotal = ownershipSplits.reduce((sum, split) => sum + split.percentage, 0);
    if (Math.abs(ownershipTotal - 100) > 0.0001) {
      setError(`Ownership splits must total 100%. Current total is ${ownershipTotal}%.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const encrypted = await encryptSubmission(
        {
          ...form,
          householdId,
          ownershipSplits,
          ...(form.portfolioBucket === "P2" ? { tradePlan: tradePlanFromForm(form) } : {}),
          ...(form.portfolioBucket === "P3"
            ? {
                p3Acknowledgement: {
                  overrideReason: form.p3OverrideReason,
                  acknowledgedLossLimitBreach: form.p3AcknowledgedLossLimitBreach,
                },
              }
            : {}),
        },
        sessionKey,
      );
      await onCreateHolding(encrypted);
      setForm({ ...defaultState, valuationDate: form.valuationDate });
      setOwnerId(defaultOwnerId);
      setOwnerPercentage("100");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to save holding.");
    } finally {
      setSaving(false);
    }
  }

  function updateForm<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="panel span-5">
      <div className="panel-header">
        <div className="panel-title">
          <WalletCards aria-hidden="true" size={18} />
          Add holding
        </div>
        <span className={`pill ${locked ? "" : "secure"}`}>
          {locked ? "Locked" : <ShieldCheck aria-hidden="true" size={15} />}
          {locked ? "Locked" : "Unlocked"}
        </span>
      </div>

      <form className="panel-body holding-form" onSubmit={handleSubmit}>
        {locked ? (
          <div className="error-strip">Unlock sensitive data before adding holdings</div>
        ) : null}

        <div className="holding-form-grid">
          <label className="field">
            Portfolio
            <select
              onChange={(event) => updateForm("portfolioBucket", event.target.value as PortfolioBucket)}
              value={form.portfolioBucket}
            >
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </select>
          </label>

          <label className="field">
            Asset class
            <select
              onChange={(event) => updateForm("assetClass", event.target.value as AssetClass)}
              value={form.assetClass}
            >
              <option value="gold">Gold</option>
              <option value="crypto">Crypto</option>
              <option value="real_estate">Real estate</option>
              <option value="stock">Stock</option>
              <option value="derivative">Derivative</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="field">
            Asset label
            <input
              onChange={(event) => updateForm("assetLabel", event.target.value)}
              required
              value={form.assetLabel}
            />
          </label>

          <label className="field">
            Account / platform
            <input
              onChange={(event) => updateForm("accountLabel", event.target.value)}
              required
              value={form.accountLabel}
            />
          </label>

          <label className="field">
            Quantity
            <input
              inputMode="decimal"
              onChange={(event) => updateForm("quantity", event.target.value)}
              required
              value={form.quantity}
            />
          </label>

          <label className="field">
            Cost basis
            <input
              inputMode="decimal"
              onChange={(event) => updateForm("costBasis", event.target.value)}
              required
              value={form.costBasis}
            />
          </label>

          <label className="field">
            Current value
            <input
              inputMode="decimal"
              onChange={(event) => updateForm("currentValue", event.target.value)}
              required
              value={form.currentValue}
            />
          </label>

          <label className="field">
            Currency
            <input
              maxLength={3}
              onChange={(event) => updateForm("currency", event.target.value)}
              required
              value={form.currency}
            />
          </label>

          <label className="field">
            Valuation date
            <input
              onChange={(event) => updateForm("valuationDate", event.target.value)}
              required
              type="date"
              value={form.valuationDate}
            />
          </label>

          <label className="field">
            Liquidity
            <select
              onChange={(event) =>
                updateForm("liquidityCategory", event.target.value as LiquidityCategory)
              }
              value={form.liquidityCategory}
            >
              <option value="liquid">Liquid</option>
              <option value="semi_liquid">Semi-liquid</option>
              <option value="illiquid">Illiquid</option>
            </select>
          </label>

          <label className="field">
            Owner
            <select onChange={(event) => setOwnerId(event.target.value)} value={ownerId}>
              {ownerEntities.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.displayName}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Ownership %
            <input
              inputMode="decimal"
              onChange={(event) => setOwnerPercentage(event.target.value)}
              required
              value={ownerPercentage}
            />
          </label>

          <label className="field field-wide">
            Notes
            <input onChange={(event) => updateForm("notes", event.target.value)} value={form.notes} />
          </label>

          {form.portfolioBucket === "P2" ? (
            <div className="discipline-subpanel field-wide">
              <div className="metric-label">P2 trade plan</div>
              <div className="holding-form-grid">
                <label className="field">
                  Entry reason
                  <input
                    onChange={(event) => updateForm("p2EntryReason", event.target.value)}
                    value={form.p2EntryReason}
                  />
                </label>
                <label className="field">
                  System / setup
                  <input
                    onChange={(event) => updateForm("p2Setup", event.target.value)}
                    value={form.p2Setup}
                  />
                </label>
                <label className="field">
                  Stop loss
                  <input
                    onChange={(event) => updateForm("p2StopLoss", event.target.value)}
                    value={form.p2StopLoss}
                  />
                </label>
                <label className="field">
                  Take profit plan
                  <input
                    onChange={(event) => updateForm("p2TakeProfitPlan", event.target.value)}
                    value={form.p2TakeProfitPlan}
                  />
                </label>
                <label className="field">
                  Invalidation condition
                  <input
                    onChange={(event) => updateForm("p2InvalidationCondition", event.target.value)}
                    value={form.p2InvalidationCondition}
                  />
                </label>
                <label className="field">
                  Position sizing
                  <input
                    onChange={(event) => updateForm("p2PositionSizing", event.target.value)}
                    value={form.p2PositionSizing}
                  />
                </label>
                <label className="field field-wide">
                  Expected holding period
                  <input
                    onChange={(event) => updateForm("p2ExpectedHoldingPeriod", event.target.value)}
                    value={form.p2ExpectedHoldingPeriod}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {form.portfolioBucket === "P3" ? (
            <div className="discipline-subpanel field-wide">
              <div className="metric-label">P3 guardrail</div>
              <label className="field">
                P3 override reason
                <input
                  onChange={(event) => updateForm("p3OverrideReason", event.target.value)}
                  value={form.p3OverrideReason}
                />
              </label>
              <label className="checkbox-line">
                <input
                  checked={form.p3AcknowledgedLossLimitBreach}
                  onChange={(event) =>
                    updateForm("p3AcknowledgedLossLimitBreach", event.target.checked)
                  }
                  type="checkbox"
                />
                I acknowledge the P3 loss-limit warning
              </label>
            </div>
          ) : null}

          {(form.portfolioBucket === "P2" || form.portfolioBucket === "P3") ? (
            <label className="field field-wide">
              Decision reason
              <input
                onChange={(event) => updateForm("decisionReason", event.target.value)}
                value={form.decisionReason}
              />
            </label>
          ) : null}
        </div>

        {error ? <div className="error-strip">{error}</div> : null}

        <button className="primary-button" disabled={locked || saving} type="submit">
          <Plus aria-hidden="true" size={16} />
          {saving ? "Saving" : "Save holding"}
        </button>
      </form>
    </section>
  );
}

function validateDisciplineForm(
  form: FormState,
  p3GuardrailContext: AddHoldingPanelProps["p3GuardrailContext"],
): string | null {
  if (form.portfolioBucket === "P2" && !isCompleteTradePlan(tradePlanFromForm(form))) {
    return "P2 active positions require a complete trade plan before saving.";
  }

  if (form.portfolioBucket === "P3" && p3GuardrailContext) {
    const candidateValueThb = Number(form.currentValue);
    const targetValue =
      p3GuardrailContext.portfolioTotalValueThb *
      (p3GuardrailContext.p3TargetAllocationPercent / 100);
    const projectedP3Value = p3GuardrailContext.p3CurrentValueThb + candidateValueThb;

    if (Number.isFinite(candidateValueThb) && projectedP3Value > targetValue) {
      if (!form.p3OverrideReason.trim()) {
        return `P3 allocation would exceed the ${formatPercent(
          p3GuardrailContext.p3TargetAllocationPercent,
        )}% target. Add an override reason to save.`;
      }
    }

    if (
      p3GuardrailContext.maxLossPerMonthThb > 0 &&
      p3GuardrailContext.currentMonthLossThb > p3GuardrailContext.maxLossPerMonthThb &&
      !form.p3AcknowledgedLossLimitBreach
    ) {
      return "P3 monthly loss limit is already breached. Acknowledge the breach to save.";
    }
  }

  return null;
}

function tradePlanFromForm(form: FormState): P2TradePlan {
  return {
    entryReason: form.p2EntryReason,
    setup: form.p2Setup,
    stopLoss: form.p2StopLoss,
    takeProfitPlan: form.p2TakeProfitPlan,
    invalidationCondition: form.p2InvalidationCondition,
    positionSizing: form.p2PositionSizing,
    expectedHoldingPeriod: form.p2ExpectedHoldingPeriod,
  };
}

function isCompleteTradePlan(tradePlan: P2TradePlan): boolean {
  return Object.values(tradePlan).every((value) => value.trim().length > 0);
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
