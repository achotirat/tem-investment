"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LogIn } from "lucide-react";

type LoginPanelProps = {
  error: string | null;
  loading: boolean;
  onSubmit: (credentials: { email: string; password: string }) => void | Promise<void>;
};

export function LoginPanel({ error, loading, onSubmit }: LoginPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          <h1>Household login</h1>
          <p>Netlify Identity controls access before any portfolio data is shown.</p>
        </div>
        {error ? <div className="error-strip">{error}</div> : null}
        <form className="login-form" onSubmit={handleSubmit}>
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
          <label className="field">
            Password
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="primary-button" disabled={loading} type="submit">
            <LogIn aria-hidden="true" size={18} />
            {loading ? "Logging in" : "Log in"}
          </button>
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
