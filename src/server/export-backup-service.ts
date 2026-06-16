import type {
  EncryptedExportBackupPayload,
  ExportBackupMetadata,
} from "../shared/export-backup";

export type ExportBackupRepository = {
  putBackup(
    key: string,
    payload: EncryptedExportBackupPayload,
    metadata: ExportBackupMetadata,
  ): Promise<ExportBackupMetadata>;
  listBackups(householdId: string): Promise<ExportBackupMetadata[]>;
};

export function createExportBackupId(createdAt: string): string {
  return `backup_${createdAt.replace(/[:.]/g, "-")}`;
}

export function createExportBackupKey(householdId: string, backupId: string): string {
  return `households/${householdId}/backups/${backupId}.json`;
}

export async function createExportBackup({
  repository,
  householdId,
  payload,
}: {
  repository: ExportBackupRepository;
  householdId: string;
  payload: EncryptedExportBackupPayload;
}): Promise<ExportBackupMetadata> {
  if (payload.householdId !== householdId) {
    throw new Error("Backup household does not match authenticated household.");
  }
  if (payload.format !== "tem-investment-backup" || payload.version !== 1) {
    throw new Error("Unsupported backup format.");
  }
  if (payload.algorithm !== "AES-GCM") {
    throw new Error("Unsupported backup encryption algorithm.");
  }

  const id = createExportBackupId(payload.createdAt);
  const key = createExportBackupKey(householdId, id);
  const metadata: ExportBackupMetadata = {
    id,
    householdId,
    createdAt: payload.createdAt,
    format: payload.format,
    version: payload.version,
    byteLength: JSON.stringify(payload).length,
    checksumSha256: payload.checksumSha256,
  };

  return repository.putBackup(key, payload, metadata);
}
