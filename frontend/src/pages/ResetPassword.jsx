import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import AuthCard, { PasswordInput } from "./agent/AuthCard";

// The reset link carries its one-time token in the URL fragment
// (#token=...), which browsers never send to the server. Read it once, then
// remove it from the address bar so it isn't left on screen or in history.
function takeTokenFromUrl() {
  const match = window.location.hash.match(/token=([^&]+)/);
  if (match) window.history.replaceState(null, "", window.location.pathname);
  return match ? decodeURIComponent(match[1]) : "";
}

// Step 2 of "forgot password": choose a new password from the emailed link.
export default function ResetPassword() {
  const [token] = useState(takeTokenFromUrl);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return setError("Use at least 8 characters with both letters and numbers.");
    }
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    try {
      const res = await api.post("/api/auth/reset-password", { token, new_password: password });
      setDone(res.data);
    } catch (err) {
      setError(errorMessage(err, "Could not reset your password."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const loginPath = done.role === "AGENT" ? "/agent/login" : "/admin/login";
    return (
      <AuthCard title="Password changed" subtitle="You've been signed out on all devices.">
        <div className="alert alert-success">{done.message}</div>
        <Link className="btn btn-primary" to={loginPath} style={{ width: "100%", textAlign: "center" }}>
          Go to login
        </Link>
      </AuthCard>
    );
  }

  if (!token) {
    return (
      <AuthCard title="Reset link not valid" subtitle="Open the link from your email, or request a new one.">
        <Link className="btn btn-primary" to="/forgot-password" style={{ width: "100%", textAlign: "center" }}>
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="This signs you out on all devices. You'll then log in with your new password.">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-error">
            {error}
            {/expired|invalid/i.test(error) && (
              <div style={{ marginTop: 6 }}>
                <Link to="/forgot-password">Request a new link</Link>
              </div>
            )}
          </div>
        )}
        <label className="first" htmlFor="rp-new">New password</label>
        <PasswordInput id="rp-new" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
        <p className="hint" style={{ marginTop: 4 }}>At least 8 characters, with letters and numbers.</p>
        <label htmlFor="rp-confirm">Confirm new password</label>
        <PasswordInput id="rp-confirm" value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy} style={{ width: "100%", marginTop: 18 }}>
          {busy ? <span className="spinner" /> : "Save new password"}
        </button>
      </form>
    </AuthCard>
  );
}
