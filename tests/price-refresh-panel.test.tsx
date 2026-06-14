import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PriceRefreshPanel } from "../src/client/pricing/PriceRefreshPanel";

describe("PriceRefreshPanel", () => {
  it("shows last sync status and stale valuation warnings", () => {
    render(
      <PriceRefreshPanel
        lastSync={{
          id: "sync_1",
          status: "success",
          startedAt: "2026-06-14T00:00:00.000Z",
          completedAt: "2026-06-14T00:00:05.000Z",
          pricesFetched: 2,
        }}
        onRefreshPrices={vi.fn()}
        prices={[]}
        staleWarnings={[
          {
            holdingId: "holding_1",
            assetLabel: "BTC",
            assetClass: "crypto",
            valuationDate: "2026-06-10",
            staleAfterDays: 1,
            daysOld: 4,
          },
        ]}
      />,
    );

    expect(screen.getByText("Price refresh")).toBeInTheDocument();
    expect(screen.getByText("2 prices")).toBeInTheDocument();
    expect(screen.getByText("BTC valuation is 4 days old")).toBeInTheDocument();
  });

  it("runs manual refresh when clicked", async () => {
    const onRefreshPrices = vi.fn().mockResolvedValue(undefined);
    render(
      <PriceRefreshPanel
        lastSync={null}
        onRefreshPrices={onRefreshPrices}
        prices={[]}
        staleWarnings={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh prices now" }));

    await waitFor(() => expect(onRefreshPrices).toHaveBeenCalledTimes(1));
  });
});
