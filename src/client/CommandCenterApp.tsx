"use client";

import { useEffect, useState } from "react";
import { getUser, handleAuthCallback, login, logout, onAuthChange } from "@netlify/identity";

import type { HouseholdBootstrap } from "../server/household-service";
import type { DecisionLogInput, DecisionLogSummary } from "../shared/discipline";
import type { AddHoldingInput, HoldingSummary } from "../shared/holdings";
import type { NotificationSummary } from "../shared/notifications";
import type { PriceDashboardPayload } from "../shared/pricing";
import { DashboardShell } from "./DashboardShell";
import { LoginPanel } from "./LoginPanel";
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
      setPriceDashboard({ prices: [], staleWarnings: [], lastSync: null });
      return;
    }

    if (demoMode) return;

    let active = true;

    async function loadHoldings() {
      try {
        const [holdingsResponse, decisionsResponse, pricesResponse, notificationsResponse] =
          await Promise.all([
            fetch("/api/holdings"),
            fetch("/api/decisions"),
            fetch("/api/prices"),
            fetch("/api/notifications"),
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
        const holdingsPayload = (await holdingsResponse.json()) as { holdings: HoldingSummary[] };
        const decisionsPayload = (await decisionsResponse.json()) as {
          decisions: DecisionLogSummary[];
        };
        const pricesPayload = (await pricesResponse.json()) as PriceDashboardPayload;
        const notificationsPayload = (await notificationsResponse.json()) as {
          notifications: NotificationSummary[];
        };
        if (active) {
          setHoldings(holdingsPayload.holdings);
          setDecisions(decisionsPayload.decisions);
          setPriceDashboard(pricesPayload);
          setNotifications(notificationsPayload.notifications);
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
      decisions={decisions}
      holdings={holdings}
      lastPriceSync={priceDashboard.lastSync}
      onCreateDecision={demoMode ? undefined : handleCreateDecision}
      onCreateHolding={demoMode ? undefined : handleCreateHolding}
      onMarkNotificationRead={handleMarkNotificationRead}
      onRefreshPrices={demoMode ? undefined : handleRefreshPrices}
      onLogout={handleLogout}
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
