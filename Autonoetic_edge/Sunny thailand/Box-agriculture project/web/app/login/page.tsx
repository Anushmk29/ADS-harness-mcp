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
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      localStorage.setItem("access_token", result.access_token); router.push("/");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in"); }
    finally { setBusy(false); }
  }

  return <main className="login-page"><section className="login-card"><div className="brand login-brand"><span className="brand-mark"><Sprout /></span><span>FreshFlow<small>Operations system</small></span></div><div><p className="eyebrow">Secure access</p><h1>Welcome back</h1><p>Sign in with your assigned operations account.</p></div><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label><StatusMessage error={error} /><button className="primary-button" disabled={busy}><LockKeyhole size={17} /> {busy ? "Signing in…" : "Sign in"}</button></form></section></main>;
}

