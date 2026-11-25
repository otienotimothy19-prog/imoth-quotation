import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF", "AGENT"];

// A self-registered agent who has never been approved (and so never logged in).
const isPendingAgent = (u) => u.role === "AGENT" && !u.is_active && !u.last_login_at;
const isLocked = (u) => !!u.locked_until && new Date(u.locked_until) > new Date();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "STAFF" });
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
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

  const activeSuperAdminCount = users.filter((u) => u.role === "SUPER_ADMIN" && u.is_active).length;
  const isLastActiveSuperAdmin = (u) => u.role === "SUPER_ADMIN" && u.is_active && activeSuperAdminCount <= 1;

  async function createUser() {
    setError("");
    setStatus("");
    if (!form.full_name.trim()) return setError("Full name is required.");
    if (!EMAIL_RE.test(form.email)) return setError("Enter a valid email address.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (!ROLES.includes(form.role)) return setError("Select a role.");

    setCreating(true);
    try {
      await api.post("/api/admin/users", form);
      setForm({ email: "", password: "", full_name: "", role: "STAFF" });
      setShowAdd(false);
      setStatus("User created.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not create this user."));
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(u) {
    if (u.id === me.id) return; // self-protection: button is disabled, this is a backstop
    if (isLastActiveSuperAdmin(u)) return;
    if (u.is_active && !window.confirm(`Disable ${u.full_name}'s account? They will no longer be able to log in.`)) {
      return;
    }
    setError("");
    setStatus("");
    setBusyId(u.id);
    try {
      await api.patch(`/api/admin/users/${u.id}`, { is_active: !u.is_active });
      setStatus(`${u.full_name} ${u.is_active ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not update this user."));
      await load(); // resync the displayed status with the server's actual state
    } finally {
      setBusyId(null);
    }
  }

  async function approveAgent(u) {
    setError("");
    setStatus("");
    setBusyId(u.id);
    try {
      await api.post(`/api/admin/users/${u.id}/approve`);
      setStatus(`${u.full_name} approved. They can now log in to the agent app.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not approve this agent."));
    } finally {
      setBusyId(null);
    }
  }

  const pendingAgents = users.filter(isPendingAgent);

  async function securityAction(u, action) {
    const labels = {
      unlock: { url: "unlock", done: `${u.full_name}'s account unlocked.` },
      revoke: { url: "revoke-sessions", done: `${u.full_name} has been signed out on all devices.` },
    };
    if (action === "revoke" && !window.confirm(`Sign ${u.full_name} out on every device? They'll need to log in again (with a login code).`)) return;
    setError("");
    setStatus("");
    setBusyId(u.id);
    try {
      await api.post(`/api/admin/users/${u.id}/${labels[action].url}`);
      setStatus(labels[action].done);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not update this user."));
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(u, role) {
    if (u.id === me.id || role === u.role) return;
    if (isLastActiveSuperAdmin(u) && role !== "SUPER_ADMIN") {
      setError("Cannot demote the last active Super Admin.");
      return;
    }
    setError("");
    setStatus("");
    setBusyId(u.id);
    try {
      await api.patch(`/api/admin/users/${u.id}`, { role });
      setStatus(`${u.full_name}'s role changed to ${role.replace("_", " ")}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not change this user's role."));
      await load(); // the <select> is bound to server state, so this restores the prior value on failure
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>Admin Users</h1>
        {canManage && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setShowAdd((v) => !v);
              setError("");
            }}
          >
            + Add User
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {status && <div className="alert alert-success">{status}</div>}
      {!canManage && <div className="alert alert-info">Only Super Admins may manage users. Admins can approve new agents.</div>}

      {pendingAgents.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--imoth-red)" }}>
          <h2 style={{ fontSize: 15, color: "var(--imoth-blue)", marginBottom: 10 }}>
            Agents awaiting approval ({pendingAgents.length})
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Signed up</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingAgents.map((u) => (
                  <tr key={u.id}>
                    <td>{u.full_name}</td>
                    <td>{u.email}</td>
                    <td>{u.phone || "—"}</td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString("en-GB") : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busyId === u.id}
                        aria-busy={busyId === u.id}
                        onClick={() => approveAgent(u)}
                      >
                        {busyId === u.id ? <span className="spinner" /> : "Approve"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              <label>Temporary Password (min. 8 characters)</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} />
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
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary" disabled={creating} aria-busy={creating} onClick={createUser}>
              {creating ? <span className="spinner" /> : "Create User"}
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
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === me?.id;
                const lastSuperAdmin = isLastActiveSuperAdmin(u);
                return (
                  <tr key={u.id}>
                    <td>
                      {u.full_name}
                      {isSelf && <span className="hint" style={{ marginLeft: 6 }}>(you)</span>}
                    </td>
                    <td>{u.email}</td>
                    <td>{u.phone || "—"}</td>
                    <td>
                      {canManage ? (
                        <select
                          value={u.role}
                          disabled={busyId === u.id || isSelf}
                          title={isSelf ? "You cannot change your own role" : lastSuperAdmin ? "This is the last active Super Admin" : undefined}
                          onChange={(e) => changeRole(u, e.target.value)}
                          style={{ padding: 4, fontSize: 12, minHeight: "auto" }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r} disabled={lastSuperAdmin && r !== "SUPER_ADMIN"}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        u.role
                      )}
                    </td>
                    <td>
                      {isPendingAgent(u) ? (
                        <span className="badge badge-amber">Pending approval</span>
                      ) : (
                        <span className={`badge ${u.is_active ? "badge-green" : "badge-gray"}`}>{u.is_active ? "Active" : "Disabled"}</span>
                      )}
                      {isLocked(u) && (
                        <span className="badge badge-red" style={{ marginLeft: 6 }} title={`Locked until ${new Date(u.locked_until).toLocaleTimeString()}`}>
                          Locked
                        </span>
                      )}
                      {u.must_change_password && <div className="hint" style={{ marginTop: 4 }}>Must set own password</div>}
                      {isLocked(u) && (
                        <div style={{ marginTop: 6 }}>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busyId === u.id} onClick={() => securityAction(u, "unlock")}>
                            Unlock
                          </button>
                        </div>
                      )}
                    </td>
                    {canManage && (
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busyId === u.id || isSelf || (u.is_active && lastSuperAdmin)}
                          aria-busy={busyId === u.id}
                          title={
                            isSelf
                              ? "You cannot disable your own account"
                              : u.is_active && lastSuperAdmin
                              ? "This is the last active Super Admin"
                              : undefined
                          }
                          onClick={() => toggleActive(u)}
                        >
                          {busyId === u.id ? <span className="spinner spinner-dark" /> : u.is_active ? "Disable" : "Enable"}
                        </button>
                        {!isSelf && u.is_active && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ marginLeft: 6 }}
                            disabled={busyId === u.id}
                            title="End this user's sessions on every device"
                            onClick={() => securityAction(u, "revoke")}
                          >
                            Sign out everywhere
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 6 : 5} style={{ textAlign: "center", color: "var(--muted)" }}>
                    No users found.
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
