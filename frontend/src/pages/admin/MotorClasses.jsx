import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../api/client";

const CATEGORIES = ["private", "commercial", "institutional", "psv", "tuktuk", "motorcycle", "asset", "special", "tpo"];

function validateClassForm(form) {
  if (!form.code.trim()) return "Code is required.";
  if (!form.label.trim()) return "Label is required.";
  if (!form.category) return "Category is required.";
  if (form.max_age !== "" && (Number.isNaN(Number(form.max_age)) || Number(form.max_age) < 0)) {
    return "Max Age must be a non-negative number.";
  }
  if (form.min_si !== "" && (Number.isNaN(Number(form.min_si)) || Number(form.min_si) < 0)) {
    return "Min Sum Insured must be a non-negative number.";
  }
  if (form.max_si !== "" && (Number.isNaN(Number(form.max_si)) || Number(form.max_si) < 0)) {
    return "Max Sum Insured must be a non-negative number.";
  }
  if (form.max_si !== "" && form.min_si !== "" && Number(form.max_si) < Number(form.min_si)) {
    return "Max Sum Insured cannot be less than Min Sum Insured.";
  }
  return "";
}

export default function MotorClasses() {
  const [insurers, setInsurers] = useState([]);
  const [insurerId, setInsurerId] = useState("");
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", label: "", category: "private", max_age: "", min_si: 0, max_si: "" });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function loadInsurers() {
    const res = await api.get("/api/admin/insurers");
    setInsurers(res.data);
  }
  async function loadClasses() {
    setError("");
    setLoading(true);
    try {
      const params = insurerId ? { insurer_id: insurerId } : {};
      const res = await api.get("/api/admin/motor-classes", { params });
      setClasses(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
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
    if (cls.active && !window.confirm(`Disable "${cls.label}"? It will stop appearing for new quotations. Existing quotations are not affected.`)) {
      return;
    }
    setError("");
    setStatus("");
    setBusyId(cls.id);
    try {
      await api.patch(`/api/admin/motor-classes/${cls.id}`, { active: !cls.active });
      setStatus(`${cls.label} ${cls.active ? "disabled" : "activated"}.`);
      await loadClasses();
    } catch (err) {
      setError(errorMessage(err, "Could not update this class."));
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(cls) {
    setEditingId(cls.id);
    setEditForm({
      code: cls.code,
      label: cls.label,
      category: cls.category,
      max_age: cls.max_age ?? "",
      min_si: cls.min_si ?? 0,
      max_si: cls.max_si ?? "",
    });
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function saveEdit(clsId) {
    const validationError = validateClassForm(editForm);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setStatus("");
    setBusyId(clsId);
    try {
      await api.patch(`/api/admin/motor-classes/${clsId}`, {
        label: editForm.label,
        category: editForm.category,
        max_age: editForm.max_age === "" ? null : Number(editForm.max_age),
        min_si: Number(editForm.min_si) || 0,
        max_si: editForm.max_si === "" ? null : Number(editForm.max_si),
      });
      cancelEdit();
      setStatus("Class updated.");
      await loadClasses();
    } catch (err) {
      setError(errorMessage(err, "Could not save changes."));
    } finally {
      setBusyId(null);
    }
  }

  async function createClass() {
    setError("");
    setStatus("");
    if (!insurerId) return setError("Select an insurer first.");
    const validationError = validateClassForm(form);
    if (validationError) return setError(validationError);

    setCreating(true);
    try {
      await api.post("/api/admin/motor-classes", {
        insurer_id: insurerId,
        code: form.code,
        label: form.label,
        category: form.category,
        max_age: form.max_age === "" ? null : Number(form.max_age),
        min_si: Number(form.min_si) || 0,
        max_si: form.max_si === "" ? null : Number(form.max_si),
      });
      setShowAdd(false);
      setForm({ code: "", label: "", category: "private", max_age: "", min_si: 0, max_si: "" });
      setStatus("Motor class created.");
      await loadClasses();
    } catch (err) {
      setError(errorMessage(err, "Could not create this class."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>Motor Classes</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowAdd((v) => !v);
            setError("");
          }}
        >
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
      {status && <div className="alert alert-success">{status}</div>}

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
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary" disabled={creating} aria-busy={creating} onClick={createClass}>
              {creating ? <span className="spinner" /> : "Save Class"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={creating} onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
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
              {classes.map((c) =>
                editingId === c.id ? (
                  <tr key={c.id}>
                    <td>{c.insurer_name}</td>
                    <td>
                      <input type="text" value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} style={{ minWidth: 220 }} />
                    </td>
                    <td>
                      <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={editForm.max_age}
                        placeholder="no limit"
                        onChange={(e) => setEditForm({ ...editForm, max_age: e.target.value })}
                        style={{ width: 90 }}
                      />
                    </td>
                    <td style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="number"
                        value={editForm.min_si}
                        onChange={(e) => setEditForm({ ...editForm, min_si: e.target.value })}
                        style={{ width: 100 }}
                        title="Min Sum Insured"
                      />
                      <input
                        type="number"
                        value={editForm.max_si}
                        placeholder="open"
                        onChange={(e) => setEditForm({ ...editForm, max_si: e.target.value })}
                        style={{ width: 100 }}
                        title="Max Sum Insured (blank = open)"
                      />
                    </td>
                    <td>
                      <span className={`badge ${c.active ? "badge-green" : "badge-gray"}`}>{c.active ? "Active" : "Disabled"}</span>
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn btn-primary btn-sm" disabled={busyId === c.id} aria-busy={busyId === c.id} onClick={() => saveEdit(c.id)}>
                        {busyId === c.id ? <span className="spinner" /> : "Save"}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busyId === c.id} onClick={cancelEdit}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id}>
                    <td>{c.insurer_name}</td>
                    <td>
                      {c.label}
                      {!c.active && <span className="hint" style={{ marginLeft: 6 }}>(inactive)</span>}
                    </td>
                    <td>{c.category}</td>
                    <td>{c.max_age ?? "—"}</td>
                    <td>
                      {c.flat_only
                        ? "Flat rate"
                        : `${Number(c.min_si).toLocaleString()}${c.max_si ? " – " + Number(c.max_si).toLocaleString() : "+"}`}
                    </td>
                    <td>
                      <span className={`badge ${c.active ? "badge-green" : "badge-gray"}`}>{c.active ? "Active" : "Disabled"}</span>
                    </td>
                    <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === c.id} onClick={() => startEdit(c)}>
                        Edit
                      </button>
                      <Link className="btn btn-secondary btn-sm" to={`/admin/rates?motor_class_id=${c.id}`}>
                        {c.flat_only ? "Flat Rate" : "Rates"}
                      </Link>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === c.id}
                        aria-busy={busyId === c.id}
                        onClick={() => toggleActive(c)}
                      >
                        {busyId === c.id ? <span className="spinner spinner-dark" /> : c.active ? "Disable" : "Activate"}
                      </button>
                    </td>
                  </tr>
                )
              )}
              {!loading && classes.length === 0 && (
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
