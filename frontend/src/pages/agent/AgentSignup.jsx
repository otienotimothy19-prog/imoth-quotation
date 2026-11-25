import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { errorMessage, fieldErrors } from "../../api/client";
import AuthCard, { PasswordInput } from "./AuthCard";

const EMPTY = { full_name: "", email: "", phone: "", password: "", confirm: "" };

export default function AgentSignup() {
  const { user, ready, signupAgent } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [fields, setFields] = useState({});
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={user.role === "AGENT" ? "/agent" : "/admin"} replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setFields({});
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
      return setError("Use at least 8 characters with both letters and numbers.");
    }
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const { full_name, email, phone, password } = form;
      setDone(await signupAgent({ full_name, email, phone, password }));
    } catch (err) {
      setFields(fieldErrors(err));
      setError(errorMessage(err, "Could not create your account."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="Account created" subtitle="Imoth Agent">
        <div className="alert alert-success">{done}</div>
        <Link className="btn btn-primary" to="/agent/login" style={{ width: "100%", textAlign: "center" }}>
          Go to login
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Become an Imoth Agent" subtitle="Create your account. Imoth approves new agents before their first login.">
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="first" htmlFor="su-name">Full name</label>
        <input id="su-name" type="text" required minLength={2} autoComplete="name" value={form.full_name} onChange={set("full_name")} autoFocus />
        {fields.full_name && <div className="field-error">{fields.full_name}</div>}
        <label htmlFor="su-email">Email</label>
        <input id="su-email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
        {fields.email && <div className="field-error">{fields.email}</div>}
        <label htmlFor="su-phone">Phone number</label>
        <input id="su-phone" type="tel" required minLength={7} autoComplete="tel" placeholder="07XX XXX XXX" value={form.phone} onChange={set("phone")} />
        {fields.phone && <div className="field-error">{fields.phone}</div>}
        <label htmlFor="su-password">Password (8+ characters, letters and numbers)</label>
        <PasswordInput id="su-password" value={form.password} autoComplete="new-password" onChange={set("password")} />
        <label htmlFor="su-confirm">Confirm password</label>
        <PasswordInput id="su-confirm" value={form.confirm} autoComplete="new-password" onChange={set("confirm")} />
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 18 }}>
          {busy ? <span className="spinner" /> : "Create account"}
        </button>
      </form>
      <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
        Already have an account? <Link to="/agent/login">Log in</Link>
      </p>
    </AuthCard>
  );
}
