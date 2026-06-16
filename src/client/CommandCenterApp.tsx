"use client";

import { useEffect, useState } from "react";
import { getUser, handleAuthCallback, login, logout, onAuthChange } from "@netlify/identity";

import type { HouseholdBootstrap } from "../server/household-service";
import type {
  AIAnalysisRequest,
  AIAnalysisRunSummary,
  AIRecommendationStatus,
} from "../shared/ai-analysis";
import type { DecisionLogInput, DecisionLogSummary } from "../shared/discipline";
import type { ExportBackupMetadata } from "../shared/export-backup";
import type { AddHoldingInput, HoldingSummary } from "../shared/holdings";
import type { NotificationSummary } from "../shared/notifications";
import type { PriceDashboardPayload } from "../shared/pricing";
import { DashboardShell } from "./DashboardShell";
import { LoginPanel } from "./LoginPanel";
import {
  buildExportBackupPackage,
  encryptExportBackupPackage,
} from "./backup/export-backup-crypto";
import {
  DEMO_IDENTITY_USER,
  createDemoWorkspace,
  unlockDemoWorkspace,
} from "./demo-workspace";

type AppIdentityUser = {
  id?: string;
  email?: string;
};

type AuthState = {
  loading: boolean;
  loggingIn: boolean;
  user: AppIdentityUser | null;
  error: string | null;
};

export function CommandCenterApp() {
  const [auth, setAuth] = useState<AuthState>({
    loading: true,
    loggingIn: false,
    user: null,
    error: null,
  });
  const [bootstrap, setBootstrap] = useState<HouseholdBootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [holdings, setHoldings] = useState<HoldingSummary[]>([]);
  const [decisions, setDecisions] = useState<DecisionLogSummary[]>([]);
  const [priceDashboard, setPriceDashboard] = useState<PriceDashboardPayload>({
    prices: [],
    staleWarnings: [],
    lastSync: null,
  });
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [aiAnalysisRuns, setAIAnalysisRuns] = useState<AIAnalysisRunSummary[]>([]);
  const [exportBackups, setExportBackups] = useState<ExportBackupMetadata[]>([]);

  useEffect(() => {
    let active = true;

    async function hydrateSession() {
      try {
        await handleAuthCallback();
        const currentUser = (await getUser()) as AppIdentityUser | null;
        if (active) {
          setAuth((current) => ({
            ...current,
            loading: false,
            user: currentUser,
            error: null,
          }));
        }
      } catch (error) {
        if (active) {
          setAuth((current) => ({
            ...current,
            loading: false,
            error: messageForError(error),
          }));
        }
      }
    }

    const unsubscribe = onAuthChange((_event, currentUser) => {
      setAuth((current) => ({
        ...current,
        user: (currentUser as AppIdentityUser | null) ?? null,
      }));
    });

    void hydrateSession();

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!auth.user) {
      setBootstrap(null);
      setHoldings([]);
      setDecisions([]);
      setNotifications([]);
      setAIAnalysisRuns([]);
      setExportBackups([]);
      setPriceDashboard({ prices: [], staleWarnings: [], lastSync: null });
      return;
    }

    if (demoMode) return;

    let active = true;

    async function loadHousehold() {
      try {
        setBootstrapError(null);
        const response = await fetch("/api/bootstrap");
        if (!response.ok) {
          throw new Error(`Household bootstrap failed with ${response.status}`);
        }
        const payload = (await response.json()) as HouseholdBootstrap;
        if (active) setBootstrap(payload);
      } catch (error) {
        if (active) setBootstrapError(messageForError(error));
      }
    }

    void loadHousehold();

    return () => {
      active = false;
    };
  }, [auth.user, demoMode]);

  useEffect(() => {
    if (!bootstrap) {
      setHoldings([]);
      setDecisions([]);
      setNotifications([]);
      setAIAnalysisRuns([]);
      setExportBackups([]);
      setPriceDashboard({ prices: [], staleWarnings: [], lastSync: null });
      return;
    }

    if (demoMode) return;

    let active = true;

    async function loadHoldings() {
      try {
        const [
          holdingsResponse,
          decisionsResponse,
          pricesResponse,
          notificationsResponse,
          aiAnalysisResponse,
          exportBackupsResponse,
        ] = await Promise.all([
            fetch("/api/holdings"),
            fetch("/api/decisions"),
            fetch("/api/prices"),
            fetch("/api/notifications"),
            fetch("/api/ai-analysis"),
            fetch("/api/export-backup"),
          ]);
        if (!holdingsResponse.ok) {
          throw new Error(`Holdings load failed with ${holdingsResponse.status}`);
        }
        if (!decisionsResponse.ok) {
          throw new Error(`Decisions load failed with ${decisionsResponse.status}`);
        }
        if (!pricesResponse.ok) {
          throw new Error(`Prices load failed with ${pricesResponse.status}`);
        }
        if (!notificationsResponse.ok) {
          throw new Error(`Notifications load failed with ${notificationsResponse.status}`);
        }
        if (!aiAnalysisResponse.ok) {
          throw new Error(`AI analysis load failed with ${aiAnalysisResponse.status}`);
        }
        if (!exportBackupsResponse.ok) {
          throw new Error(`Export backup load failed with ${exportBackupsResponse.status}`);
        }
        const holdingsPayload = (await holdingsResponse.json()) as { holdings: HoldingSummary[] };
        const decisionsPayload = (await decisionsResponse.json()) as {
          decisions: DecisionLogSummary[];
        };
        const pricesPayload = (await pricesResponse.json()) as PriceDashboardPayload;
        const notificationsPayload = (await notificationsResponse.json()) as {
          notifications: NotificationSummary[];
        };
        const aiAnalysisPayload = (await aiAnalysisResponse.json()) as {
          runs: AIAnalysisRunSummary[];
        };
        const exportBackupsPayload = (await exportBackupsResponse.json()) as {
          backups: ExportBackupMetadata[];
        };
        if (active) {
          setHoldings(holdingsPayload.holdings);
          setDecisions(decisionsPayload.decisions);
          setPriceDashboard(pricesPayload);
          setNotifications(notificationsPayload.notifications);
          setAIAnalysisRuns(aiAnalysisPayload.runs);
          setExportBackups(exportBackupsPayload.backups);
        }
      } catch (error) {
        if (active) setBootstrapError(messageForError(error));
      }
    }

    void loadHoldings();

    return () => {
      active = false;
    };
  }, [bootstrap, demoMode]);

  async function handleLogin(credentials: { email: string; password: string }) {
    setDemoMode(false);
    setAuth((current) => ({ ...current, loggingIn: true, error: null }));
    try {
      const currentUser = (await login(credentials.email, credentials.password)) as AppIdentityUser;
      setAuth((current) => ({
        ...current,
        loggingIn: false,
        user: currentUser,
        error: null,
      }));
    } catch (error) {
      setAuth((current) => ({
        ...current,
        loggingIn: false,
        error: messageForError(error),
      }));
    }
  }

  async function handleDemoLogin() {
    setAuth((current) => ({ ...current, loggingIn: true, error: null }));
    try {
      const demoWorkspace = await createDemoWorkspace();
      setDemoMode(true);
      setBootstrap(demoWorkspace.bootstrap);
      setHoldings(demoWorkspace.holdings);
      setDecisions(demoWorkspace.decisions);
      setNotifications(demoWorkspace.notifications);
      setAIAnalysisRuns(demoWorkspace.aiAnalysisRuns);
      setExportBackups(demoWorkspace.exportBackups);
      setPriceDashboard(demoWorkspace.priceDashboard);
      setAuth({
        loading: false,
        loggingIn: false,
        user: DEMO_IDENTITY_USER,
        error: null,
      });
    } catch (error) {
      setAuth((current) => ({
        ...current,
        loggingIn: false,
        error: messageForError(error),
      }));
    }
  }

  async function handleLogout() {
    if (!demoMode) await logout();
    setDemoMode(false);
    setAuth((current) => ({ ...current, user: null }));
    setBootstrap(null);
    setHoldings([]);
    setDecisions([]);
    setNotifications([]);
    setAIAnalysisRuns([]);
    setExportBackups([]);
    setPriceDashboard({ prices: [], staleWarnings: [], lastSync: null });
  }

  async function handleCreateHolding(input: AddHoldingInput): Promise<HoldingSummary> {
    const response = await fetch("/api/holdings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Holding save failed with ${response.status}`);
    }

    const created = (await response.json()) as HoldingSummary;
    setHoldings((current) => [created, ...current]);
    return created;
  }

  async function handleCreateDecision(input: DecisionLogInput): Promise<DecisionLogSummary> {
    const response = await fetch("/api/decisions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Decision save failed with ${response.status}`);
    }

    const created = (await response.json()) as DecisionLogSummary;
    setDecisions((current) => [created, ...current]);
    return created;
  }

  async function handleRefreshPrices() {
    setRefreshingPrices(true);
    try {
      const response = await fetch("/api/prices", { method: "POST" });
      if (!response.ok) {
        throw new Error(`Price refresh failed with ${response.status}`);
      }
      const payload = (await response.json()) as PriceDashboardPayload;
      setPriceDashboard(payload);
    } finally {
      setRefreshingPrices(false);
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    const readAt = new Date().toISOString();

    if (demoMode) {
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, status: "read", readAt }
            : notification,
        ),
      );
      return;
    }

    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notificationId }),
    });

    if (!response.ok) {
      throw new Error(`Notification update failed with ${response.status}`);
    }

    const payload = (await response.json()) as { notification: NotificationSummary };
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === payload.notification.id ? payload.notification : notification,
      ),
    );
  }

  async function handleRunAIAnalysis(request: AIAnalysisRequest): Promise<AIAnalysisRunSummary> {
    if (demoMode && bootstrap && auth.user?.id) {
      const createdAt = new Date().toISOString();
      const sourceRecommendations =
        request.recommendations.length > 0
          ? request.recommendations
          : [
              {
                id: "demo_ai_review",
                severity: "info" as const,
                category: "risk" as const,
                title: "Portfolio review is ready",
                detail: "No urgent rule-based warnings are open.",
                actionLabel: "Record review decision",
              },
            ];
      const run: AIAnalysisRunSummary = {
        id: `demo_ai_run_${Date.now()}`,
        householdId: bootstrap.household.id,
        actorIdentityUserId: auth.user.id,
        status: "completed",
        provider: "dry_run",
        model: "dry-run-rules",
        consentScope: request.consentScope,
        inputSummary: {
          baseCurrency: request.review.baseCurrency,
          secondaryCurrency: request.review.secondaryCurrency,
          bucketCount: request.review.bucketAllocations.length,
          exposureGroupCount: Object.values(request.review.exposures).reduce(
            (total, groups) => total + groups.length,
            0,
          ),
          recommendationCount: request.recommendations.length,
          criticalRecommendationCount: request.recommendations.filter(
            (recommendation) => recommendation.severity === "critical",
          ).length,
          warningRecommendationCount: request.recommendations.filter(
            (recommendation) => recommendation.severity === "warning",
          ).length,
        },
        createdAt,
        completedAt: createdAt,
        errorMessage: null,
        recommendations: sourceRecommendations.slice(0, 3).map((recommendation, index) => ({
          id: `demo_ai_recommendation_${Date.now()}_${index}`,
          runId: `demo_ai_run_${Date.now()}`,
          householdId: bootstrap.household.id,
          severity: recommendation.severity,
          category: recommendation.category,
          title: `AI review: ${recommendation.title}`,
          detail: `${recommendation.detail} Challenge the assumption, document the decision, and avoid taking action until the household review is complete.`,
          actionLabel: recommendation.actionLabel,
          sourceRecommendationId: recommendation.id,
          status: "open",
          createdAt,
          resolvedAt: null,
          resolutionActorIdentityUserId: null,
          resolutionNote: null,
        })),
      };
      const normalizedRun = {
        ...run,
        recommendations: run.recommendations.map((recommendation) => ({
          ...recommendation,
          runId: run.id,
        })),
      };
      setAIAnalysisRuns((current) => [normalizedRun, ...current]);
      return normalizedRun;
    }

    const response = await fetch("/api/ai-analysis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed with ${response.status}`);
    }

    const payload = (await response.json()) as { run: AIAnalysisRunSummary };
    setAIAnalysisRuns((current) => [payload.run, ...current]);
    return payload.run;
  }

  async function handleResolveAIRecommendation(input: {
    recommendationId: string;
    status: Exclude<AIRecommendationStatus, "open">;
    note: string;
  }) {
    const resolvedAt = new Date().toISOString();

    if (demoMode) {
      setAIAnalysisRuns((current) =>
        current.map((run) => ({
          ...run,
          recommendations: run.recommendations.map((recommendation) =>
            recommendation.id === input.recommendationId
              ? {
                  ...recommendation,
                  status: input.status,
                  resolvedAt,
                  resolutionActorIdentityUserId: auth.user?.id ?? null,
                  resolutionNote: input.note,
                }
              : recommendation,
          ),
        })),
      );
      return;
    }

    const response = await fetch("/api/ai-analysis", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`AI recommendation update failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      recommendation: AIAnalysisRunSummary["recommendations"][number];
    };
    setAIAnalysisRuns((current) =>
      current.map((run) => ({
        ...run,
        recommendations: run.recommendations.map((recommendation) =>
          recommendation.id === payload.recommendation.id
            ? payload.recommendation
            : recommendation,
        ),
      })),
    );
  }

  async function handleCreateExportBackup(key: CryptoKey) {
    if (!bootstrap) return;

    const createdAt = new Date().toISOString();
    const backupPackage = buildExportBackupPackage({
      bootstrap,
      holdings,
      decisions,
      priceDashboard,
      notifications,
      aiAnalysisRuns,
      createdAt,
    });
    const encrypted = await encryptExportBackupPackage(backupPackage, key);

    if (demoMode) {
      const backup: ExportBackupMetadata = {
        id: `backup_${createdAt.replace(/[:.]/g, "-")}`,
        householdId: bootstrap.household.id,
        createdAt,
        format: encrypted.format,
        version: encrypted.version,
        byteLength: JSON.stringify(encrypted).length,
        checksumSha256: encrypted.checksumSha256,
      };
      setExportBackups((current) => [backup, ...current]);
      return;
    }

    const response = await fetch("/api/export-backup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(encrypted),
    });

    if (!response.ok) {
      throw new Error(`Export backup failed with ${response.status}`);
    }

    const payload = (await response.json()) as { backup: ExportBackupMetadata };
    setExportBackups((current) => [payload.backup, ...current]);
  }

  if (auth.loading) {
    return <div className="loading-screen">Checking login</div>;
  }

  if (!auth.user) {
    return (
      <LoginPanel
        error={auth.error}
        loading={auth.loggingIn}
        onDemoLogin={handleDemoLogin}
        onSubmit={handleLogin}
      />
    );
  }

  if (bootstrapError) {
    return <div className="loading-screen">{bootstrapError}</div>;
  }

  if (!bootstrap) {
    return <div className="loading-screen">Preparing household</div>;
  }

  return (
    <DashboardShell
      {...bootstrap}
      aiAnalysisRuns={aiAnalysisRuns}
      decisions={decisions}
      exportBackups={exportBackups}
      holdings={holdings}
      lastPriceSync={priceDashboard.lastSync}
      onCreateDecision={demoMode ? undefined : handleCreateDecision}
      onCreateExportBackup={handleCreateExportBackup}
      onCreateHolding={demoMode ? undefined : handleCreateHolding}
      onMarkNotificationRead={handleMarkNotificationRead}
      onRefreshPrices={demoMode ? undefined : handleRefreshPrices}
      onResolveAIRecommendation={handleResolveAIRecommendation}
      onLogout={handleLogout}
      onRunAIAnalysis={handleRunAIAnalysis}
      onUnlock={demoMode ? unlockDemoWorkspace : undefined}
      notifications={notifications}
      prices={priceDashboard.prices}
      refreshingPrices={refreshingPrices}
      staleWarnings={priceDashboard.staleWarnings}
    />
  );
}

function messageForError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
