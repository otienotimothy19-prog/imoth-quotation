import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CarFront, Pencil, Percent, Plus, Power, Search, Trash2 } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { ActionMenu, CATEGORY_LABELS, ConfirmDialog, DataTable, Drawer, EmptyState, Field, IconInput, PageHeader, StatusBadge, humanize, kes } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

const CATEGORIES = ["private", "commercial", "psv", "tuktuk", "motorcycle", "asset", "special", "tpo"];

// Sub-uses of category="commercial". Only the first 3 are ever offered to
// a customer in the wizard; the rest are insurer-internal products an
// admin can still create/manage here. Detailed institutional eligibility
// (institution/vehicle/passenger-category restrictions), PLL rates and
// tonnage_required are configured from Admin -> Rates once the class
// exists, alongside its other pricing configuration.
const COMMERCIAL_USES = ["own_goods", "general_cartage", "commercial_institutional", "commercial_tuktuk", "hybrid", "private_hire", "online_hailed", "tanker"];

function validateClassForm(form) {
  if (!form.code.trim()) return "Code is required.";
  if (!form.label.trim()) return "Label is required.";
  if (!form.category) return "Category is required.";
  if (form.max_age !== "" && (Number.isNaN(Number(form.max_age)) || Number(form.max_age) < 0)) {
    return "Max Age must be a non-negative number.";
  }
  if (form.flatOnly) {
    const hasPremium = form.flatPremium !== "" && form.flatPremium !== null;
    const hasRateOnSi = form.flatRateOnSi !== "" && form.flatRateOnSi !== null;
    if (form.flatPremium !== "" && (Number.isNaN(Number(form.flatPremium)) || Number(form.flatPremium) < 0)) {
      return "Fixed Premium must be a non-negative number.";
    }
    if (form.flatRateOnSi !== "" && (Number.isNaN(Number(form.flatRateOnSi)) || Number(form.flatRateOnSi) < 0)) {
      return "Rate on Sum Insured must be a non-negative number.";
    }
    if (!hasPremium && !hasRateOnSi) {
      return "Provide either a fixed premium or a rate on sum insured for this flat-rate product.";
    }
    if (hasRateOnSi && (form.flatMinPremium === "" || form.flatMinPremium === null)) {
      return "A minimum premium is required when using a rate on sum insured.";
    }
    return "";
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

// Courtesy car premium for a given number of days, or "" if not offered.
function courtesyPrice(cls, days) {
  const opt = (cls.courtesy_car_options || []).find((o) => Number(o.days) === days);
  return opt ? opt.premium : "";
}

function emptyForm() {
  return {
    code: "", label: "", category: "private", max_age: "", min_si: 0, max_si: "",
    flatOnly: false, flatPremium: "", flatRateOnSi: "", flatMinPremium: "", flatNote: "",
    commercial_use: "",
    cc10: "", cc20: "",
  };
}

export default function MotorClasses() {
  const navigate = useNavigate();
  const toast = useToast();
  const [insurers, setInsurers] = useState([]);
  const [insurerId, setInsurerId] = useState("");
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [drawer, setDrawer] = useState(null); // "add" | { edit: cls }
  const [form, setForm] = useState(emptyForm());
  const [formInsurerId, setFormInsurerId] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: "delete" | "disable", cls }
  const [busyId, setBusyId] = useState(null);

  async function loadInsurers() {
    try {
      const res = await api.get("/api/admin/insurers");
      setInsurers(res.data);
    } catch (err) {
      setError(errorMessage(err));
    }
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

  const rows = classes.filter((c) => {
    if (categoryFilter && c.category !== categoryFilter) return false;
    if (statusFilter === "active" && !c.active) return false;
    if (statusFilter === "inactive" && c.active) return false;
    const term = q.trim().toLowerCase();
    return !term || c.label.toLowerCase().includes(term) || (c.code || "").toLowerCase().includes(term) || (c.insurer_name || "").toLowerCase().includes(term);
  });

  function openAdd() {
    setForm(emptyForm());
    setFormInsurerId(insurerId);
    setFormError("");
    setDrawer("add");
  }

  function openEdit(cls) {
    setForm({
      ...emptyForm(),
      code: cls.code,
      label: cls.label,
      category: cls.category,
      max_age: cls.max_age ?? "",
      min_si: cls.min_si ?? 0,
      max_si: cls.max_si ?? "",
      flatOnly: !!cls.flat_only,
      cc10: courtesyPrice(cls, 10),
      cc20: courtesyPrice(cls, 20),
    });
    setFormError("");
    setDrawer({ edit: cls });
  }

  async function createClass() {
    setFormError("");
    if (!formInsurerId) return setFormError("Select the insurer this class belongs to.");
    const validationError = validateClassForm(form);
    if (validationError) return setFormError(validationError);

    setSaving(true);
    try {
      await api.post("/api/admin/motor-classes", {
        insurer_id: formInsurerId,
        code: form.code,
        label: form.label,
        category: form.category,
        max_age: form.max_age === "" ? null : Number(form.max_age),
        min_si: form.flatOnly ? 0 : Number(form.min_si) || 0,
        max_si: form.flatOnly ? null : form.max_si === "" ? null : Number(form.max_si),
        commercial_use: form.category === "commercial" && form.commercial_use ? form.commercial_use : null,
        flat_only: form.flatOnly
          ? {
              premium: form.flatPremium === "" ? null : Number(form.flatPremium),
              rate_on_si: form.flatRateOnSi === "" ? null : Number(form.flatRateOnSi),
              min_premium: form.flatMinPremium === "" ? null : Number(form.flatMinPremium),
              note: form.flatNote || "",
            }
          : null,
      });
      setDrawer(null);
      toast.success("Motor class created. Configure its rates under Rates.");
      await loadClasses();
    } catch (err) {
      setFormError(errorMessage(err, "Could not create this class."));
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    const cls = drawer.edit;
    const validationError = validateClassForm({ ...form, flatOnly: false, code: cls.code });
    if (validationError) return setFormError(validationError);
    setFormError("");
    setSaving(true);
    try {
      await api.patch(`/api/admin/motor-classes/${cls.id}`, {
        label: form.label,
        category: form.category,
        max_age: form.max_age === "" ? null : Number(form.max_age),
        ...(cls.flat_only ? {} : { min_si: Number(form.min_si) || 0, max_si: form.max_si === "" ? null : Number(form.max_si) }),
        courtesy_car_options: [
          ...(form.cc10 !== "" ? [{ days: 10, premium: Number(form.cc10) }] : []),
          ...(form.cc20 !== "" ? [{ days: 20, premium: Number(form.cc20) }] : []),
          // Keep any other periods set up for this class untouched.
          ...((cls.courtesy_car_options || []).filter((o) => o.days !== 10 && o.days !== 20)),
        ],
      });
      setDrawer(null);
      toast.success(`${form.label} updated.`);
      await loadClasses();
    } catch (err) {
      setFormError(errorMessage(err, "Could not save changes."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(cls) {
    setBusyId(cls.id);
    try {
      await api.patch(`/api/admin/motor-classes/${cls.id}`, { active: !cls.active });
      toast.success(`${cls.label} ${cls.active ? "disabled" : "activated"}.`);
      await loadClasses();
    } catch (err) {
      toast.error(errorMessage(err, "Could not update this class."));
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }

  async function deleteClass(cls) {
    setBusyId(cls.id);
    try {
      const res = await api.delete(`/api/admin/motor-classes/${cls.id}`);
      const detached = res.data?.quotations_detached || 0;
      toast.success(`${cls.label} deleted.${detached ? ` ${detached} quotation(s) that referenced it kept their history.` : ""}`);
      await loadClasses();
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete this class."));
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }

  const columns = [
    {
      key: "label", header: "Motor Class", sortable: true,
      render: (c) => (
        <div style={{ minWidth: 220 }}>
          <div className="cell-main">{c.label}</div>
          <div className="cell-sub">{c.code}</div>
        </div>
      ),
    },
    { key: "insurer_name", header: "Insurer", sortable: true, render: (c) => <div style={{ minWidth: 150 }}>{c.insurer_name}</div> },
    {
      key: "category", header: "Category", sortable: true,
      render: (c) => (
        <>
          <span className="badge badge-navy no-dot">{CATEGORY_LABELS[c.category] || c.category}</span>
          {c.commercial_use && <div className="cell-sub" style={{ marginTop: 3 }}>{humanize(c.commercial_use)}</div>}
        </>
      ),
    },
    {
      key: "cover", header: "Cover / Pricing",
      render: (c) => c.flat_only ? (
        <><div>Third party (flat)</div><div className="cell-sub">{c.flat_only.premium != null ? kes(c.flat_only.premium) : `${(c.flat_only.rate_on_si * 100).toFixed(2)}% of SI`}</div></>
      ) : (
        <><div>Comprehensive</div><div className="cell-sub">SI {kes(c.min_si)}{c.max_si ? ` – ${kes(c.max_si)}` : "+"}</div></>
      ),
    },
    { key: "max_age", header: "Max Age", align: "right", sortable: true, render: (c) => (c.max_age != null ? `${c.max_age} yrs` : "No limit") },
    {
      key: "courtesy", header: "Courtesy Car",
      render: (c) => c.courtesy_car_options?.length
        ? <span className="cell-sub" style={{ whiteSpace: "nowrap" }}>{c.courtesy_car_options.map((o) => `${o.days}d ${Number(o.premium).toLocaleString()}`).join(" · ")}</span>
        : <span className="cell-sub">—</span>,
    },
    { key: "active", header: "Status", sortable: true, sortValue: (c) => (c.active ? 0 : 1), render: (c) => <StatusBadge status={c.active ? "ACTIVE" : "DISABLED"} label={c.active ? "Active" : "Disabled"} /> },
    {
      key: "actions", header: "", width: 48,
      render: (c) => busyId === c.id ? <span className="spinner spinner-dark" /> : (
        <ActionMenu
          label={`Actions for ${c.label}`}
          items={[
            { label: "Edit", icon: Pencil, onClick: () => openEdit(c) },
            { label: "Configure rates", icon: Percent, onClick: () => navigate("/admin/rates") },
            c.active
              ? { label: "Disable", icon: Power, onClick: () => setConfirm({ kind: "disable", cls: c }) }
              : { label: "Activate", icon: Power, onClick: () => toggleActive(c) },
            { label: "Delete", icon: Trash2, danger: true, onClick: () => setConfirm({ kind: "delete", cls: c }) },
          ]}
        />
      ),
    },
  ];

  const editing = drawer && drawer !== "add" ? drawer.edit : null;

  return (
    <div>
      <PageHeader
        title="Motor Classes"
        description="Each insurer's classes of business, the cover they give and who they're eligible for."
        actions={<button type="button" className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Motor Class</button>}
      />

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div className="filter-bar">
          <div className="grow">
            <label htmlFor="mc-search">Search</label>
            <IconInput icon={Search}>
              <input id="mc-search" type="text" placeholder="Class name, code or insurer" value={q} onChange={(e) => setQ(e.target.value)} />
            </IconInput>
          </div>
          <div>
            <label htmlFor="motor-classes-insurer-filter">Filter by Insurer</label>
            <select id="motor-classes-insurer-filter" value={insurerId} onChange={(e) => setInsurerId(e.target.value)}>
              <option value="">All Insurers</option>
              {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mc-category">Filter by Category</label>
            <select id="mc-category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mc-status">Filter by Status</label>
            <select id="mc-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Disabled</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading && classes.length === 0}
        minWidth={1100}
        empty={<EmptyState icon={CarFront} title={classes.length ? "No classes match" : "No motor classes yet"}>{classes.length ? "Try a different filter." : "Add a class to start configuring rates."}</EmptyState>}
      />
      <div className="table-foot"><span>{rows.length} of {classes.length} classes</span></div>

      <Drawer
        open={!!drawer}
        title={editing ? `Edit ${editing.label}` : "Add motor class"}
        onClose={saving ? undefined : () => setDrawer(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setDrawer(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={saving} aria-busy={saving} onClick={editing ? saveEdit : createClass}>
              {saving ? <span className="spinner" /> : editing ? "Save changes" : "Save Class"}
            </button>
          </>
        }
      >
        {formError && <div className="alert alert-error" role="alert">{formError}</div>}
        <div className="stack" style={{ gap: 14 }}>
          {editing ? (
            <Field label="Insurer"><input type="text" value={editing.insurer_name || ""} disabled /></Field>
          ) : (
            <Field label="Insurer" required htmlFor="new-class-insurer">
              <select id="new-class-insurer" value={formInsurerId} onChange={(e) => setFormInsurerId(e.target.value)}>
                <option value="">Select insurer…</option>
                {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
          )}
          <div className="form-grid">
            <Field label="Code (unique per insurer)" required={!editing} htmlFor="new-class-code" hint={editing ? "The code can't be changed." : undefined}>
              <input id="new-class-code" type="text" value={form.code} disabled={!!editing} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
            <Field label="Label" required htmlFor="new-class-label">
              <input id="new-class-label" type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </Field>
            <Field label="Category" required htmlFor="new-class-category">
              <select id="new-class-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
              </select>
            </Field>
            <Field label="Max vehicle age" hint="Blank = no limit" htmlFor="new-class-max-age">
              <input id="new-class-max-age" type="number" min="0" value={form.max_age} onChange={(e) => setForm({ ...form, max_age: e.target.value })} />
            </Field>
          </div>

          {!editing && form.category === "commercial" && (
            <Field label="Commercial Use" htmlFor="new-class-commercial-use" hint="Only Own Goods, General Cartage, Commercial Institutional and Commercial Tuk Tuk are offered to customers. Eligibility, tonnage and passenger liability are configured under Rates.">
              <select id="new-class-commercial-use" value={form.commercial_use} onChange={(e) => setForm({ ...form, commercial_use: e.target.value })}>
                <option value="">(not set)</option>
                {COMMERCIAL_USES.map((u) => <option key={u} value={u}>{humanize(u)}</option>)}
              </select>
            </Field>
          )}

          {!editing && (
            <label className="switch" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" checked={form.flatOnly} onChange={(e) => setForm({ ...form, flatOnly: e.target.checked })} />
              <span className="track" />
              <span style={{ fontSize: 13 }}>Flat-rate product (e.g. Third Party Only) — a fixed premium instead of Sum-Insured bands</span>
            </label>
          )}

          {form.flatOnly ? (
            editing ? (
              <div className="alert alert-info">This is a flat-rate product. Change its premium under Rates.</div>
            ) : (
              <>
                <div className="form-grid">
                  <Field label="Fixed Premium (leave blank to use a rate instead)" htmlFor="new-class-flat-premium">
                    <input id="new-class-flat-premium" type="number" step="any" min="0" value={form.flatPremium} onChange={(e) => setForm({ ...form, flatPremium: e.target.value })} />
                  </Field>
                  <Field label="Rate on Sum Insured (e.g. 0.04 = 4%)" htmlFor="new-class-flat-rate">
                    <input id="new-class-flat-rate" type="number" step="any" min="0" value={form.flatRateOnSi} onChange={(e) => setForm({ ...form, flatRateOnSi: e.target.value })} />
                  </Field>
                  <Field label="Minimum Premium (required if using a rate)" htmlFor="new-class-flat-min">
                    <input id="new-class-flat-min" type="number" step="any" min="0" value={form.flatMinPremium} onChange={(e) => setForm({ ...form, flatMinPremium: e.target.value })} />
                  </Field>
                  <Field label="Note" htmlFor="new-class-flat-note">
                    <input id="new-class-flat-note" type="text" value={form.flatNote} onChange={(e) => setForm({ ...form, flatNote: e.target.value })} />
                  </Field>
                </div>
                <div className="hint">The product is ready to quote immediately. You can adjust the premium later under Rates.</div>
              </>
            )
          ) : (
            <>
              <div className="form-grid">
                <Field label="Min Sum Insured" htmlFor="new-class-min-si">
                  <input id="new-class-min-si" type="number" min="0" value={form.min_si} onChange={(e) => setForm({ ...form, min_si: e.target.value })} />
                </Field>
                <Field label="Max Sum Insured" hint="Blank = open-ended" htmlFor="new-class-max-si">
                  <input id="new-class-max-si" type="number" min="0" value={form.max_si} onChange={(e) => setForm({ ...form, max_si: e.target.value })} />
                </Field>
              </div>
              {!editing && <div className="hint">After creating the class, configure its rate bands under Rates.</div>}
            </>
          )}

          {editing && (
            <>
              <div className="divider" style={{ margin: "4px 0" }} />
              <div style={{ fontWeight: 600, fontSize: 13 }}>Courtesy car extension</div>
              <div className="form-grid">
                <Field label="10 days premium (KES)" hint="Blank = not offered" htmlFor="mc-cc10">
                  <input id="mc-cc10" type="number" min="0" value={form.cc10} onChange={(e) => setForm({ ...form, cc10: e.target.value })} />
                </Field>
                <Field label="20 days premium (KES)" hint="Blank = not offered" htmlFor="mc-cc20">
                  <input id="mc-cc20" type="number" min="0" value={form.cc20} onChange={(e) => setForm({ ...form, cc20: e.target.value })} />
                </Field>
              </div>
            </>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === "delete" ? `Delete "${confirm?.cls.label}"?` : `Disable "${confirm?.cls.label}"?`}
        message={
          confirm?.kind === "delete"
            ? "This permanently deletes the class and cannot be undone. Quotations already generated with it keep their own record, pricing and PDF. Use Disable instead if you only want to hide it from new quotations."
            : "It will stop appearing for new quotations. Existing quotations are not affected."
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete class" : "Disable"}
        danger
        busy={busyId === confirm?.cls.id}
        onConfirm={() => (confirm.kind === "delete" ? deleteClass(confirm.cls) : toggleActive(confirm.cls))}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
