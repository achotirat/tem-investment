"use client";

import { FormEvent, useState } from "react";
import { ClipboardList, Lock } from "lucide-react";

import type { DecisionLogInput } from "../../shared/discipline";
import type { HoldingSummary } from "../../shared/holdings";
import {
  prepareEncryptedDecisionSubmission,
  type PlaintextDecisionLogInput,
} from "./encrypted-decision-submission";

type LogHoldingDecisionPanelProps = {
  householdId: string;
  actorIdentityUserId: string;
  holdings: HoldingSummary[];
  sessionKey: CryptoKey | null;
  onCreateDecision: (input: DecisionLogInput) => Promise<void> | void;
  encryptDecision?: (input: PlaintextDecisionLogInput, key: CryptoKey) => Promise<DecisionLogInput>;
};

export function LogHoldingDecisionPanel({
  householdId,
  actorIdentityUserId,
  holdings,
  sessionKey,
  onCreateDecision,
  encryptDecision = prepareEncryptedDecisionSubmission,
}: LogHoldingDecisionPanelProps) {
  const [holdingId, setHoldingId] = useState(holdings[0]?.id ?? "");
  const [action, setAction] = useState<"sell" | "reduce">("sell");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedHolding = holdings.find((holding) => holding.id === holdingId) ?? holdings[0];
  const locked = sessionKey === null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionKey || !selectedHolding) return;
    if (selectedHolding.portfolioBucket === "P1" && !reason.trim()) {
      setError("P1 sell/reduce decisions require a reason.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const encrypted = await encryptDecision(
        {
          householdId,
          holdingId: selectedHolding.id,
          actorIdentityUserId,
          action,
          scope: "holding",
          reasonRequired: selectedHolding.portfolioBucket === "P1",
          reason,
          metadata: {
            portfolioBucket: selectedHolding.portfolioBucket,
            assetLabel: selectedHolding.assetLabel,
          },
        },
        sessionKey,
      );
      await onCreateDecision(encrypted);
      setReason("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to log decision.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel span-5">
      <div className="panel-header">
        <div className="panel-title">
          <ClipboardList aria-hidden="true" size={18} />
          Log decision
        </div>
        <span className={`pill ${locked ? "" : "secure"}`}>
          {locked ? <Lock aria-hidden="true" size={15} /> : null}
          {locked ? "Locked" : "Unlocked"}
        </span>
      </div>

      <form className="panel-body holding-form" onSubmit={handleSubmit}>
        {locked ? (
          <div className="error-strip">Unlock sensitive data before logging decisions</div>
        ) : null}

        <div className="holding-form-grid">
          <label className="field">
            Holding
            <select onChange={(event) => setHoldingId(event.target.value)} value={holdingId}>
              {holdings.map((holding) => (
                <option key={holding.id} value={holding.id}>
                  {holding.assetLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Action
            <select
              onChange={(event) => setAction(event.target.value as "sell" | "reduce")}
              value={action}
            >
              <option value="sell">Sell</option>
              <option value="reduce">Reduce</option>
            </select>
          </label>
          <label className="field field-wide">
            Reason
            <input onChange={(event) => setReason(event.target.value)} value={reason} />
          </label>
        </div>

        {error ? <div className="error-strip">{error}</div> : null}

        <button className="primary-button" disabled={locked || saving || holdings.length === 0} type="submit">
          <ClipboardList aria-hidden="true" size={16} />
          {saving ? "Logging" : "Log decision"}
        </button>
      </form>
    </section>
  );
}
