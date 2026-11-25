import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../api/client";

const RESEND_COOLDOWN = 30;

// Second login step: the 6-digit code emailed after a correct password.
// Calls onVerified(user) once the session has started.
export default function OtpStep({ challenge, onVerified, onCancel }) {
  const { verifyOtp, resendOtp } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      onVerified(await verifyOtp(challenge.challengeId, code.replace(/\s/g, "")));
    } catch (err) {
      setError(errorMessage(err, "That code didn't work. Please try again."));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError("");
    setNotice("");
    try {
      await resendOtp(challenge.challengeId);
      setNotice("A new code has been sent. Earlier codes no longer work.");
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(errorMessage(err, "Could not send a new code."));
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="alert alert-info" style={{ fontSize: 13 }}>
        We emailed a 6-digit login code to <strong>{challenge.emailHint}</strong>. It expires in{" "}
        {Math.round((challenge.expiresInSeconds || 600) / 60)} minutes.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <label className="first" htmlFor="otp-code">Login code</label>
      <input
        id="otp-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
        style={{ letterSpacing: 6, fontSize: 20, textAlign: "center", fontWeight: 700 }}
        placeholder="••••••"
      />

      <button className="btn btn-primary" type="submit" disabled={busy || code.replace(/\s/g, "").length !== 6} style={{ width: "100%", marginTop: 18 }}>
        {busy ? <span className="spinner" /> : "Verify and log in"}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          ← Back
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={cooldown > 0} onClick={handleResend}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
