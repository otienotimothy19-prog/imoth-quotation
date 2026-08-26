import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../api/client";

const CATEGORIES = ["private", "commercial", "institutional", "psv", "tuktuk", "motorcycle", "asset", "special", "tpo"];

export default function MotorClasses() {
  const [insurers, setInsurers] = useState([]);
  const [insurerId, setInsurerId] = useState("");
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", label: "", category: "private", max_age: "", min_si: 0, max_si: "" });

  async function loadInsurers() {
    const res = await api.get("/api/admin/insurers");
    setInsurers(res.data);
  }
  async function loadClasses() {
    try {
      const params = insurerId ? { insurer_id: insurerId } : {};
      const res = await api.get("/api/admin/motor-classes", { params });
      setClasses(res.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    loadInsurers();
  }, []);
  useEffect(() => {
    loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insurerId]);

  async function toggleActive(cls) {
    await api.patch(`/api/admin/motor-classes/${cls.id}`, { active: !cls.active });
    loadClasses();
  }

  async function createClass() {
    if (!insurerId) return setError("Select an insurer first");
    try {
      await api.post("/api/admin/motor-classes", {
        insurer_id: insurerId,
        code: form.code,
        label: form.label,
        category: form.category,
        max_age: form.max_age ? Number(form.max_age) : null,
        min_si: Number(form.min_si) || 0,
        max_si: form.max_si ? Number(form.max_si) : null,
      });
      setShowAdd(false);
      setForm({ code: "", label: "", category: "private", max_age: "", min_si: 0, max_si: "" });
      loadClasses();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>Motor Classes</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
          + Add Class
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="first">Filter by Insurer</label>
        <select value={insurerId} onChange={(e) => setInsurerId(e.target.value)}>
          <option value="">All Insurers</option>
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showAdd && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="hint" style={{ marginBottom: 10 }}>Adding a class for: {insurers.find((i) => i.id === insurerId)?.name || "(select insurer above)"}</div>
          <div className="row2">
            <div>
              <label className="first">Code (unique per insurer)</label>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <label className="first">Label</label>
              <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
          </div>
          <div className="row2">
            <div>
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Max Age (blank = no limit)</label>
              <input type="number" value={form.max_age} onChange={(e) => setForm({ ...form, max_age: e.target.value })} />
            </div>
          </div>
          <div className="row2">
            <div>
              <label>Min Sum Insured</label>
              <input type="number" value={form.min_si} onChange={(e) => setForm({ ...form, min_si: e.target.value })} />
            </div>
            <div>
              <label>Max Sum Insured (blank = open)</label>
              <input type="number" value={form.max_si} onChange={(e) => setForm({ ...form, max_si: e.target.value })} />
            </div>
          </div>
          <div className="hint">After creating the class, configure its rate bands under Admin → Rates.</div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={createClass}>
            Save Class
          </button>
        </div>
      )}

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Insurer</th>
                <th>Label</th>
                <th>Category</th>
                <th>Max Age</th>
                <th>Min SI</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <td>{c.insurer_name}</td>
                  <td>{c.label}</td>
                  <td>{c.category}</td>
                  <td>{c.max_age ?? "—"}</td>
                  <td>{c.flat_only ? "Flat rate" : Number(c.min_si).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${c.active ? "badge-green" : "badge-gray"}`}>{c.active ? "Active" : "Disabled"}</span>
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    {!c.flat_only && (
                      <Link className="btn btn-secondary btn-sm" to={`/admin/rates?motor_class_id=${c.id}`}>
                        Rates
                      </Link>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(c)}>
                      {c.active ? "Disable" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
              {classes.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--muted)" }}>
                    No classes found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
