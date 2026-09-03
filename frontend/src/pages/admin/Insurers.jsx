import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export default function Insurers() {
  const [insurers, setInsurers] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", disclaimer: "", note: "" });
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null); // insurer id mid toggle/logo-upload

  async function load() {
    try {
      const res = await api.get("/api/admin/insurers");
      setInsurers(res.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createInsurer() {
    setError("");
    setStatus("");
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and Name are both required.");
      return;
    }
    setCreating(true);
    try {
      await api.post("/api/admin/insurers", form);
      setForm({ code: "", name: "", disclaimer: "", note: "" });
      setShowAdd(false);
      setStatus("Insurer added.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not create this insurer."));
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(insurer) {
    if (insurer.active && !window.confirm(`Disable ${insurer.name}? It will stop appearing as an option for new quotations. Existing quotations already generated with it are not affected.`)) {
      return;
    }
    setError("");
    setStatus("");
    setBusyId(insurer.id);
    try {
      await api.patch(`/api/admin/insurers/${insurer.id}`, { active: !insurer.active });
      setStatus(`${insurer.name} ${insurer.active ? "disabled" : "activated"}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not update this insurer."));
    } finally {
      setBusyId(null);
    }
  }

  async function uploadLogo(insurer, file) {
    setError("");
    setStatus("");
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setError("Logo must be a PNG, JPEG, WEBP or SVG image.");
      return;
    }
    if (file.size === 0) {
      setError("The selected file appears to be empty.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be under 2MB.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setBusyId(insurer.id);
    try {
      await api.post(`/api/admin/insurers/${insurer.id}/logo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setStatus("Logo uploaded.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not upload the logo."));
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(insurer, patch) {
    setError("");
    setStatus("");
    if (!patch.name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusyId(insurer.id);
    try {
      await api.patch(`/api/admin/insurers/${insurer.id}`, patch);
      setEditingId(null);
      setStatus("Insurer updated.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not save changes."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>Insurers</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowAdd((v) => !v);
            setError("");
          }}
        >
          + Add Insurer
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {status && <div className="alert alert-success">{status}</div>}

      {showAdd && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row2">
            <div>
              <label className="first">Code (unique, lowercase)</label>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })} />
            </div>
            <div>
              <label className="first">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <label>Disclaimer (optional)</label>
          <input type="text" value={form.disclaimer} onChange={(e) => setForm({ ...form, disclaimer: e.target.value })} />
          <label>Note (optional)</label>
          <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary" disabled={creating} aria-busy={creating} onClick={createInsurer}>
              {creating ? <span className="spinner" /> : "Save Insurer"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={creating} onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {insurers.map((ins) => (
          <div key={ins.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontSize: 14 }}>{ins.name}</h3>
                <div className="hint">{ins.code}</div>
              </div>
              <span className={`badge ${ins.active ? "badge-green" : "badge-gray"}`}>{ins.active ? "Active" : "Disabled"}</span>
            </div>

            {editingId === ins.id ? (
              <EditInsurerForm insurer={ins} busy={busyId === ins.id} onSave={(patch) => saveEdit(ins, patch)} onCancel={() => setEditingId(null)} />
            ) : (
              <>
                {ins.disclaimer && <p className="hint" style={{ marginTop: 10 }}>{ins.disclaimer}</p>}
                {ins.logo_path && (
                  <div className="hint" style={{ marginTop: 6 }}>
                    ✓ Logo uploaded
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === ins.id} onClick={() => setEditingId(ins.id)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busyId === ins.id} aria-busy={busyId === ins.id} onClick={() => toggleActive(ins)}>
                    {busyId === ins.id ? <span className="spinner spinner-dark" /> : ins.active ? "Disable" : "Activate"}
                  </button>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: busyId === ins.id ? "not-allowed" : "pointer", opacity: busyId === ins.id ? 0.55 : 1 }}>
                    Upload Logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      style={{ display: "none" }}
                      disabled={busyId === ins.id}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        e.target.value = "";
                        if (file) uploadLogo(ins, file);
                      }}
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        ))}
        {insurers.length === 0 && <p className="hint">No insurers yet.</p>}
      </div>
    </div>
  );
}

function EditInsurerForm({ insurer, busy, onSave, onCancel }) {
  const [name, setName] = useState(insurer.name);
  const [disclaimer, setDisclaimer] = useState(insurer.disclaimer || "");
  const [note, setNote] = useState(insurer.note || "");
  return (
    <div style={{ marginTop: 10 }}>
      <label className="first">Name</label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      <label>Disclaimer</label>
      <input type="text" value={disclaimer} onChange={(e) => setDisclaimer(e.target.value)} />
      <label>Note</label>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy} onClick={() => onSave({ name, disclaimer, note })}>
          {busy ? <span className="spinner" /> : "Save"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
