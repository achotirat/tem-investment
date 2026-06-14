import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@netlify/identity", () => ({
  getUser: vi.fn(async () => null),
  handleAuthCallback: vi.fn(async () => undefined),
  login: vi.fn(),
  logout: vi.fn(async () => undefined),
  onAuthChange: vi.fn(() => () => undefined),
}));

import { CommandCenterApp } from "../src/client/CommandCenterApp";

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
  });
});
