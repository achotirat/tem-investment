"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LogIn, UserPlus } from "lucide-react";

type LoginPanelProps = {
  error: string | null;
  loading: boolean;
  invitePending?: boolean;
  onDemoLogin?: () => void | Promise<void>;
  onAcceptInvite?: (input: { password: string; confirmPassword: string }) => void | Promise<void>;
  onSubmit: (credentials: { email: string; password: string }) => void | Promise<void>;
};

export function LoginPanel({
  error,
  loading,
  invitePending = false,
  onDemoLogin,
  onAcceptInvite,
  onSubmit,
}: LoginPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (invitePending) {
      await onAcceptInvite?.({ password, confirmPassword });
      return;
    }

    await onSubmit({ email, password });
  }

  return (
    <main className="login-surface">
      <section className="login-panel" aria-label="Login">
        <div className="login-mark">
          <KeyRound aria-hidden="true" size={20} />
          Private command center
        </div>
        <div>
          <h1>{invitePending ? "Set password" : "Household login"}</h1>
          <p>
            {invitePending
              ? "Finish the Netlify invite by setting the password for this account."
              : "Netlify Identity controls access before any portfolio data is shown."}
          </p>
        </div>
        {error ? <div className="error-strip">{error}</div> : null}
        <form className="login-form" onSubmit={handleSubmit}>
          {invitePending ? null : (
            <label className="field">
              Email
              <input
                autoComplete="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
          )}
          <label className="field">
            {invitePending ? "New password" : "Password"}
            <input
              autoComplete={invitePending ? "new-password" : "current-password"}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {invitePending ? (
            <label className="field">
              Confirm password
              <input
                autoComplete="new-password"
                name="confirmPassword"
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </label>
          ) : null}
          <button className="primary-button" disabled={loading} type="submit">
            {invitePending ? <UserPlus aria-hidden="true" size={18} /> : <LogIn aria-hidden="true" size={18} />}
            {loading ? (invitePending ? "Creating account" : "Logging in") : invitePending ? "Create account" : "Log in"}
          </button>
          {onDemoLogin && !invitePending ? (
            <button className="secondary-button" disabled={loading} onClick={onDemoLogin} type="button">
              <KeyRound aria-hidden="true" size={18} />
              Use demo
            </button>
          ) : null}
        </form>
      </section>
      <section className="login-visual" aria-label="Target allocation preview">
        <div className="allocation-map">
          <div className="allocation-line">
            <span>P1 wealth</span>
            <div className="allocation-track">
              <div className="allocation-fill" style={{ width: "60%" }} />
            </div>
            <span>60%</span>
          </div>
          <div className="allocation-line">
            <span>P2 system</span>
            <div className="allocation-track">
              <div className="allocation-fill p2" style={{ width: "30%" }} />
            </div>
            <span>30%</span>
          </div>
          <div className="allocation-line">
            <span>P3 outlet</span>
            <div className="allocation-track">
              <div className="allocation-fill p3" style={{ width: "10%" }} />
            </div>
            <span>10%</span>
          </div>
        </div>
      </section>
    </main>
  );
}
