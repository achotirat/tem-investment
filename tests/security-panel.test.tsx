import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SecurityPanel } from "../src/client/SecurityPanel";

describe("SecurityPanel", () => {
  it("unlocks sensitive data and exposes a manual lock action", async () => {
    render(
      <SecurityPanel
        createRecoveryKey={vi.fn()}
        onUnlock={async () => ({ key: {} as CryptoKey, method: "pbkdf2" })}
      />,
    );

    fireEvent.change(screen.getByLabelText("Master password"), {
      target: { value: "master-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(screen.getByText("Sensitive data unlocked")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(screen.getByText("Sensitive data locked")).toBeInTheDocument();
  });

  it("shows a recovery key once and requires explicit acknowledgement", async () => {
    render(
      <SecurityPanel
        createRecoveryKey={async () => ({
          plaintext: "TEM-AAAA-BBBB-CCCC",
          record: {
            version: 1,
            hash: "hash",
            salt: "salt",
            createdAt: "2026-06-13T08:00:00.000Z",
            acknowledgedAt: null,
          },
        })}
        onUnlock={async () => ({ key: {} as CryptoKey, method: "pbkdf2" })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate recovery key" }));

    expect(await screen.findByText("TEM-AAAA-BBBB-CCCC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I saved it offline" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("I saved this recovery key offline"));
    fireEvent.click(screen.getByRole("button", { name: "I saved it offline" }));

    await waitFor(() => {
      expect(screen.queryByText("TEM-AAAA-BBBB-CCCC")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Recovery key acknowledged")).toBeInTheDocument();
  });
});
