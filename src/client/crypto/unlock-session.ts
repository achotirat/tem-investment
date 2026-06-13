import type { KeyDerivationMethod } from "./portfolio-crypto";

export const DEFAULT_UNLOCK_IDLE_TIMEOUT_MS = 30 * 60 * 1_000;

export type UnlockSession = {
  key: CryptoKey;
  method: KeyDerivationMethod;
  unlockedAt: number;
  expiresAt: number;
};

type UnlockSessionManagerOptions = {
  idleTimeoutMs?: number;
  now?: () => number;
};

type UnlockInput = {
  key: CryptoKey;
  method: KeyDerivationMethod;
};

export class UnlockSessionManager {
  private session: UnlockSession | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly idleTimeoutMs: number;
  private readonly now: () => number;

  constructor({
    idleTimeoutMs = DEFAULT_UNLOCK_IDLE_TIMEOUT_MS,
    now = () => Date.now(),
  }: UnlockSessionManagerOptions = {}) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.now = now;
  }

  unlock(input: UnlockInput): UnlockSession {
    const unlockedAt = this.now();
    this.session = {
      ...input,
      unlockedAt,
      expiresAt: unlockedAt + this.idleTimeoutMs,
    };
    this.scheduleAutoLock();
    return this.session;
  }

  touch(): void {
    if (!this.session) return;
    this.session = {
      ...this.session,
      expiresAt: this.now() + this.idleTimeoutMs,
    };
    this.scheduleAutoLock();
  }

  lock(): void {
    this.clearTimer();
    this.session = null;
  }

  isUnlocked(): boolean {
    return this.session !== null;
  }

  getSession(): UnlockSession | null {
    return this.session;
  }

  private scheduleAutoLock(): void {
    this.clearTimer();
    this.timer = setTimeout(() => this.lock(), this.idleTimeoutMs);
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
