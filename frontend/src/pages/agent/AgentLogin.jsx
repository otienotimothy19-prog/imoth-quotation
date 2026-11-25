import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { errorMessage } from "../../api/client";
import AuthCard, { PasswordInput } from "./AuthCard";
import OtpStep from "../../components/OtpStep";

export default function AgentLogin() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(null);

  if (ready && user) return <Navigate to={user.role === "AGENT" ? "/agent" : "/admin"} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await login(email, password);
      if (result.otpRequired) {
        setChallenge(result);
        setPassword("");
      } else {
        navigate(result.user.role === "AGENT" ? "/agent" : "/admin", { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err, "Invalid email or password."));
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <AuthCard title="Check your email" subtitle="One last step. You only need to do this once on this device.">
        <OtpStep
          challenge={challenge}
          onVerified={(u) => navigate(u.role === "AGENT" ? "/agent" : "/admin", { replace: true })}
          onCancel={() => setChallenge(null)}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Imoth Agent Login" subtitle="Log in once and you'll stay logged in on this device.">
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="first" htmlFor="agent-email">Email</label>
        <input id="agent-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <label htmlFor="agent-password">Password</label>
        <PasswordInput id="agent-password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 18 }}>
          {busy ? <span className="spinner" /> : "Log In"}
        </button>
      </form>
      <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
        New agent? <Link to="/agent/signup">Create an account</Link>
      </p>
    </AuthCard>
  );
}
