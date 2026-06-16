import { describe, expect, it } from "vitest";

import {
  buildExportBackupPackage,
  decryptExportBackupPayload,
  encryptExportBackupPackage,
} from "../src/client/backup/export-backup-crypto";
import type { HouseholdBootstrap } from "../src/server/household-service";

const bootstrap: HouseholdBootstrap = {
  household: {
    id: "household_1",
    name: "Tem Household",
    baseCurrency: "THB",
    secondaryCurrency: "USD",
  },
  member: {
    identityUserId: "user_1",
    email: "tem@example.com",
    role: "owner",
  },
  ownerEntities: [{ id: "owner_1", displayName: "Tem", kind: "person" }],
};

describe("export backup crypto", () => {
  it("builds and encrypts a portable household backup package", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(32).fill(7),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
    const backupPackage = buildExportBackupPackage({
      bootstrap,
      holdings: [],
      decisions: [],
      priceDashboard: { prices: [], staleWarnings: [], lastSync: null },
      notifications: [],
      aiAnalysisRuns: [],
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const encrypted = await encryptExportBackupPackage(backupPackage, key);
    const decrypted = await decryptExportBackupPayload(encrypted, key);

    expect(encrypted).toMatchObject({
      version: 1,
      algorithm: "AES-GCM",
      format: "tem-investment-backup",
      householdId: "household_1",
    });
    expect(encrypted.ciphertext).not.toContain("Tem Household");
    expect(decrypted).toEqual(backupPackage);
  });
});
