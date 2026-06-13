"use client";

import { useEffect, useState } from "react";
import { getUser, handleAuthCallback, login, logout, onAuthChange } from "@netlify/identity";

import type { HouseholdBootstrap } from "../server/household-service";
import type { AddHoldingInput, HoldingSummary } from "../shared/holdings";
import { DashboardShell } from "./DashboardShell";
import { LoginPanel } from "./LoginPanel";

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
  const [holdings, setHoldings] = useState<HoldingSummary[]>([]);

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
      return;
    }

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
  }, [auth.user]);

  useEffect(() => {
    if (!bootstrap) {
      setHoldings([]);
      return;
    }

    let active = true;

    async function loadHoldings() {
      try {
        const response = await fetch("/api/holdings");
        if (!response.ok) {
          throw new Error(`Holdings load failed with ${response.status}`);
        }
        const payload = (await response.json()) as { holdings: HoldingSummary[] };
        if (active) setHoldings(payload.holdings);
      } catch (error) {
        if (active) setBootstrapError(messageForError(error));
      }
    }

    void loadHoldings();

    return () => {
      active = false;
    };
  }, [bootstrap]);

  async function handleLogin(credentials: { email: string; password: string }) {
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

  async function handleLogout() {
    await logout();
    setAuth((current) => ({ ...current, user: null }));
    setBootstrap(null);
    setHoldings([]);
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

  if (auth.loading) {
    return <div className="loading-screen">Checking login</div>;
  }

  if (!auth.user) {
    return <LoginPanel error={auth.error} loading={auth.loggingIn} onSubmit={handleLogin} />;
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
      holdings={holdings}
      onCreateHolding={handleCreateHolding}
      onLogout={handleLogout}
    />
  );
}

function messageForError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
