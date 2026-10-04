import { useEffect, useState } from "react";
import App from "./App";
import { getCurrentSession, onAuthStateChange, signIn, signUp } from "./supabase";
import { KALCI_LOGO } from "./kalciLogo";

export default function SessionGate() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    getCurrentSession()
      .then((session) => {
        if (active) {
          setSignedIn(Boolean(session));
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setReady(true);
      });
    const unsubscribe = onAuthStateChange((session) => {
      setSignedIn(Boolean(session));
      setReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = mode === "signin"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);
      if (mode === "signup" && !result.session) {
        setMessage("Account created. Check your email if confirmation is enabled.");
      } else {
        setSignedIn(true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="auth-loading">Loading KALCI session…</div>;
  if (signedIn) return <App />;

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <img className="auth-logo" src={KALCI_LOGO} alt="KALCI Citation Generator" />
        <span className="eyebrow">KALCI DOCUMENT MEMORY</span>
        <h1>{mode === "signin" ? "Sign in to KALCI." : "Create your KALCI account."}</h1>
        <p className="lead">Your account will let KALCI save analysed documents, source identities and citation histories.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
          {message && <div className="auth-message">{message}</div>}
          <button className="primary" disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <button className="ghost auth-switch" onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setMessage("");
        }}>
          {mode === "signin" ? "Create an account" : "Back to sign in"}
        </button>
      </section>
    </div>
  );
}
