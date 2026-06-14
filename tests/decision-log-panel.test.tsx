import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DecisionLogPanel } from "../src/client/decisions/DecisionLogPanel";
import { LogHoldingDecisionPanel } from "../src/client/decisions/LogHoldingDecisionPanel";
import type { DecisionLogSummary } from "../src/shared/discipline";
import type { HoldingSummary } from "../src/shared/holdings";

const holding: HoldingSummary = {
  id: "holding_1",
  householdId: "household_1",
  portfolioBucket: "P1",
  assetClass: "gold",
  assetLabel: "Gold bars",
  accountLabel: "Vault",
  currency: "THB",
  liquidityCategory: "semi_liquid",
  valuationSource: "manual",
  valuationDate: "2026-06-14",
  status: "active",
  ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 100 }],
};

const decision: DecisionLogSummary = {
  id: "decision_1",
  householdId: "household_1",
  holdingId: "holding_1",
  actorIdentityUserId: "user_1",
  action: "sell",
  scope: "holding",
  reasonRequired: true,
  metadata: {
    portfolioBucket: "P1",
    assetLabel: "Gold bars",
  },
  createdAt: "2026-06-14T01:00:00.000Z",
};

describe("DecisionLogPanel", () => {
  it("shows non-sensitive decision metadata", () => {
    render(<DecisionLogPanel decisions={[decision]} />);

    expect(screen.getByText("Sell")).toBeInTheDocument();
    expect(screen.getByText("Gold bars")).toBeInTheDocument();
    expect(screen.getByText("P1")).toBeInTheDocument();
  });
});

describe("LogHoldingDecisionPanel", () => {
  it("requires unlock before logging P1 sell or reduce decisions", () => {
    render(
      <LogHoldingDecisionPanel
        householdId="household_1"
        actorIdentityUserId="user_1"
        holdings={[holding]}
        sessionKey={null}
        onCreateDecision={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Log decision" })).toBeDisabled();
    expect(screen.getByText("Unlock sensitive data before logging decisions")).toBeInTheDocument();
  });

  it("requires a reason for P1 sell or reduce decisions", async () => {
    const onCreateDecision = vi.fn();

    render(
      <LogHoldingDecisionPanel
        householdId="household_1"
        actorIdentityUserId="user_1"
        holdings={[holding]}
        sessionKey={{} as CryptoKey}
        onCreateDecision={onCreateDecision}
        encryptDecision={async (input) => ({
          householdId: input.householdId,
          holdingId: input.holdingId,
          actorIdentityUserId: input.actorIdentityUserId,
          action: input.action,
          scope: input.scope,
          reasonRequired: input.reasonRequired,
          metadata: input.metadata,
          encryptedDetails: {
            reason: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "r" },
          },
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Log decision" }));

    expect(await screen.findByText("P1 sell/reduce decisions require a reason.")).toBeInTheDocument();
    expect(onCreateDecision).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Need liquidity for house payment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log decision" }));

    await waitFor(() => expect(onCreateDecision).toHaveBeenCalledTimes(1));
    expect(onCreateDecision.mock.calls[0][0]).toMatchObject({
      action: "sell",
      metadata: {
        portfolioBucket: "P1",
        assetLabel: "Gold bars",
      },
    });
  });
});
