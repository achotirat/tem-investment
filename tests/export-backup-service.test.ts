import { describe, expect, it, vi } from "vitest";

import {
  createExportBackup,
  createExportBackupId,
  createExportBackupKey,
  type ExportBackupRepository,
} from "../src/server/export-backup-service";
import type { EncryptedExportBackupPayload } from "../src/shared/export-backup";

const payload: EncryptedExportBackupPayload = {
  format: "tem-investment-backup",
  version: 1,
  householdId: "household_1",
  createdAt: "2026-06-16T00:00:00.000Z",
  algorithm: "AES-GCM",
  iv: "iv",
  ciphertext: "ciphertext",
  checksumSha256: "abc123",
};

describe("export backup service", () => {
  it("creates stable ids and household blob keys", () => {
    const id = createExportBackupId("2026-06-16T00:00:00.000Z");

    expect(id).toBe("backup_2026-06-16T00-00-00-000Z");
    expect(createExportBackupKey("household_1", id)).toBe(
      "households/household_1/backups/backup_2026-06-16T00-00-00-000Z.json",
    );
  });

  it("stores encrypted payloads and returns metadata", async () => {
    const repository: ExportBackupRepository = {
      putBackup: vi.fn(async (_key, storedPayload, metadata) => ({
        ...metadata,
        byteLength: JSON.stringify(storedPayload).length,
      })),
      listBackups: vi.fn(),
    };

    const metadata = await createExportBackup({
      repository,
      householdId: "household_1",
      payload,
    });

    expect(repository.putBackup).toHaveBeenCalledOnce();
    expect(metadata).toMatchObject({
      householdId: "household_1",
      format: "tem-investment-backup",
      checksumSha256: "abc123",
    });
  });
});
