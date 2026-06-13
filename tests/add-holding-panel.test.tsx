import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddHoldingPanel } from "../src/client/holdings/AddHoldingPanel";

describe("AddHoldingPanel", () => {
  it("requires unlock before saving a holding", () => {
    render(
      <AddHoldingPanel
        householdId="household_1"
        ownerEntities={[{ id: "owner_1", displayName: "Tem", kind: "person" }]}
        sessionKey={null}
        onCreateHolding={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Save holding" })).toBeDisabled();
    expect(screen.getByText("Unlock sensitive data before adding holdings")).toBeInTheDocument();
  });

  it("submits encrypted holding data when ownership totals 100 percent", async () => {
    const onCreateHolding = vi.fn().mockResolvedValue(undefined);

    render(
      <AddHoldingPanel
        householdId="household_1"
        ownerEntities={[{ id: "owner_1", displayName: "Tem", kind: "person" }]}
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
          },
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Asset label"), { target: { value: "Gold bars" } });
    fireEvent.change(screen.getByLabelText("Account / platform"), { target: { value: "Vault" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Cost basis"), { target: { value: "100000" } });
    fireEvent.change(screen.getByLabelText("Current value"), { target: { value: "120000" } });
    fireEvent.change(screen.getByLabelText("Valuation date"), {
      target: { value: "2026-06-13" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save holding" }));

    await waitFor(() => expect(onCreateHolding).toHaveBeenCalledTimes(1));
    expect(onCreateHolding.mock.calls[0][0]).toMatchObject({
      assetLabel: "Gold bars",
      accountLabel: "Vault",
      ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 100 }],
    });
  });
});
