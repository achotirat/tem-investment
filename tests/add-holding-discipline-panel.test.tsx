import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddHoldingPanel } from "../src/client/holdings/AddHoldingPanel";

const ownerEntities = [{ id: "owner_1", displayName: "Tem", kind: "person" as const }];

function fillBaseHolding() {
  fireEvent.change(screen.getByLabelText("Asset label"), { target: { value: "SET system trade" } });
  fireEvent.change(screen.getByLabelText("Account / platform"), { target: { value: "Broker" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Cost basis"), { target: { value: "100000" } });
  fireEvent.change(screen.getByLabelText("Current value"), { target: { value: "120000" } });
  fireEvent.change(screen.getByLabelText("Valuation date"), { target: { value: "2026-06-14" } });
}

describe("AddHoldingPanel discipline controls", () => {
  it("blocks active P2 saves until the strict trade plan is complete", async () => {
    const onCreateHolding = vi.fn();

    render(
      <AddHoldingPanel
        householdId="household_1"
        ownerEntities={ownerEntities}
        sessionKey={{} as CryptoKey}
        onCreateHolding={onCreateHolding}
        encryptSubmission={async (input) => ({
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
          encryptedValues: {
            quantity: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "q" },
            costBasis: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "b" },
            currentValue: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "v" },
            tradePlan: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "t" },
          },
          decisionLog: {
            action: "open_p2",
            scope: "holding",
            reasonRequired: true,
            encryptedDetails: {
              reason: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "r" },
              tradePlan: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "t" },
            },
            metadata: { portfolioBucket: "P2" },
          },
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Portfolio"), { target: { value: "P2" } });
    fillBaseHolding();
    fireEvent.click(screen.getByRole("button", { name: "Save holding" }));

    expect(await screen.findByText("P2 active positions require a complete trade plan before saving.")).toBeInTheDocument();
    expect(onCreateHolding).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Entry reason"), { target: { value: "Breakout" } });
    fireEvent.change(screen.getByLabelText("System / setup"), { target: { value: "System A" } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "Weekly low" } });
    fireEvent.change(screen.getByLabelText("Take profit plan"), { target: { value: "2R then trail" } });
    fireEvent.change(screen.getByLabelText("Invalidation condition"), {
      target: { value: "Close below support" },
    });
    fireEvent.change(screen.getByLabelText("Position sizing"), { target: { value: "1% risk" } });
    fireEvent.change(screen.getByLabelText("Expected holding period"), {
      target: { value: "3 months" },
    });
    fireEvent.change(screen.getByLabelText("Decision reason"), {
      target: { value: "Follow the system" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save holding" }));

    await waitFor(() => expect(onCreateHolding).toHaveBeenCalledTimes(1));
    expect(onCreateHolding.mock.calls[0][0]).toMatchObject({
      portfolioBucket: "P2",
      decisionLog: {
        action: "open_p2",
      },
    });
  });

  it("requires a P3 override reason when a new position exceeds the cap", async () => {
    const onCreateHolding = vi.fn();

    render(
      <AddHoldingPanel
        householdId="household_1"
        ownerEntities={ownerEntities}
        sessionKey={{} as CryptoKey}
        onCreateHolding={onCreateHolding}
        p3GuardrailContext={{
          portfolioTotalValueThb: 1_000_000,
          p3CurrentValueThb: 95_000,
          maxLossPerTradeThb: 10_000,
          maxLossPerMonthThb: 30_000,
          currentMonthLossThb: 0,
          p3TargetAllocationPercent: 10,
        }}
        encryptSubmission={async (input) => ({
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
          encryptedValues: {
            quantity: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "q" },
            costBasis: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "b" },
            currentValue: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "v" },
            p3OverrideReason: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "o" },
          },
          decisionLog: {
            action: "p3_override",
            scope: "holding",
            reasonRequired: true,
            encryptedDetails: {
              reason: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "r" },
              p3OverrideReason: { version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "o" },
            },
            metadata: { portfolioBucket: "P3" },
          },
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Portfolio"), { target: { value: "P3" } });
    fillBaseHolding();
    fireEvent.click(screen.getByRole("button", { name: "Save holding" }));

    expect(await screen.findByText("P3 allocation would exceed the 10% target. Add an override reason to save.")).toBeInTheDocument();
    expect(onCreateHolding).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("P3 override reason"), {
      target: { value: "Fixed one-week thesis" },
    });
    fireEvent.change(screen.getByLabelText("Decision reason"), {
      target: { value: "Controlled speculation slot" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save holding" }));

    await waitFor(() => expect(onCreateHolding).toHaveBeenCalledTimes(1));
    expect(onCreateHolding.mock.calls[0][0]).toMatchObject({
      portfolioBucket: "P3",
      decisionLog: {
        action: "p3_override",
      },
    });
  });
});
