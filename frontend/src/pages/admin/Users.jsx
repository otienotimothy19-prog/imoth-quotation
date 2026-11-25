import { useEffect, useState } from "react";
import { KeyRound, Lock, LogOut, Pencil, Power, Search, ShieldCheck, Unlock, UserCheck, UserPlus, Users as UsersIcon } from "lucide-react";
import { api, dateFmt, dateTimeFmt, errorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { ActionMenu, Avatar, ConfirmDialog, DataTable, Drawer, EmptyState, Field, IconInput, PageHeader, StatusBadge, humanize } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

const ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF", "AGENT"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_TONES = { SUPER_ADMIN: "navy", ADMIN: "blue", STAFF: "gray", AGENT: "amber" };

// A self-registered agent who has never been approved (and so never logged in).
const isPendingAgent = (u) => u.role === "AGENT" && !u.is_active && !u.last_login_at;
const isLocked = (u) => !!u.locked_until && new Date(u.locked_until) > new Date();

function passwordProblem(pw) {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use both letters and numbers.";
  return "";
}

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [drawer, setDrawer] = useState(null); // { mode: "add" | "edit" | "password", user? }
  const [form, setForm] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: "disable" | "revoke", user }
  const [busyId, setBusyId] = useState(null);
  const canManage = me?.role === "SUPER_ADMIN";

  async function load() {
    try {
      const res = await api.get("/api/admin/users");
      setUsers(res.data);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeSuperAdminCount = users.filter((u) => u.role === "SUPER_ADMIN" && u.is_active).length;
  const isLastActiveSuperAdmin = (u) => u.role === "SUPER_ADMIN" && u.is_active && activeSuperAdminCount <= 1;
  const pendingAgents = users.filter(isPendingAgent);

  const rows = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (statusFilter === "active" && !u.is_active) return false;
    if (statusFilter === "disabled" && (u.is_active || isPendingAgent(u))) return false;
    if (statusFilter === "pending" && !isPendingAgent(u)) return false;
    if (statusFilter === "locked" && !isLocked(u)) return false;
    const term = q.trim().toLowerCase();
    return !term || [u.full_name, u.email, u.phone].some((v) => (v || "").toLowerCase().includes(term));
  });

  async function act(u, fn, success, failure) {
    setBusyId(u.id);
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, failure));
      await load(); // re-sync the table with the server's actual state
    } finally {
      setBusyId(null);
    }
  }

  const changeRole = (u, role) => {
    if (u.id === me.id || role === u.role) return;
    if (isLastActiveSuperAdmin(u) && role !== "SUPER_ADMIN") {
      toast.error("Cannot demote the last active Super Admin.");
      return;
    }
    act(u, () => api.patch(`/api/admin/users/${u.id}`, { role }), `${u.full_name}'s role changed to ${humanize(role)}.`, "Could not change this user's role.");
  };
  const toggleActive = (u) =>
    act(u, () => api.patch(`/api/admin/users/${u.id}`, { is_active: !u.is_active }), `${u.full_name} ${u.is_active ? "disabled" : "enabled"}.`, "Could not update this user.")
      .finally(() => setConfirm(null));
  const approve = (u) => act(u, () => api.post(`/api/admin/users/${u.id}/approve`), `${u.full_name} approved. They can now log in to the agent app.`, "Could not approve this agent.");
  const unlock = (u) => act(u, () => api.post(`/api/admin/users/${u.id}/unlock`), `${u.full_name}'s account unlocked.`, "Could not unlock this account.");
  const revoke = (u) =>
    act(u, () => api.post(`/api/admin/users/${u.id}/revoke-sessions`), `${u.full_name} has been signed out on all devices.`, "Could not sign this user out.")
      .finally(() => setConfirm(null));

  function openDrawer(mode, u) {
    setFormErrors({});
    if (mode === "add") setForm({ full_name: "", email: "", password: "", role: "STAFF" });
    if (mode === "edit") setForm({ full_name: u.full_name });
    if (mode === "password") setForm({ password: "" });
    setDrawer({ mode, user: u });
  }

  async function saveDrawer() {
    const errs = {};
    if (drawer.mode !== "password" && (form.full_name || "").trim().length < 2) errs.full_name = "Enter the full name.";
    if (drawer.mode === "add" && !EMAIL_RE.test(form.email || "")) errs.email = "Enter a valid email address.";
    if (drawer.mode !== "edit") {
      const p = passwordProblem(form.password || "");
      if (p) errs.password = p;
    }
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      if (drawer.mode === "add") {
        await api.post("/api/admin/users", { ...form, full_name: form.full_name.trim(), email: form.email.trim() });
        toast.success(`${form.full_name.trim()} added. They'll choose their own password at first login.`);
      } else if (drawer.mode === "edit") {
        await api.patch(`/api/admin/users/${drawer.user.id}`, { full_name: form.full_name.trim() });
        toast.success("User updated.");
      } else {
        await api.patch(`/api/admin/users/${drawer.user.id}`, { password: form.password });
        toast.success(`Temporary password set for ${drawer.user.full_name}. They've been signed out and must choose a new password at next login.`);
      }
      setDrawer(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: "full_name", header: "User", sortable: true,
      render: (u) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 180 }}>
          <Avatar name={u.full_name} size={32} />
          <div className="cell-main">
            {u.full_name}
            {u.id === me?.id && <span className="hint" style={{ marginLeft: 6, fontWeight: 400 }}>(you)</span>}
          </div>
        </div>
      ),
    },
    { key: "email", header: "Email", sortable: true },
    { key: "phone", header: "Phone", render: (u) => u.phone || <span className="cell-sub">—</span> },
    {
      key: "role", header: "Role", sortable: true,
      render: (u) => {
        const isSelf = u.id === me?.id;
        const lastSuper = isLastActiveSuperAdmin(u);
        return canManage ? (
          <select
            aria-label={`Role for ${u.full_name}`}
            value={u.role}
            disabled={busyId === u.id || isSelf}
            title={isSelf ? "You cannot change your own role" : lastSuper ? "This is the last active Super Admin" : undefined}
            onChange={(e) => changeRole(u, e.target.value)}
            style={{ minHeight: 32, padding: "4px 8px", fontSize: 12.5, width: 140 }}
          >
            {ROLES.map((r) => <option key={r} value={r} disabled={lastSuper && r !== "SUPER_ADMIN"}>{humanize(r)}</option>)}
          </select>
        ) : <span className={`badge badge-${ROLE_TONES[u.role]} no-dot`}>{humanize(u.role)}</span>;
      },
    },
    {
      key: "status", header: "Status", sortable: true, sortValue: (u) => (isPendingAgent(u) ? 1 : u.is_active ? 0 : 2),
      render: (u) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {isPendingAgent(u) ? <StatusBadge status="PENDING" label="Pending approval" /> : <StatusBadge status={u.is_active ? "ACTIVE" : "DISABLED"} label={u.is_active ? "Active" : "Disabled"} />}
          {isLocked(u) && <span className="badge badge-red" title={`Locked until ${dateTimeFmt(u.locked_until)}`}>Locked</span>}
          {u.must_change_password && <span className="cell-sub" style={{ width: "100%" }}>Must set own password</span>}
        </div>
      ),
    },
    { key: "created_at", header: "Created", sortable: true, render: (u) => <span style={{ whiteSpace: "nowrap" }}>{dateFmt(u.created_at)}</span> },
    { key: "last_login_at", header: "Last Login", sortable: true, render: (u) => <span style={{ whiteSpace: "nowrap" }}>{u.last_login_at ? dateTimeFmt(u.last_login_at) : "Never"}</span> },
    {
      key: "actions", header: "", width: 48,
      render: (u) => {
        const isSelf = u.id === me?.id;
        const lastSuper = isLastActiveSuperAdmin(u);
        if (busyId === u.id) return <span className="spinner spinner-dark" />;
        return (
          <ActionMenu
            label={`Actions for ${u.full_name}`}
            items={[
              { label: "Approve agent", icon: UserCheck, hidden: !isPendingAgent(u), onClick: () => approve(u) },
              { label: "Unlock account", icon: Unlock, hidden: !isLocked(u), onClick: () => unlock(u) },
              { label: "Edit details", icon: Pencil, hidden: !canManage, onClick: () => openDrawer("edit", u) },
              { label: "Reset password", icon: KeyRound, hidden: !canManage || isSelf, onClick: () => openDrawer("password", u) },
              { label: "Sign out everywhere", icon: LogOut, hidden: !canManage || isSelf || !u.is_active, onClick: () => setConfirm({ kind: "revoke", user: u }) },
              u.is_active
                ? { label: "Disable", icon: Power, danger: true, hidden: !canManage, disabled: isSelf || lastSuper, onClick: () => setConfirm({ kind: "disable", user: u }) }
                : { label: "Enable", icon: Power, hidden: !canManage || isPendingAgent(u), onClick: () => toggleActive(u) },
            ]}
          />
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        description="Admin, staff and agent accounts, their roles and access."
        actions={canManage && <button type="button" className="btn btn-primary" onClick={() => openDrawer("add")}><UserPlus size={16} /> Add User</button>}
      />

      {error && <div className="alert alert-error">{error}</div>}
      {!canManage && <div className="alert alert-info"><Lock size={16} /> Only Super Admins may manage users. Admins can approve new agents and unlock accounts.</div>}

      {pendingAgents.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--c-red)" }}>
          <div className="card-title">
            <h2><ShieldCheck size={17} /> Agents awaiting approval <span className="badge badge-red no-dot">{pendingAgents.length}</span></h2>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {pendingAgents.map((u) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--c-border)" }}>
                <Avatar name={u.full_name} size={32} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div className="cell-main">{u.full_name}</div>
                  <div className="cell-sub">{u.email}{u.phone ? ` · ${u.phone}` : ""} · signed up {dateFmt(u.created_at)}</div>
                </div>
                <button type="button" className="btn btn-primary btn-sm" disabled={busyId === u.id} aria-busy={busyId === u.id} onClick={() => approve(u)}>
                  {busyId === u.id ? <span className="spinner" /> : <><UserCheck size={14} /> Approve</>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div className="filter-bar">
          <div className="grow">
            <label htmlFor="u-search">Search</label>
            <IconInput icon={Search}>
              <input id="u-search" type="text" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
            </IconInput>
          </div>
          <div>
            <label htmlFor="u-role">Role</label>
            <select id="u-role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="u-status">Status</label>
            <select id="u-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="pending">Pending approval</option>
              <option value="locked">Locked</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        minWidth={1100}
        empty={<EmptyState icon={UsersIcon} title={users.length ? "No users match" : "No users found."} />}
      />
      <div className="table-foot"><span>{rows.length} of {users.length} users</span></div>

      <Drawer
        open={!!drawer}
        title={drawer?.mode === "add" ? "Add user" : drawer?.mode === "edit" ? `Edit ${drawer.user.full_name}` : `Reset password for ${drawer?.user?.full_name}`}
        onClose={saving ? undefined : () => setDrawer(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setDrawer(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={saving} aria-busy={saving} onClick={saveDrawer}>
              {saving ? <span className="spinner" /> : drawer?.mode === "add" ? "Create user" : drawer?.mode === "edit" ? "Save changes" : "Set temporary password"}
            </button>
          </>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          {drawer?.mode !== "password" && (
            <Field label="Full name" required error={formErrors.full_name} htmlFor="u-name">
              <input id="u-name" type="text" value={form.full_name || ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
          )}
          {drawer?.mode === "add" && (
            <>
              <Field label="Email" required error={formErrors.email} htmlFor="u-email">
                <input id="u-email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Role" required htmlFor="u-new-role">
                <select id="u-new-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                </select>
              </Field>
            </>
          )}
          {drawer?.mode === "edit" && (
            <div className="hint">Email: {drawer.user.email}. Change the role from the table.</div>
          )}
          {drawer?.mode !== "edit" && (
            <Field
              label="Temporary password"
              required
              error={formErrors.password}
              hint="At least 8 characters with letters and numbers. The user must replace it at their next login."
              htmlFor="u-password"
            >
              <input id="u-password" type="password" autoComplete="new-password" value={form.password || ""} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          )}
          {drawer?.mode === "password" && (
            <div className="alert alert-info">This signs {drawer.user.full_name} out on all devices.</div>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === "revoke" ? `Sign ${confirm?.user.full_name} out everywhere?` : `Disable ${confirm?.user.full_name}'s account?`}
        message={confirm?.kind === "revoke"
          ? "They'll be signed out on every device and need to log in again with a login code."
          : "They will no longer be able to log in. You can enable the account again later."}
        confirmLabel={confirm?.kind === "revoke" ? "Sign out everywhere" : "Disable account"}
        danger
        busy={busyId === confirm?.user.id}
        onConfirm={() => (confirm.kind === "revoke" ? revoke(confirm.user) : toggleActive(confirm.user))}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
