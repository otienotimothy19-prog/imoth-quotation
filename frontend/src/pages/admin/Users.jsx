import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"];

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "STAFF" });
  const canManage = me?.role === "SUPER_ADMIN";

  async function load() {
    try {
      const res = await api.get("/api/admin/users");
      setUsers(res.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser() {
    try {
      await api.post("/api/admin/users", form);
      setForm({ email: "", password: "", full_name: "", role: "STAFF" });
      setShowAdd(false);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function toggleActive(u) {
    await api.patch(`/api/admin/users/${u.id}`, { is_active: !u.is_active });
    load();
  }

  async function changeRole(u, role) {
    await api.patch(`/api/admin/users/${u.id}`, { role });
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>Admin Users</h1>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            + Add User
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!canManage && <div className="alert alert-info">Only Super Admins may manage users.</div>}

      {showAdd && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row2">
            <div>
              <label className="first">Full Name</label>
              <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <label className="first">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="row2">
            <div>
              <label>Temporary Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={createUser}>
            Create User
          </button>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>
                  {canManage ? (
                    <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} style={{ padding: 4, fontSize: 12 }}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    u.role
                  )}
                </td>
                <td>
                  <span className={`badge ${u.is_active ? "badge-green" : "badge-gray"}`}>{u.is_active ? "Active" : "Disabled"}</span>
                </td>
                {canManage && (
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>
                      {u.is_active ? "Disable" : "Enable"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
