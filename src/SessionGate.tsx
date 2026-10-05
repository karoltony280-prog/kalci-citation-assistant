import { useEffect, useState } from "react";
import App from "./App";
import { getCurrentSession, onAuthStateChange, resetPassword, signIn, signUp } from "./supabase";
import { KALCI_LOGO } from "./kalciLogo";

export default function SessionGate() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [showReset, setShowReset] = useState(false);

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

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function friendlyAuthMessage(error: unknown) {
    const raw = error instanceof Error ? error.message : String(error);
    const lower = raw.toLowerCase();
    if (lower.includes("email rate limit") || lower.includes("rate limit exceeded")) {
      setCooldown(30);
      return "KALCI's authentication email service has reached its sending limit. Please wait before requesting another email. This usually affects account confirmation or password-reset emails, not ordinary password sign-in.";
    }
    if (lower.includes("user already registered")) {
      return "An account may already exist for this email. Switch to Sign in instead of creating another account.";
    }
    if (lower.includes("invalid login credentials")) {
      return "The email or password is incorrect. Check both fields and try again.";
    }
    if (lower.includes("email not confirmed")) {
      return "This account has not been confirmed yet. Check your inbox for the KALCI confirmation email before signing in.";
    }
    return raw;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cooldown) {
      setMessage(`Please wait ${cooldown}s before trying again.`);
      return;
    }
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
      setMessage(friendlyAuthMessage(error));
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
          {!showReset && <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>}
          {message && <div className="auth-message">{message}</div>}
          {showReset ? (
            <button className="primary" type="button" disabled={busy || cooldown > 0} onClick={async () => {
              if (!email.trim()) { setMessage("Enter your email address first."); return; }
              setBusy(true); setMessage("");
              try {
                await resetPassword(email.trim());
                setMessage("Password-reset email requested. Check your inbox. Avoid repeatedly requesting it because email sending is rate-limited.");
              } catch (error) {
                setMessage(friendlyAuthMessage(error));
              } finally {
                setBusy(false);
              }
            }}>{cooldown ? `Wait ${cooldown}s` : busy ? "Sending…" : "Send reset email"}</button>
          ) : (
            <button className="primary" disabled={busy || cooldown > 0}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button>
          )}
        </form>
        <button className="ghost auth-switch" onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setShowReset(false);
          setMessage("");
        }}>
          {mode === "signin" ? "Create an account" : "Back to sign in"}
        </button>
        {mode === "signin" && !showReset && (
          <button className="ghost auth-reset" onClick={() => { setShowReset(true); setMessage(""); }}>Forgot password?</button>
        )}
        {showReset && (
          <button className="ghost auth-reset" onClick={() => { setShowReset(false); setMessage(""); }}>Back to sign in</button>
        )}
      </section>
    </div>
  );
}
