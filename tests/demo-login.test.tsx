import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({
  acceptInvite: vi.fn(),
  getUser: vi.fn(),
  handleAuthCallback: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  onAuthChange: vi.fn(),
}));

vi.mock("@netlify/identity", () => identity);

import { CommandCenterApp } from "../src/client/CommandCenterApp";

beforeEach(() => {
  identity.acceptInvite.mockReset();
  identity.getUser.mockReset();
  identity.handleAuthCallback.mockReset();
  identity.login.mockReset();
  identity.logout.mockReset();
  identity.onAuthChange.mockReset();

  identity.getUser.mockResolvedValue(null);
  identity.handleAuthCallback.mockResolvedValue(undefined);
  identity.logout.mockResolvedValue(undefined);
  identity.onAuthChange.mockReturnValue(() => undefined);
  vi.unstubAllGlobals();
});

describe("CommandCenterApp demo login", () => {
  it("opens an in-memory demo dashboard without Netlify Identity credentials", async () => {
    render(<CommandCenterApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Use demo" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Portfolio Command Center" })).toBeInTheDocument(),
    );
    expect(screen.getByText("Demo Household")).toBeInTheDocument();
    expect(screen.getByText("demo@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("BTC cold storage")).toHaveLength(2);
    expect(screen.getByText("Price refresh")).toBeInTheDocument();
    expect(screen.getByText("Review loop")).toBeInTheDocument();
    expect(screen.getByText("Portfolio review is due")).toBeInTheDocument();
    expect(screen.getByText("2 unread")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Mark read" })[0]);

    await waitFor(() => expect(screen.getByText("1 unread")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Master password"), {
      target: { value: "demo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => expect(screen.getByText("Sensitive data unlocked")).toBeInTheDocument());
    expect(screen.getByText("PBKDF2 fallback")).toBeInTheDocument();
    expect(await screen.findByText("Allocation review")).toBeInTheDocument();
    expect(screen.getByText("Owner net worth")).toBeInTheDocument();
    expect(screen.getByText("Concentration views")).toBeInTheDocument();
    expect(screen.getByText("Rules-based recommendations")).toBeInTheDocument();
    expect(await screen.findByText("P3 is above its speculation cap")).toBeInTheDocument();
    expect(screen.getByText("AI review")).toBeInTheDocument();
    expect(screen.getByText("Export and backup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create encrypted backup" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Create encrypted backup" }));

    await waitFor(() => expect(screen.getByText("1 backups")).toBeInTheDocument());

    fireEvent.click(
      screen.getByLabelText("I consent to sending category-level portfolio data for AI review."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Analyze with AI" }));

    expect(await screen.findByText("AI review: P3 is above its speculation cap")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]);

    await waitFor(() => expect(screen.getByText("Approved")).toBeInTheDocument());
  });
});

describe("CommandCenterApp invite acceptance", () => {
  it("accepts an invite token by setting a password", async () => {
    identity.handleAuthCallback.mockResolvedValueOnce({
      type: "invite",
      user: null,
      token: "invite-token-1",
    });
    identity.acceptInvite.mockResolvedValueOnce({
      id: "user_1",
      email: "tem@example.com",
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);

      if (path === "/api/bootstrap") {
        return Response.json({
          household: {
            id: "household_1",
            name: "Tem Household",
            baseCurrency: "THB",
            secondaryCurrency: "USD",
          },
          member: {
            identityUserId: "user_1",
            email: "tem@example.com",
            role: "owner",
          },
          ownerEntities: [
            {
              id: "owner_1",
              displayName: "Tem",
              kind: "person",
            },
          ],
        });
      }

      if (path === "/api/holdings") return Response.json({ holdings: [] });
      if (path === "/api/decisions") return Response.json({ decisions: [] });
      if (path === "/api/prices") {
        return Response.json({ prices: [], staleWarnings: [], lastSync: null });
      }
      if (path === "/api/notifications") return Response.json({ notifications: [] });
      if (path === "/api/ai-analysis") return Response.json({ runs: [] });
      if (path === "/api/export-backup") return Response.json({ backups: [] });

      return Response.json({}, { status: 404 });
    }));

    render(<CommandCenterApp />);

    expect(await screen.findByRole("heading", { name: "Set password" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(identity.acceptInvite).toHaveBeenCalledWith(
        "invite-token-1",
        "correct horse battery staple",
      ),
    );
    expect(await screen.findByRole("heading", { name: "Portfolio Command Center" })).toBeInTheDocument();
  });
});
