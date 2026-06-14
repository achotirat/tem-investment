"use client";

import { FormEvent, useMemo, useState } from "react";
import { KeyRound, Lock, ShieldCheck, UnlockKeyhole } from "lucide-react";

import {
  createRecoveryKeyMaterial,
  type RecoveryKeyMaterial,
  type RecoveryKeyRecord,
} from "./crypto/recovery-key";
import {
  deriveMasterKey,
  type DerivedMasterKey,
  type KeyDerivationMethod,
} from "./crypto/portfolio-crypto";
import { UnlockSessionManager, type UnlockSession } from "./crypto/unlock-session";
import { secureRandomBytes } from "./crypto/encoding";

type UnlockResult = {
  key: CryptoKey;
  method: KeyDerivationMethod;
};

type SecurityPanelProps = {
  onUnlock?: (masterPassword: string) => Promise<UnlockResult>;
  createRecoveryKey?: () => Promise<RecoveryKeyMaterial>;
  onSessionChange?: (session: UnlockSession | null) => void;
};

export function SecurityPanel({
  onUnlock = defaultUnlock,
  createRecoveryKey = createRecoveryKeyMaterial,
  onSessionChange,
}: SecurityPanelProps) {
  const session = useMemo(() => new UnlockSessionManager(), []);
  const [masterPassword, setMasterPassword] = useState("");
  const [unlockMethod, setUnlockMethod] = useState<KeyDerivationMethod | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [recoveryRecord, setRecoveryRecord] = useState<RecoveryKeyRecord | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await onUnlock(masterPassword);
      const unlockSession = session.unlock(result);
      setUnlocked(true);
      setUnlockMethod(result.method);
      setMasterPassword("");
      onSessionChange?.(unlockSession);
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "Unable to unlock.");
    } finally {
      setLoading(false);
    }
  }

  function handleLock() {
    session.lock();
    setUnlocked(false);
    setUnlockMethod(null);
    onSessionChange?.(null);
  }

  async function handleGenerateRecoveryKey() {
    const material = await createRecoveryKey();
    setRecoveryKey(material.plaintext);
    setRecoveryRecord(material.record);
    setSavedOffline(false);
  }

  function handleAcknowledgeRecoveryKey() {
    if (!recoveryRecord) return;
    setRecoveryRecord({
      ...recoveryRecord,
      acknowledgedAt: new Date().toISOString(),
    });
    setRecoveryKey(null);
    setSavedOffline(false);
  }

  return (
    <section className="panel span-12 security-panel">
      <div className="panel-header">
        <div className="panel-title">
          {unlocked ? (
            <UnlockKeyhole aria-hidden="true" size={18} />
          ) : (
            <Lock aria-hidden="true" size={18} />
          )}
          Security unlock
        </div>
        <span className={`pill ${unlocked ? "secure" : ""}`}>
          {unlocked ? "Sensitive data unlocked" : "Sensitive data locked"}
        </span>
      </div>

      <div className="panel-body security-grid">
        <div className="security-column">
          <div>
            <div className="metric-label">Master password</div>
            <p className="security-copy">
              Login opens the app. The master password unlocks encrypted fields for this tab only.
            </p>
          </div>

          {unlocked ? (
            <div className="unlock-state">
              <ShieldCheck aria-hidden="true" size={22} />
              <div>
                <strong>Session key in memory</strong>
                <span>{unlockMethod === "argon2id" ? "Argon2id" : "PBKDF2 fallback"}</span>
              </div>
              <button className="secondary-button" onClick={handleLock} type="button">
                <Lock aria-hidden="true" size={16} />
                Lock
              </button>
            </div>
          ) : (
            <form className="unlock-form" onSubmit={handleUnlock}>
              <label className="field">
                Master password
                <input
                  autoComplete="current-password"
                  onChange={(event) => setMasterPassword(event.target.value)}
                  required
                  type="password"
                  value={masterPassword}
                />
              </label>
              {error ? <div className="error-strip">{error}</div> : null}
              <button className="primary-button" disabled={loading} type="submit">
                <KeyRound aria-hidden="true" size={16} />
                {loading ? "Unlocking" : "Unlock"}
              </button>
            </form>
          )}
        </div>

        <div className="security-column recovery-column">
          <div>
            <div className="metric-label">Recovery key</div>
            <p className="security-copy">
              Generate once, save offline, and acknowledge it. Only the hash record remains here.
            </p>
          </div>

          {recoveryRecord?.acknowledgedAt ? (
            <div className="unlock-state">
              <ShieldCheck aria-hidden="true" size={22} />
              <div>
                <strong>Recovery key acknowledged</strong>
                <span>{new Date(recoveryRecord.acknowledgedAt).toLocaleString()}</span>
              </div>
            </div>
          ) : recoveryKey ? (
            <div className="recovery-key-box">
              <code>{recoveryKey}</code>
              <label className="checkbox-line">
                <input
                  checked={savedOffline}
                  onChange={(event) => setSavedOffline(event.target.checked)}
                  type="checkbox"
                />
                I saved this recovery key offline
              </label>
              <button
                className="primary-button"
                disabled={!savedOffline}
                onClick={handleAcknowledgeRecoveryKey}
                type="button"
              >
                I saved it offline
              </button>
            </div>
          ) : (
            <button className="secondary-button" onClick={handleGenerateRecoveryKey} type="button">
              <KeyRound aria-hidden="true" size={16} />
              Generate recovery key
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

async function defaultUnlock(masterPassword: string): Promise<DerivedMasterKey> {
  return deriveMasterKey({
    masterPassword,
    salt: secureRandomBytes(16),
  });
}
