import {
  base64ToBytes,
  bytesToArrayBuffer,
  bytesToBase64,
  bytesToUtf8,
  secureRandomBytes,
  utf8ToBytes,
} from "./encoding";

export type KeyDerivationMethod = "argon2id" | "pbkdf2";

export type Argon2idDeriver =
  | ((input: {
      password: string;
      salt: Uint8Array;
      outputLength: number;
    }) => Promise<Uint8Array>)
  | null;

export type DerivedMasterKey = {
  key: CryptoKey;
  method: KeyDerivationMethod;
};

export type EncryptedField = {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
};

type DeriveMasterKeyInput = {
  masterPassword: string;
  salt: Uint8Array;
  argon2id?: Argon2idDeriver;
};

const AES_KEY_LENGTH_BITS = 256;
const RAW_KEY_LENGTH_BYTES = AES_KEY_LENGTH_BITS / 8;
const PBKDF2_ITERATIONS = 310_000;
const AES_GCM_IV_BYTES = 12;

export async function deriveMasterKey({
  masterPassword,
  salt,
  argon2id,
}: DeriveMasterKeyInput): Promise<DerivedMasterKey> {
  const argon2idDeriver = argon2id === undefined ? await loadArgon2idDeriver() : argon2id;

  if (argon2idDeriver) {
    const rawKey = await argon2idDeriver({
      password: masterPassword,
      salt,
      outputLength: RAW_KEY_LENGTH_BYTES,
    });
    return {
      key: await importAesKey(rawKey),
      method: "argon2id",
    };
  }

  return {
    key: await derivePbkdf2Key(masterPassword, salt),
    method: "pbkdf2",
  };
}

export async function encryptSensitiveField(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedField> {
  const iv = secureRandomBytes(AES_GCM_IV_BYTES);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(iv) },
    key,
    bytesToArrayBuffer(utf8ToBytes(plaintext)),
  );

  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptSensitiveField(payload: EncryptedField, key: CryptoKey): Promise<string> {
  if (payload.algorithm !== "AES-GCM" || payload.version !== 1) {
    throw new Error("Unsupported encrypted field payload.");
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(base64ToBytes(payload.iv)) },
    key,
    bytesToArrayBuffer(base64ToBytes(payload.ciphertext)),
  );

  return bytesToUtf8(new Uint8Array(decrypted));
}

async function derivePbkdf2Key(masterPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    bytesToArrayBuffer(utf8ToBytes(masterPassword)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bytesToArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytesToArrayBuffer(rawKey), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function loadArgon2idDeriver(): Promise<Argon2idDeriver> {
  try {
    const module = await import("@noble/hashes/argon2.js");
    return async ({ password, salt, outputLength }) =>
      module.argon2idAsync(utf8ToBytes(password), salt, {
        dkLen: outputLength,
        m: 64 * 1024,
        p: 1,
        t: 3,
      });
  } catch {
    return null;
  }
}
