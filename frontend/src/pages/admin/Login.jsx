import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { errorMessage } from "../../api/client";

export default function AdminLogin() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to="/admin/dashboard" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/admin/dashboard");
    } catch (err) {
      setError(errorMessage(err, "Invalid email or password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg,#1b3f8b 0%,#142f68 100%)",
      }}
    >
      <form onSubmit={handleSubmit} className="card" style={{ width: 380, borderTop: "5px solid var(--imoth-red)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div
            style={{
              width: 48,
              height: 48,
              margin: "0 auto 10px",
              borderRadius: 8,
              background: "var(--imoth-blue)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
            }}
          >
            IM
          </div>
          <h1 style={{ fontSize: 17, color: "var(--imoth-blue)" }}>Imoth Admin Panel</h1>
          <p className="hint">Motor Quotation &amp; Risk Note System</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <label className="first">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <label>Password</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />

        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 18 }}>
          {busy ? <span className="spinner" /> : "Log In"}
        </button>
      </form>
    </div>
  );
}
