import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExportBackupPanel } from "../src/client/backup/ExportBackupPanel";
import type { ExportBackupMetadata } from "../src/shared/export-backup";

const backup: ExportBackupMetadata = {
  id: "backup_1",
  householdId: "household_1",
  createdAt: "2026-06-16T00:00:00.000Z",
  format: "tem-investment-backup",
  version: 1,
  byteLength: 2048,
  checksumSha256: "abc123",
};

describe("ExportBackupPanel", () => {
  it("renders backup metadata and starts encrypted backup creation", () => {
    const onCreateBackup = vi.fn();

    render(
      <ExportBackupPanel
        backups={[backup]}
        disabled={false}
        onCreateBackup={onCreateBackup}
      />,
    );

    expect(screen.getByText("Export and backup")).toBeInTheDocument();
    expect(screen.getByText("backup_1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create encrypted backup" }));

    expect(onCreateBackup).toHaveBeenCalledTimes(1);
  });
});
