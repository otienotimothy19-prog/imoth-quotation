import { useState } from "react";
import InstallAppButton from "../../components/InstallAppButton";

// Shared frame for the agent login and sign-up screens.
export default function AuthCard({ title, subtitle, children }) {
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
      <div className="card" style={{ width: "100%", maxWidth: 400, borderTop: "5px solid var(--imoth-red)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src="/icon-192.png" alt="Imoth" width="56" height="56" style={{ borderRadius: 10, marginBottom: 8 }} />
          <h1 style={{ fontSize: 17, color: "var(--imoth-blue)" }}>{title}</h1>
          {subtitle && <p className="hint">{subtitle}</p>}
        </div>
        {children}
        <div style={{ marginTop: 16 }}>
          <InstallAppButton block className="btn btn-ghost" />
        </div>
      </div>
    </div>
  );
}

export function PasswordInput({ value, onChange, autoComplete, id }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        type={visible ? "text" : "password"}
        required
        minLength={8}
        value={value}
        autoComplete={autoComplete}
        onChange={onChange}
        style={{ paddingRight: 56 }}
      />
      <button
        type="button"
        className="hint"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
