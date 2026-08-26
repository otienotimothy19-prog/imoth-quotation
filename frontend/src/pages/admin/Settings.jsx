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

export default function Settings() {
  const { user } = useAuth();
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const canEdit = user?.role === "SUPER_ADMIN";

  async function load() {
    try {
      const res = await api.get("/api/admin/settings");
      setValues(res.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setStatus("");
    setError("");
    try {
      const payload = {};
      for (const [key] of FIELDS) payload[key] = values[key];
      await api.put("/api/admin/settings", { values: payload });
      setStatus("Settings saved.");
    } catch (err) {
      setError(errorMessage(err));
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
                onChange={(e) => setValues({ ...values, [key]: type === "number" ? Number(e.target.value) : e.target.value })}
              />
            )}
          </div>
        ))}
        {canEdit && (
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={save}>
            Save Settings
          </button>
        )}
      </div>
    </div>
  );
}
