import type {
  EncryptedExportBackupPayload,
  ExportBackupPackage,
} from "../../shared/export-backup";
import {
  base64ToBytes,
  bytesToArrayBuffer,
  bytesToBase64,
  bytesToHex,
  bytesToUtf8,
  secureRandomBytes,
  utf8ToBytes,
} from "../crypto/encoding";

type BuildExportBackupPackageInput = Omit<ExportBackupPackage, "format" | "version">;

const AES_GCM_IV_BYTES = 12;

export function buildExportBackupPackage(
  input: BuildExportBackupPackageInput,
): ExportBackupPackage {
  return {
    format: "tem-investment-backup",
    version: 1,
    ...input,
  };
}

export async function encryptExportBackupPackage(
  backupPackage: ExportBackupPackage,
  key: CryptoKey,
): Promise<EncryptedExportBackupPayload> {
  const plaintext = utf8ToBytes(JSON.stringify(backupPackage));
  const iv = secureRandomBytes(AES_GCM_IV_BYTES);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(iv) },
    key,
    bytesToArrayBuffer(plaintext),
  );
  const ciphertext = new Uint8Array(encrypted);

  return {
    format: backupPackage.format,
    version: backupPackage.version,
    householdId: backupPackage.bootstrap.household.id,
    createdAt: backupPackage.createdAt,
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    checksumSha256: await sha256Hex(ciphertext),
  };
}

export async function decryptExportBackupPayload(
  payload: EncryptedExportBackupPayload,
  key: CryptoKey,
): Promise<ExportBackupPackage> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(base64ToBytes(payload.iv)) },
    key,
    bytesToArrayBuffer(base64ToBytes(payload.ciphertext)),
  );
  return JSON.parse(bytesToUtf8(new Uint8Array(decrypted))) as ExportBackupPackage;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytesToArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}
