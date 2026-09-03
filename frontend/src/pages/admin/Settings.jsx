import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const FIELDS = [
  ["company.name", "Company Name", "text"],
  ["company.tagline", "Tagline", "text"],
  ["company.address", "Address", "text"],
  ["company.phone", "Phone", "text"],
  ["company.email", "Email", "text"],
  ["company.paybill", "Paybill Number", "text"],
  ["quotation.validity_days", "Quotation Validity (days)", "number"],
  ["levy.rate", "Levy Rate (e.g. 0.0045 = 0.45%)", "number"],
  ["levy.stamp_duty", "Stamp Duty (Kshs, flat)", "number"],
  ["pdf.footer_text", "PDF Footer Text", "textarea"],
];

// Mirrors the backend's _NUMERIC_SETTING_RANGES so a bad value is caught
// before the round trip, not just after a 422 comes back.
const NUMERIC_RANGES = {
  "quotation.validity_days": [1, 365],
  "levy.rate": [0, 1],
  "levy.stamp_duty": [0, null],
};

export default function Settings() {
  const { user } = useAuth();
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role === "SUPER_ADMIN";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/admin/settings");
      setValues(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function validate() {
    for (const [key, [lo, hi]] of Object.entries(NUMERIC_RANGES)) {
      const v = values[key];
      if (v === undefined || v === null || v === "") continue;
      if (typeof v !== "number" || Number.isNaN(v)) return `${key} must be a number.`;
      if (lo !== null && v < lo) return `${key} must be at least ${lo}.`;
      if (hi !== null && v > hi) return `${key} must be at most ${hi}.`;
    }
    return "";
  }

  async function save() {
    setStatus("");
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const payload = {};
      for (const [key] of FIELDS) payload[key] = values[key];
      await api.put("/api/admin/settings", { values: payload });
      setStatus("Settings saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, color: "var(--imoth-blue)", marginBottom: 16 }}>Settings</h1>
      <p className="hint" style={{ marginBottom: 16 }}>
        SMTP credentials and database configuration are managed via environment variables on the server and are not
        editable here.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {status && <div className="alert alert-success">{status}</div>}
      {!canEdit && <div className="alert alert-info">Only Super Admins may edit settings. You can view them below.</div>}

      {loading ? (
        <div className="card">Loading…</div>
      ) : (
        <div className="card" style={{ maxWidth: 640 }}>
          {FIELDS.map(([key, label, type]) => (
            <div key={key}>
              <label className="first">{label}</label>
              {type === "textarea" ? (
                <textarea
                  rows={3}
                  disabled={!canEdit}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                />
              ) : (
                <input
                  type={type}
                  step={type === "number" ? "any" : undefined}
                  disabled={!canEdit}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues({ ...values, [key]: type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })}
                />
              )}
            </div>
          ))}
          {canEdit && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={saving} aria-busy={saving} onClick={save}>
              {saving ? <span className="spinner" /> : "Save Settings"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
