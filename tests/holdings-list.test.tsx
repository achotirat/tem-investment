import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HoldingsList } from "../src/client/holdings/HoldingsList";

describe("HoldingsList", () => {
  it("shows recorded holdings with metadata and ownership split", () => {
    render(
      <HoldingsList
        holdings={[
          {
            id: "holding_1",
            householdId: "household_1",
            portfolioBucket: "P1",
            assetClass: "gold",
            assetLabel: "Gold bars",
            accountLabel: "Vault",
            currency: "THB",
            liquidityCategory: "semi_liquid",
            valuationSource: "manual",
            valuationDate: "2026-06-13",
            status: "active",
            ownershipSplits: [{ ownerEntityId: "owner_1", percentage: 100 }],
          },
        ]}
        ownerEntities={[{ id: "owner_1", displayName: "Tem", kind: "person" }]}
      />,
    );

    expect(screen.getByText("Gold bars")).toBeInTheDocument();
    expect(screen.getByText("Vault")).toBeInTheDocument();
    expect(screen.getByText("P1")).toBeInTheDocument();
    expect(screen.getByText("Tem 100%")).toBeInTheDocument();
  });
});
