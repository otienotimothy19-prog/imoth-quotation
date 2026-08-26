import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";

export default function Insurers() {
  const [insurers, setInsurers] = useState([]);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", disclaimer: "", note: "" });
  const [editingId, setEditingId] = useState(null);

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
    try {
      await api.post("/api/admin/insurers", form);
      setForm({ code: "", name: "", disclaimer: "", note: "" });
      setShowAdd(false);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function toggleActive(insurer) {
    await api.patch(`/api/admin/insurers/${insurer.id}`, { active: !insurer.active });
    load();
  }

  async function uploadLogo(insurer, file) {
    const fd = new FormData();
    fd.append("file", file);
    await api.post(`/api/admin/insurers/${insurer.id}/logo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    load();
  }

  async function saveEdit(insurer, patch) {
    await api.patch(`/api/admin/insurers/${insurer.id}`, patch);
    setEditingId(null);
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>Insurers</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
          + Add Insurer
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

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
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={createInsurer}>
            Save Insurer
          </button>
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
              <EditInsurerForm insurer={ins} onSave={(patch) => saveEdit(ins, patch)} onCancel={() => setEditingId(null)} />
            ) : (
              <>
                {ins.disclaimer && <p className="hint" style={{ marginTop: 10 }}>{ins.disclaimer}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(ins.id)}>
                    Edit
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(ins)}>
                    {ins.active ? "Disable" : "Activate"}
                  </button>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                    Upload Logo
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => e.target.files[0] && uploadLogo(ins, e.target.files[0])}
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditInsurerForm({ insurer, onSave, onCancel }) {
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
        <button className="btn btn-primary btn-sm" onClick={() => onSave({ name, disclaimer, note })}>
          Save
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
