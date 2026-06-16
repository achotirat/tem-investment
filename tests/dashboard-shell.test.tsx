import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardShell } from "../src/client/DashboardShell";
import { LoginPanel } from "../src/client/LoginPanel";

describe("LoginPanel", () => {
  it("asks unauthenticated users to log in with Netlify Identity", () => {
    render(<LoginPanel error={null} loading={false} onSubmit={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Household login" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });

  it("offers optional demo access without entering credentials", () => {
    const onDemoLogin = vi.fn();

    render(
      <LoginPanel
        error={null}
        loading={false}
        onDemoLogin={onDemoLogin}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Use demo" }));

    expect(onDemoLogin).toHaveBeenCalledTimes(1);
  });
});

describe("DashboardShell", () => {
  it("shows an empty household command center after login", () => {
    render(
      <DashboardShell
        household={{
          id: "household_1",
          name: "Tem Household",
          baseCurrency: "THB",
          secondaryCurrency: "USD",
        }}
        member={{
          identityUserId: "user_123",
          email: "tem@example.com",
          role: "owner",
        }}
        ownerEntities={[
          {
            id: "owner_1",
            displayName: "Tem",
            kind: "person",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Portfolio Command Center" })).toBeInTheDocument();
    expect(screen.getByText("Tem Household")).toBeInTheDocument();
    expect(screen.getAllByText("Locked")).not.toHaveLength(0);
    expect(screen.getByText("Price refresh")).toBeInTheDocument();
    expect(screen.getByText("Valuations are fresh")).toBeInTheDocument();
    expect(screen.getByText("Review loop")).toBeInTheDocument();
    expect(screen.getByText("No review reminders")).toBeInTheDocument();
    expect(screen.getByText("AI review")).toBeInTheDocument();
    expect(screen.getByText("Unlock sensitive data to analyze")).toBeInTheDocument();
    expect(screen.getByText("Export and backup")).toBeInTheDocument();
    expect(screen.getByText("Unlock sensitive data before creating an encrypted backup")).toBeInTheDocument();
    expect(screen.getByText("P1 Store of Wealth")).toBeInTheDocument();
    expect(screen.getByText("60% target")).toBeInTheDocument();
    expect(screen.getByText("No holdings recorded yet")).toBeInTheDocument();
  });
});
