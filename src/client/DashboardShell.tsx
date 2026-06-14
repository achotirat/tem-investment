"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Scale,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

import type { HouseholdBootstrap } from "../server/household-service";
import type { DecisionLogInput, DecisionLogSummary } from "../shared/discipline";
import type { AddHoldingInput, HoldingSummary } from "../shared/holdings";
import { SecurityPanel } from "./SecurityPanel";
import { DecisionLogPanel } from "./decisions/DecisionLogPanel";
import { LogHoldingDecisionPanel } from "./decisions/LogHoldingDecisionPanel";
import { AddHoldingPanel } from "./holdings/AddHoldingPanel";
import { HoldingsList } from "./holdings/HoldingsList";

type DashboardShellProps = HouseholdBootstrap & {
  onLogout?: () => void | Promise<void>;
  holdings?: HoldingSummary[];
  onCreateHolding?: (input: AddHoldingInput) => Promise<HoldingSummary>;
  decisions?: DecisionLogSummary[];
  onCreateDecision?: (input: DecisionLogInput) => Promise<DecisionLogSummary>;
};

const bucketTargets = [
  { className: "", name: "P1 Store of Wealth", target: 60 },
  { className: "p2", name: "P2 Investment / System Trading", target: 30 },
  { className: "p3", name: "P3 Speculation", target: 10 },
];

export function DashboardShell({
  household,
  member,
  ownerEntities,
  onLogout,
  holdings,
  onCreateHolding,
  decisions,
  onCreateDecision,
}: DashboardShellProps) {
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [localHoldings, setLocalHoldings] = useState<HoldingSummary[]>(holdings ?? []);
  const [localDecisions, setLocalDecisions] = useState<DecisionLogSummary[]>(decisions ?? []);

  useEffect(() => {
    if (holdings) setLocalHoldings(holdings);
  }, [holdings]);

  useEffect(() => {
    if (decisions) setLocalDecisions(decisions);
  }, [decisions]);

  async function handleCreateHolding(input: AddHoldingInput) {
    if (onCreateHolding) {
      await onCreateHolding(input);
      return;
    }

    setLocalHoldings((current) => [summaryFromInput(input), ...current]);
  }

  async function handleCreateDecision(input: DecisionLogInput) {
    if (onCreateDecision) {
      await onCreateDecision(input);
      return;
    }

    setLocalDecisions((current) => [summaryFromDecisionInput(input), ...current]);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Portfolio navigation">
        <div className="brand">
          <span className="brand-symbol">
            <Scale aria-hidden="true" size={18} />
          </span>
          TEM Investment
        </div>
        <nav className="nav-list">
          <span className="nav-item active">
            <LayoutDashboard aria-hidden="true" size={18} />
            Dashboard
          </span>
          <span className="nav-item">
            <WalletCards aria-hidden="true" size={18} />
            Holdings
          </span>
          <span className="nav-item">
            <ShieldCheck aria-hidden="true" size={18} />
            Decisions
          </span>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="dashboard-title">
            <p>{household.name}</p>
            <h1>Portfolio Command Center</h1>
          </div>
          <div className="status-stack">
            <span className="pill">
              <ShieldCheck aria-hidden="true" size={16} />
              Logged in
            </span>
            <span className="pill">{member.email}</span>
            {onLogout ? (
              <button className="secondary-button" onClick={onLogout} type="button">
                <LogOut aria-hidden="true" size={16} />
                Sign out
              </button>
            ) : null}
          </div>
        </header>

        <div className="dashboard-grid">
          <SecurityPanel onSessionChange={(session) => setSessionKey(session?.key ?? null)} />

          <section className="panel span-4">
            <div className="panel-header">
              <div className="panel-title">
                <Banknote aria-hidden="true" size={18} />
                Base value
              </div>
              <span className="pill">{household.baseCurrency}</span>
            </div>
            <div className="panel-body metric">
              <span className="metric-label">Total portfolio</span>
              <strong className="metric-value">THB 0</strong>
            </div>
          </section>

          <section className="panel span-4">
            <div className="panel-header">
              <div className="panel-title">
                <CircleDollarSign aria-hidden="true" size={18} />
                Secondary view
              </div>
              <span className="pill">{household.secondaryCurrency}</span>
            </div>
            <div className="panel-body metric">
              <span className="metric-label">Reference value</span>
              <strong className="metric-value">USD 0</strong>
            </div>
          </section>

          <section className="panel span-4">
            <div className="panel-header">
              <div className="panel-title">
                <Users aria-hidden="true" size={18} />
                Owner entities
              </div>
              <span className="pill">{ownerEntities.length}</span>
            </div>
            <div className="panel-body">
              {ownerEntities.map((owner) => (
                <span className="owner-chip" key={owner.id}>
                  <Users aria-hidden="true" size={15} />
                  {owner.displayName}
                </span>
              ))}
            </div>
          </section>

          <section className="panel span-8">
            <div className="panel-header">
              <div className="panel-title">
                <Scale aria-hidden="true" size={18} />
                Bucket discipline
              </div>
              <span className="pill">60 / 30 / 10</span>
            </div>
            <div className="panel-body bucket-list">
              {bucketTargets.map((bucket) => (
                <div className="bucket-row" key={bucket.name}>
                  <span className="bucket-name">{bucket.name}</span>
                  <span className="bucket-target">{bucket.target}% target</span>
                  <div className="bucket-bar">
                    <span className={bucket.className} style={{ width: `${bucket.target}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel span-4">
            <div className="panel-header">
              <div className="panel-title">
                <AlertTriangle aria-hidden="true" size={18} />
                Warnings
              </div>
              <span className="pill">0 open</span>
            </div>
            <div className="panel-body empty-list">
              <div className="empty-state">No warnings yet</div>
            </div>
          </section>

          <AddHoldingPanel
            householdId={household.id}
            onCreateHolding={handleCreateHolding}
            ownerEntities={ownerEntities}
            sessionKey={sessionKey}
          />

          <HoldingsList holdings={localHoldings} ownerEntities={ownerEntities} />

          <LogHoldingDecisionPanel
            actorIdentityUserId={member.identityUserId}
            holdings={localHoldings}
            householdId={household.id}
            onCreateDecision={handleCreateDecision}
            sessionKey={sessionKey}
          />

          <DecisionLogPanel decisions={localDecisions} />
        </div>
      </section>
    </main>
  );
}

function summaryFromInput(input: AddHoldingInput): HoldingSummary {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `holding_${Date.now()}`,
    householdId: input.householdId,
    portfolioBucket: input.portfolioBucket,
    assetClass: input.assetClass,
    assetLabel: input.assetLabel,
    accountLabel: input.accountLabel,
    currency: input.currency,
    liquidityCategory: input.liquidityCategory,
    valuationSource: input.valuationSource,
    valuationDate: input.valuationDate,
    status: input.status,
    ownershipSplits: input.ownershipSplits,
  };
}

function summaryFromDecisionInput(input: DecisionLogInput): DecisionLogSummary {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `decision_${Date.now()}`,
    householdId: input.householdId,
    holdingId: input.holdingId,
    actorIdentityUserId: input.actorIdentityUserId,
    action: input.action,
    scope: input.scope,
    reasonRequired: input.reasonRequired,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };
}
