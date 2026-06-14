export type EncryptedField = {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
};
