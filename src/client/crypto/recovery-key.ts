import {
  bytesToArrayBuffer,
  bytesToBase64,
  bytesToHex,
  hexToBytes,
  secureRandomBytes,
  utf8ToBytes,
} from "./encoding";

export type RecoveryKeyRecord = {
  version: 1;
  hash: string;
  salt: string;
  createdAt: string;
  acknowledgedAt: string | null;
};

export type RecoveryKeyMaterial = {
  plaintext: string;
  record: RecoveryKeyRecord;
};

type CreateRecoveryKeyMaterialInput = {
  randomBytes?: Uint8Array;
  now?: Date;
};

export async function createRecoveryKeyMaterial({
  randomBytes = secureRandomBytes(32),
  now = new Date(),
}: CreateRecoveryKeyMaterialInput = {}): Promise<RecoveryKeyMaterial> {
  const plaintext = formatRecoveryKey(randomBytes);
  const salt = secureRandomBytes(16);

  return {
    plaintext,
    record: {
      version: 1,
      hash: await hashRecoveryKey(plaintext, salt),
      salt: bytesToHex(salt),
      createdAt: now.toISOString(),
      acknowledgedAt: null,
    },
  };
}

export function acknowledgeRecoveryKey(record: RecoveryKeyRecord, now = new Date()): RecoveryKeyRecord {
  return {
    ...record,
    acknowledgedAt: now.toISOString(),
  };
}

export async function verifyRecoveryKey(
  plaintext: string,
  record: RecoveryKeyRecord,
): Promise<boolean> {
  const candidateHash = await hashRecoveryKey(plaintext, hexToBytes(record.salt));
  return timingSafeEqual(candidateHash, record.hash);
}

async function hashRecoveryKey(plaintext: string, salt: Uint8Array): Promise<string> {
  const value = new Uint8Array([...salt, ...utf8ToBytes(normalizeRecoveryKey(plaintext))]);
  const digest = await crypto.subtle.digest("SHA-256", bytesToArrayBuffer(value));
  return bytesToHex(new Uint8Array(digest));
}

function formatRecoveryKey(bytes: Uint8Array): string {
  const compact = bytesToBase64(bytes).replaceAll("+", "A").replaceAll("/", "B").replaceAll("=", "");
  const chunks = compact.slice(0, 32).match(/.{1,4}/g) ?? [];
  return `TEM-${chunks.join("-")}`;
}

function normalizeRecoveryKey(value: string): string {
  return value.trim().toUpperCase();
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
