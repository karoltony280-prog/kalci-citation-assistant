import { useState } from "react";
import { signIn, signUp } from "./supabase";

export function AuthPanel({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"signin"|"signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = mode === "signin"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);

      if (mode === "signup" && !result.session) {
        setMessage("Account created. Check your email if confirmation is enabled, then sign in.");
      } else {
        onAuthenticated();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="eyebrow">KALCI DOCUMENT MEMORY</div>
      <h1>{mode === "signin" ? "Sign in to KALCI." : "Create your KALCI account."}</h1>
      <p className="lead">Save analysed documents, source identities and citation histories so the work can be reopened later.</p>
      <form onSubmit={submit} className="auth-form">
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
        {message && <div className="auth-message">{message}</div>}
        <button className="primary" disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="ghost auth-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); }}>
        {mode === "signin" ? "Create an account" : "Back to sign in"}
      </button>
    </section>
  );
}
