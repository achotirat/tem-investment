import { describe, expect, it } from "vitest";

import {
  decryptSensitiveField,
  deriveMasterKey,
  encryptSensitiveField,
} from "../src/client/crypto/portfolio-crypto";

const salt = new Uint8Array(16).fill(7);

describe("portfolio crypto", () => {
  it("encrypts sensitive fields with AES-GCM and decrypts them in session", async () => {
    const derived = await deriveMasterKey({
      masterPassword: "correct horse battery staple",
      salt,
      argon2id: async () => new Uint8Array(32).fill(3),
    });

    const encrypted = await encryptSensitiveField("wallet seed note", derived.key);
    const plaintext = await decryptSensitiveField(encrypted, derived.key);

    expect(encrypted.algorithm).toBe("AES-GCM");
    expect(encrypted.ciphertext).not.toContain("wallet seed note");
    expect(plaintext).toBe("wallet seed note");
  });

  it("uses Argon2id when available and falls back to PBKDF2 otherwise", async () => {
    const argon2Derived = await deriveMasterKey({
      masterPassword: "household-secret",
      salt,
      argon2id: async () => new Uint8Array(32).fill(4),
    });
    const fallbackDerived = await deriveMasterKey({
      masterPassword: "household-secret",
      salt,
      argon2id: null,
    });

    expect(argon2Derived.method).toBe("argon2id");
    expect(fallbackDerived.method).toBe("pbkdf2");
  });
});
