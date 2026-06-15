"use client";

import { useEffect, useMemo, useState } from "react";
import {
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
import type {
  AIAnalysisRequest,
  AIAnalysisRunSummary,
  AIRecommendationStatus,
} from "../shared/ai-analysis";
import type { PortfolioReviewSnapshot } from "../shared/dashboard";
import type { DecisionLogInput, DecisionLogSummary } from "../shared/discipline";
import type { AddHoldingInput, HoldingSummary } from "../shared/holdings";
import type { NotificationSummary } from "../shared/notifications";
import type {
  MarketPriceSnapshot,
  PriceSyncSummary,
  ValuationFreshnessWarning,
} from "../shared/pricing";
import { SecurityPanel } from "./SecurityPanel";
import { AIReviewPanel } from "./ai/AIReviewPanel";
import type { DerivedMasterKey } from "./crypto/portfolio-crypto";
import { PortfolioReviewPanel } from "./dashboard/PortfolioReviewPanel";
import { RulesRecommendationPanel } from "./dashboard/RulesRecommendationPanel";
import { DecisionLogPanel } from "./decisions/DecisionLogPanel";
import { LogHoldingDecisionPanel } from "./decisions/LogHoldingDecisionPanel";
import { AddHoldingPanel } from "./holdings/AddHoldingPanel";
import { HoldingsList } from "./holdings/HoldingsList";
import { NotificationCenterPanel } from "./notifications/NotificationCenterPanel";
import { PriceRefreshPanel } from "./pricing/PriceRefreshPanel";
import { calculatePortfolioReview } from "./pricing/portfolio-valuations";
import { buildRulesBasedRecommendations } from "./recommendations/rules-recommendations";

type DashboardShellProps = HouseholdBootstrap & {
  onLogout?: () => void | Promise<void>;
  holdings?: HoldingSummary[];
  onCreateHolding?: (input: AddHoldingInput) => Promise<HoldingSummary>;
  decisions?: DecisionLogSummary[];
  onCreateDecision?: (input: DecisionLogInput) => Promise<DecisionLogSummary>;
  prices?: MarketPriceSnapshot[];
  staleWarnings?: ValuationFreshnessWarning[];
  lastPriceSync?: PriceSyncSummary | null;
  notifications?: NotificationSummary[];
  aiAnalysisRuns?: AIAnalysisRunSummary[];
  refreshingPrices?: boolean;
  onUnlock?: (masterPassword: string) => Promise<DerivedMasterKey>;
  onRefreshPrices?: () => Promise<void> | void;
  onMarkNotificationRead?: (notificationId: string) => Promise<void> | void;
  onRunAIAnalysis?: (request: AIAnalysisRequest) => Promise<AIAnalysisRunSummary>;
  onResolveAIRecommendation?: (input: {
    recommendationId: string;
    status: Exclude<AIRecommendationStatus, "open">;
    note: string;
  }) => Promise<void> | void;
};

export function DashboardShell({
  household,
  member,
  ownerEntities,
  onLogout,
  holdings,
  onCreateHolding,
  decisions,
  onCreateDecision,
  prices = [],
  staleWarnings = [],
  lastPriceSync = null,
  notifications = [],
  aiAnalysisRuns = [],
  refreshingPrices = false,
  onUnlock,
  onRefreshPrices = async () => {},
  onMarkNotificationRead,
  onRunAIAnalysis,
  onResolveAIRecommendation,
}: DashboardShellProps) {
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [localHoldings, setLocalHoldings] = useState<HoldingSummary[]>(holdings ?? []);
  const [localDecisions, setLocalDecisions] = useState<DecisionLogSummary[]>(decisions ?? []);
  const [portfolioReview, setPortfolioReview] = useState<PortfolioReviewSnapshot>(() =>
    emptyPortfolioReview(household.baseCurrency, household.secondaryCurrency),
  );

  useEffect(() => {
    if (holdings) setLocalHoldings(holdings);
  }, [holdings]);

  useEffect(() => {
    if (decisions) setLocalDecisions(decisions);
  }, [decisions]);

  useEffect(() => {
    let active = true;

    async function calculateReview() {
      try {
        const nextReview = await calculatePortfolioReview({
          holdings: localHoldings,
          prices,
          baseCurrency: household.baseCurrency,
          secondaryCurrency: household.secondaryCurrency,
          ownerEntities,
          sessionKey,
        });
        if (active) setPortfolioReview(nextReview);
      } catch {
        if (active) {
          setPortfolioReview(
            emptyPortfolioReview(household.baseCurrency, household.secondaryCurrency),
          );
        }
      }
    }

    void calculateReview();

    return () => {
      active = false;
    };
  }, [
    household.baseCurrency,
    household.secondaryCurrency,
    localHoldings,
    ownerEntities,
    prices,
    sessionKey,
  ]);

  const recommendations = useMemo(
    () =>
      buildRulesBasedRecommendations({
        review: portfolioReview,
        holdings: localHoldings,
        staleWarnings,
      }),
    [localHoldings, portfolioReview, staleWarnings],
  );

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
          <SecurityPanel
            onSessionChange={(session) => setSessionKey(session?.key ?? null)}
            onUnlock={onUnlock}
          />

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
              <strong className="metric-value">
                {portfolioReview.locked
                  ? "Locked"
                  : formatMoney(household.baseCurrency, portfolioReview.totalBaseValue)}
              </strong>
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
              <strong className="metric-value">
                {portfolioReview.locked
                  ? "Locked"
                  : formatMoney(household.secondaryCurrency, portfolioReview.totalSecondaryValue)}
              </strong>
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

          <PortfolioReviewPanel review={portfolioReview} />

          <RulesRecommendationPanel recommendations={recommendations} />

          <NotificationCenterPanel
            notifications={notifications}
            onMarkRead={onMarkNotificationRead}
          />

          <AIReviewPanel
            analysisRuns={aiAnalysisRuns}
            onResolveRecommendation={onResolveAIRecommendation}
            onRunAnalysis={onRunAIAnalysis}
            recommendations={recommendations}
            review={portfolioReview}
            unlocked={sessionKey !== null}
          />

          <PriceRefreshPanel
            lastSync={lastPriceSync}
            onRefreshPrices={onRefreshPrices}
            prices={prices}
            refreshing={refreshingPrices}
            staleWarnings={staleWarnings}
          />

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
    encryptedValues: input.encryptedValues,
    autoPriceKey: null,
    latestMarketPriceThb: null,
    latestMarketPriceAsOf: null,
  };
}

function emptyPortfolioReview(
  baseCurrency: string,
  secondaryCurrency: string,
): PortfolioReviewSnapshot {
  return {
    locked: true,
    baseCurrency,
    secondaryCurrency,
    totalBaseValue: 0,
    totalSecondaryValue: 0,
    bucketAllocations: [
      {
        key: "P1",
        label: "P1 Store of Wealth",
        targetPercent: 60,
        valueBase: 0,
        percent: 0,
        driftPercent: -60,
      },
      {
        key: "P2",
        label: "P2 Investment / System Trading",
        targetPercent: 30,
        valueBase: 0,
        percent: 0,
        driftPercent: -30,
      },
      {
        key: "P3",
        label: "P3 Speculation",
        targetPercent: 10,
        valueBase: 0,
        percent: 0,
        driftPercent: -10,
      },
    ],
    ownerNetWorth: [],
    exposures: {
      assetClass: [],
      platform: [],
      currency: [],
      owner: [],
      liquidity: [],
      leverage: [],
    },
  };
}

function formatMoney(currency: string, value: number): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "THB" ? 0 : 2,
  }).format(value);
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
