import { describe, expect, it } from "vitest";

import { InMemoryExportBackupRepository } from "../src/server/export-backup-repository";
import type {
  EncryptedExportBackupPayload,
  ExportBackupMetadata,
} from "../src/shared/export-backup";

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

const metadata: ExportBackupMetadata = {
  id: "backup_1",
  householdId: "household_1",
  createdAt: "2026-06-16T00:00:00.000Z",
  format: "tem-investment-backup",
  version: 1,
  byteLength: 0,
  checksumSha256: "abc123",
};

describe("InMemoryExportBackupRepository", () => {
  it("stores and lists backup metadata by household prefix", async () => {
    const repository = new InMemoryExportBackupRepository();

    await repository.putBackup("households/household_1/backups/backup_1.json", payload, metadata);
    await repository.putBackup("households/household_2/backups/backup_2.json", payload, {
      ...metadata,
      id: "backup_2",
      householdId: "household_2",
    });

    expect(await repository.listBackups("household_1")).toEqual([
      expect.objectContaining({ id: "backup_1", householdId: "household_1" }),
    ]);
  });
});
