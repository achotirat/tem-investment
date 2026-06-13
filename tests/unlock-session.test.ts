import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnlockSessionManager } from "../src/client/crypto/unlock-session";

describe("UnlockSessionManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("keeps the derived key in memory until manual lock", async () => {
    const key = {} as CryptoKey;
    const session = new UnlockSessionManager({ idleTimeoutMs: 1_000 });

    session.unlock({ key, method: "argon2id" });
    expect(session.isUnlocked()).toBe(true);
    expect(session.getSession()?.key).toBe(key);

    session.lock();
    expect(session.isUnlocked()).toBe(false);
    expect(session.getSession()).toBeNull();
  });

  it("auto-locks after the configured idle timeout and extends on touch", async () => {
    const session = new UnlockSessionManager({ idleTimeoutMs: 1_000 });

    session.unlock({ key: {} as CryptoKey, method: "pbkdf2" });
    vi.advanceTimersByTime(900);
    session.touch();
    vi.advanceTimersByTime(900);

    expect(session.isUnlocked()).toBe(true);

    vi.advanceTimersByTime(101);
    expect(session.isUnlocked()).toBe(false);
  });
});
