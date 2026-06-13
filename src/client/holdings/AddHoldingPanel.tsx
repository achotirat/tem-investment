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
import { prepareEncryptedHoldingSubmission } from "./encrypted-holding-submission";

type AddHoldingPanelProps = {
  householdId: string;
  ownerEntities: OwnerEntity[];
  sessionKey: CryptoKey | null;
  onCreateHolding: (input: AddHoldingInput) => Promise<void> | void;
  encryptSubmission?: (input: PlaintextHoldingInput, key: CryptoKey) => Promise<AddHoldingInput>;
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
};

export function AddHoldingPanel({
  householdId,
  ownerEntities,
  sessionKey,
  onCreateHolding,
  encryptSubmission = prepareEncryptedHoldingSubmission,
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
