import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import AuthCard from "./agent/AuthCard";

// Step 1 of "forgot password": ask for the account email and send a reset
// link. The reply is the same whether or not the email has an account.
export default function ForgotPassword() {
  const [params] = useSearchParams();
  const loginPath = params.get("from") === "agent" ? "/agent/login" : "/admin/login";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.post("/api/auth/forgot-password", { email: email.trim() });
      setSent(res.data.message);
    } catch (err) {
      setError(errorMessage(err, "Could not send the reset email."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Forgot your password?" subtitle="Enter your account email and we'll send you a link to choose a new one.">
      {sent ? (
        <>
          <div className="alert alert-success">{sent}</div>
          <p className="hint">The link works once and expires in 30 minutes.</p>
          <Link className="btn btn-primary" to={loginPath} style={{ width: "100%", textAlign: "center", marginTop: 8 }}>
            Back to login
          </Link>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          <label className="first" htmlFor="fp-email">Email</label>
          <input id="fp-email" type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy} style={{ width: "100%", marginTop: 18 }}>
            {busy ? <span className="spinner" /> : "Send reset link"}
          </button>
          <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
            Remembered it? <Link to={loginPath}>Back to login</Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}
