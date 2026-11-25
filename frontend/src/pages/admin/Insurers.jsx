import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, CheckCircle2, ImagePlus, Pencil, Plus, Power, Search } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { ActionMenu, Avatar, ConfirmDialog, DataTable, Drawer, EmptyState, Field, IconInput, PageHeader, StatusBadge } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const EMPTY_FORM = { code: "", name: "", disclaimer: "", note: "" };

export default function Insurers() {
  const toast = useToast();
  const [insurers, setInsurers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [drawer, setDrawer] = useState(null); // { mode: "add" } | { mode: "edit", insurer }
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // insurer to toggle
  const [busyId, setBusyId] = useState(null);
  const fileRef = useRef(null);
  const logoTarget = useRef(null);

  async function load() {
    try {
      const [ins, cls] = await Promise.all([api.get("/api/admin/insurers"), api.get("/api/admin/motor-classes")]);
      setInsurers(ins.data);
      setClasses(cls.data);
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

  // Classes and rate bands per insurer, for the "supported" columns.
  const coverage = useMemo(() => {
    const out = {};
    for (const c of classes) {
      const row = (out[c.insurer_id] ||= { classes: 0, active: 0, bands: 0 });
      row.classes += 1;
      if (c.active) row.active += 1;
      row.bands += (c.bands?.length || 0) + (c.bands_alt?.length || 0) + (c.flat_only ? 1 : 0);
    }
    return out;
  }, [classes]);

  const rows = insurers.filter((i) => {
    if (statusFilter === "active" && !i.active) return false;
    if (statusFilter === "inactive" && i.active) return false;
    const term = q.trim().toLowerCase();
    return !term || i.name.toLowerCase().includes(term) || i.code.toLowerCase().includes(term);
  });

  function openAdd() {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setDrawer({ mode: "add" });
  }

  function openEdit(insurer) {
    setForm({ code: insurer.code, name: insurer.name, disclaimer: insurer.disclaimer || "", note: insurer.note || "" });
    setFormErrors({});
    setDrawer({ mode: "edit", insurer });
  }

  async function save() {
    const errs = {};
    if (drawer.mode === "add") {
      if (!form.code.trim()) errs.code = "Code is required.";
      else if (!/^[a-z0-9_]{2,50}$/.test(form.code.trim())) errs.code = "Use 2–50 lowercase letters, numbers or underscores.";
    }
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = "Name is required.";
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      if (drawer.mode === "add") {
        await api.post("/api/admin/insurers", { ...form, code: form.code.trim(), name: form.name.trim() });
        toast.success(`${form.name.trim()} added.`);
      } else {
        await api.patch(`/api/admin/insurers/${drawer.insurer.id}`, { name: form.name.trim(), disclaimer: form.disclaimer, note: form.note });
        toast.success("Insurer updated.");
      }
      setDrawer(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save this insurer."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(insurer) {
    setBusyId(insurer.id);
    try {
      await api.patch(`/api/admin/insurers/${insurer.id}`, { active: !insurer.active });
      toast.success(`${insurer.name} ${insurer.active ? "deactivated" : "activated"}.`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not update this insurer."));
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }

  function pickLogo(insurer) {
    logoTarget.current = insurer;
    fileRef.current?.click();
  }

  async function uploadLogo(file) {
    const insurer = logoTarget.current;
    if (!insurer || !file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) return toast.error("Logo must be a PNG, JPEG, WEBP or SVG image.");
    if (file.size === 0) return toast.error("The selected file appears to be empty.");
    if (file.size > MAX_LOGO_BYTES) return toast.error("Logo must be under 2MB.");
    const fd = new FormData();
    fd.append("file", file);
    setBusyId(insurer.id);
    try {
      await api.post(`/api/admin/insurers/${insurer.id}/logo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Logo uploaded for ${insurer.name}.`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not upload the logo."));
    } finally {
      setBusyId(null);
    }
  }

  const columns = [
    {
      key: "name", header: "Insurer", sortable: true,
      render: (i) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
          <Avatar name={i.name} size={34} />
          <div>
            <div className="cell-main">{i.name}</div>
            <div className="cell-sub">
              {i.code}
              {i.logo_path && <span style={{ marginLeft: 6, color: "var(--c-green)" }}><CheckCircle2 size={11} style={{ verticalAlign: "-1px" }} /> Logo uploaded</span>}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "classes", header: "Motor Classes", align: "right", sortable: true, sortValue: (i) => coverage[i.id]?.active || 0,
      render: (i) => {
        const c = coverage[i.id];
        return c ? <span>{c.active} active{c.classes > c.active ? <span className="cell-sub"> / {c.classes} total</span> : null}</span> : "—";
      },
    },
    { key: "bands", header: "Rate Bands", align: "right", sortable: true, sortValue: (i) => coverage[i.id]?.bands || 0, render: (i) => coverage[i.id]?.bands ?? 0 },
    {
      key: "disclaimer", header: "Disclaimer / Note",
      render: (i) => (i.disclaimer || i.note) ? (
        <div className="cell-sub" style={{ maxWidth: 360, whiteSpace: "normal" }}>{i.disclaimer || i.note}</div>
      ) : <span className="cell-sub">—</span>,
    },
    { key: "active", header: "Status", sortable: true, sortValue: (i) => (i.active ? 0 : 1), render: (i) => <StatusBadge status={i.active ? "ACTIVE" : "DISABLED"} label={i.active ? "Active" : "Inactive"} /> },
    {
      key: "actions", header: "", width: 48,
      render: (i) => busyId === i.id ? <span className="spinner spinner-dark" /> : (
        <ActionMenu
          label={`Actions for ${i.name}`}
          items={[
            { label: "Edit details", icon: Pencil, onClick: () => openEdit(i) },
            { label: i.logo_path ? "Replace logo" : "Upload logo", icon: ImagePlus, onClick: () => pickLogo(i) },
            i.active
              ? { label: "Deactivate", icon: Power, danger: true, onClick: () => setConfirm(i) }
              : { label: "Activate", icon: Power, onClick: () => toggleActive(i) },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Insurers"
        description="Insurance companies available for quotations, with their classes and rates."
        actions={<button type="button" className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Insurer</button>}
      />

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div className="filter-bar">
          <div className="grow">
            <label htmlFor="ins-search">Search</label>
            <IconInput icon={Search}>
              <input id="ins-search" type="text" placeholder="Insurer name or code" value={q} onChange={(e) => setQ(e.target.value)} />
            </IconInput>
          </div>
          <div className="shrink">
            <label>Status</label>
            <div className="segmented" role="tablist" aria-label="Status filter">
              {[["", "All"], ["active", "Active"], ["inactive", "Inactive"]].map(([v, l]) => (
                <button key={l} type="button" role="tab" aria-selected={statusFilter === v} onClick={() => setStatusFilter(v)}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        minWidth={900}
        empty={<EmptyState icon={Building2} title={insurers.length ? "No insurers match" : "No insurers yet"}>{insurers.length ? "Try a different search or status." : "Add the first insurer to start quoting."}</EmptyState>}
      />
      <div className="table-foot"><span>{rows.length} of {insurers.length} insurers</span></div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files[0];
          e.target.value = "";
          uploadLogo(file);
        }}
      />

      <Drawer
        open={!!drawer}
        title={drawer?.mode === "edit" ? `Edit ${drawer.insurer.name}` : "Add insurer"}
        onClose={saving ? undefined : () => setDrawer(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDrawer(null)} disabled={saving}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving} aria-busy={saving}>
              {saving ? <span className="spinner" /> : drawer?.mode === "edit" ? "Save changes" : "Add insurer"}
            </button>
          </>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <Field label="Code" required={drawer?.mode === "add"} error={formErrors.code} hint={drawer?.mode === "edit" ? "The code can't be changed." : "Unique, lowercase, e.g. cic or star_discover"} htmlFor="ins-code">
            <input id="ins-code" type="text" value={form.code} disabled={drawer?.mode === "edit"} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })} />
          </Field>
          <Field label="Name" required error={formErrors.name} htmlFor="ins-name">
            <input id="ins-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. CIC General Insurance Ltd" />
          </Field>
          <Field label="Disclaimer" hint="Optional. Printed on this insurer's quotations." htmlFor="ins-disclaimer">
            <textarea id="ins-disclaimer" rows={3} value={form.disclaimer} onChange={(e) => setForm({ ...form, disclaimer: e.target.value })} />
          </Field>
          <Field label="Internal note" hint="Optional." htmlFor="ins-note">
            <textarea id="ins-note" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!confirm}
        title={`Deactivate ${confirm?.name}?`}
        message="It will stop appearing as an option for new quotations. Quotations already generated with it are not affected."
        confirmLabel="Deactivate"
        danger
        busy={busyId === confirm?.id}
        onConfirm={() => toggleActive(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
