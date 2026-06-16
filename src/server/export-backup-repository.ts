import { getStore } from "@netlify/blobs";

import type {
  EncryptedExportBackupPayload,
  ExportBackupMetadata,
} from "../shared/export-backup";
import type { ExportBackupRepository } from "./export-backup-service";

type BlobStore = ReturnType<typeof getStore>;

export class NetlifyBlobExportBackupRepository implements ExportBackupRepository {
  constructor(
    private readonly store: BlobStore = getStore({
      name: "portfolio-backups",
      consistency: "strong",
    }),
  ) {}

  async putBackup(
    key: string,
    payload: EncryptedExportBackupPayload,
    metadata: ExportBackupMetadata,
  ): Promise<ExportBackupMetadata> {
    await this.store.setJSON(key, payload, { metadata });
    return metadata;
  }

  async listBackups(householdId: string): Promise<ExportBackupMetadata[]> {
    const prefix = `households/${householdId}/backups/`;
    const { blobs } = await this.store.list({ prefix });
    const entries = await Promise.all(
      blobs.map(async (blob) => {
        const result = await this.store.getMetadata(blob.key);
        return result?.metadata as ExportBackupMetadata | undefined;
      }),
    );

    return entries
      .filter((entry): entry is ExportBackupMetadata => Boolean(entry))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryExportBackupRepository implements ExportBackupRepository {
  private readonly backups = new Map<
    string,
    { payload: EncryptedExportBackupPayload; metadata: ExportBackupMetadata }
  >();

  async putBackup(
    key: string,
    payload: EncryptedExportBackupPayload,
    metadata: ExportBackupMetadata,
  ): Promise<ExportBackupMetadata> {
    this.backups.set(key, {
      payload,
      metadata: { ...metadata, byteLength: JSON.stringify(payload).length },
    });
    return this.backups.get(key)?.metadata ?? metadata;
  }

  async listBackups(householdId: string): Promise<ExportBackupMetadata[]> {
    const prefix = `households/${householdId}/backups/`;
    return Array.from(this.backups.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value.metadata)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
