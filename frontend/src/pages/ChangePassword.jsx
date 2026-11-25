import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../api/client";
import { PasswordInput } from "./agent/AuthCard";

const homeFor = (role) => (role === "AGENT" ? "/agent" : role === "STAFF" ? "/admin/quotations/new" : "/admin/dashboard");

// Change your own password. Required (and the only screen available) while
// an account still has a temporary password set by an admin.
export default function ChangePassword() {
  const { user, ready, changePassword, logout, logoutAll } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  if (!ready) return null;
  if (!user) return <Navigate to="/admin/login" replace />;
  const forced = !!user.must_change_password;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
      return setError("Use at least 8 characters with both letters and numbers.");
    }
    if (next !== confirm) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      const updated = await changePassword(current, next);
      navigate(homeFor(updated.role), { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      setError(errorMessage(err, "Could not change your password."));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogoutAll() {
    if (!window.confirm("Sign out on every device, including this one?")) return;
    setSigningOutAll(true);
    try {
      await logoutAll();
    } catch (err) {
      setError(errorMessage(err, "Could not sign out other devices."));
      setSigningOutAll(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "linear-gradient(180deg,#1b3f8b 0%,#142f68 100%)",
      }}
    >
      <form onSubmit={handleSubmit} className="card" style={{ width: "100%", maxWidth: 400, borderTop: "5px solid var(--imoth-red)" }}>
        <h1 style={{ fontSize: 17, color: "var(--imoth-blue)", textAlign: "center" }}>
          {forced ? "Choose your own password" : "Change password"}
        </h1>
        <p className="hint" style={{ textAlign: "center", marginBottom: 16 }}>
          {forced
            ? "Your current password was set for you. Please replace it before continuing."
            : `Signed in as ${user.email}. Changing your password signs you out on all other devices.`}
        </p>
        {error && <div className="alert alert-error">{error}</div>}

        <label className="first" htmlFor="cp-current">Current password</label>
        <PasswordInput id="cp-current" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
        <label htmlFor="cp-new">New password</label>
        <PasswordInput id="cp-new" value={next} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
        <p className="hint" style={{ marginTop: 4 }}>At least 8 characters, with letters and numbers.</p>
        <label htmlFor="cp-confirm">Confirm new password</label>
        <PasswordInput id="cp-confirm" value={confirm} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />

        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 18 }}>
          {busy ? <span className="spinner" /> : "Save new password"}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, gap: 8, flexWrap: "wrap" }}>
          {forced ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>
          ) : (
            <Link className="btn btn-ghost btn-sm" to={homeFor(user.role)}>← Back</Link>
          )}
          <button type="button" className="btn btn-ghost btn-sm" disabled={signingOutAll} onClick={handleLogoutAll}>
            {signingOutAll ? <span className="spinner spinner-dark" /> : "Sign out all devices"}
          </button>
        </div>
      </form>
    </div>
  );
}
