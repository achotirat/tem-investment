import { describe, expect, it } from "vitest";

import {
  acknowledgeRecoveryKey,
  createRecoveryKeyMaterial,
  verifyRecoveryKey,
} from "../src/client/crypto/recovery-key";

describe("recovery key", () => {
  it("creates a one-time plaintext key while storing only a hash record", async () => {
    const material = await createRecoveryKeyMaterial({
      randomBytes: new Uint8Array(32).fill(11),
      now: new Date("2026-06-13T08:00:00.000Z"),
    });

    expect(material.plaintext).toMatch(/^TEM-/);
    expect(JSON.stringify(material.record)).not.toContain(material.plaintext);
    expect(material.record.acknowledgedAt).toBeNull();
    expect(await verifyRecoveryKey(material.plaintext, material.record)).toBe(true);
    expect(await verifyRecoveryKey("TEM-wrong-key", material.record)).toBe(false);
  });

  it("records explicit offline-save acknowledgement without restoring plaintext", async () => {
    const material = await createRecoveryKeyMaterial({
      randomBytes: new Uint8Array(32).fill(12),
      now: new Date("2026-06-13T08:00:00.000Z"),
    });

    const acknowledged = acknowledgeRecoveryKey(
      material.record,
      new Date("2026-06-13T08:05:00.000Z"),
    );

    expect(acknowledged.acknowledgedAt).toBe("2026-06-13T08:05:00.000Z");
    expect(JSON.stringify(acknowledged)).not.toContain(material.plaintext);
  });
});
