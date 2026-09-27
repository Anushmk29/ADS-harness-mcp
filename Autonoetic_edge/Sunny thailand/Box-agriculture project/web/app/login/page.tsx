"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Sprout } from "lucide-react";
import { api } from "@/lib/api";
import { StatusMessage } from "@/components/status-message";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const requestedPath = new URLSearchParams(window.location.search).get(
        "next",
      );
      const destination =
        requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
          ? requestedPath
          : "/";
      router.replace(destination);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to sign in",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark" style={{ background: "#ffffff", padding: "2px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src="/logo.png" alt="Agriculture is life" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </span>
          <span>Agriculture is life<small>Operations system</small></span>
        </div>
        <div>
          <p className="eyebrow">Secure access</p>
          <h1>Welcome back</h1>
          <p>Sign in with your Admin or Staff credentials.</p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={() => {
              setEmail("admin@agricultureislife.com");
              setPassword("Password123!");
            }}
            style={{
              flex: 1,
              padding: "9px 12px",
              fontSize: "0.85rem",
              borderRadius: "8px",
              border: "1px solid #d0e0dc",
              background: "#f4f8f7",
              cursor: "pointer",
              fontWeight: 600,
              color: "#1d3531",
            }}
          >
            👑 Admin Fill
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail("staff@agricultureislife.com");
              setPassword("Password123!");
            }}
            style={{
              flex: 1,
              padding: "9px 12px",
              fontSize: "0.85rem",
              borderRadius: "8px",
              border: "1px solid #d0e0dc",
              background: "#f4f8f7",
              cursor: "pointer",
              fontWeight: 600,
              color: "#1d3531",
            }}
          >
            🧑‍🌾 Staff Fill
          </button>
        </div>

        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <StatusMessage error={error} />
          <button className="primary-button" disabled={busy}>
            <LockKeyhole size={17} /> {busy ? "Signing in…" : "Sign in"}
          </button>
          <div style={{ fontSize: "0.8rem", color: "#6b7280", textAlign: "center", marginTop: "6px" }}>
            Admin: <code>admin@agricultureislife.com</code><br />
            Staff: <code>staff@agricultureislife.com</code><br />
            Default Password: <code>Password123!</code>
          </div>
        </form>
      </section>
    </main>
  );
}
