import { useEffect, useMemo, useState } from "react";
import { Building, FileText, Lock, Paperclip, Percent, RotateCcw, Save, ScrollText } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Card, Field, PageHeader } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

// Only settings the system actually reads are shown. SMTP credentials and
// server security options live in environment variables, not here.
const TABS = [
  {
    key: "company", label: "Company information", icon: Building,
    description: "Shown on every quotation and risk note PDF.",
    fields: [
      { key: "company.name", label: "Company name", type: "text", required: true },
      { key: "company.tagline", label: "Tagline", type: "text" },
      { key: "company.address", label: "Address", type: "text", hint: "Postal address first, then office location, e.g. “P.O. Box 23280 – 00100, Nairobi, Wabera Street, Salama House”." },
      { key: "company.phone", label: "Phone", type: "text" },
      { key: "company.email", label: "Email", type: "email" },
      { key: "company.paybill", label: "M-Pesa paybill number", type: "text" },
    ],
  },
  {
    key: "quotation", label: "Quotation settings", icon: FileText,
    description: "Validity periods and the wording printed on quotations.",
    fields: [
      { key: "quotation.validity_days", label: "Quotation validity (days)", type: "number", min: 1, max: 365, step: 1 },
      { key: "quote_selection.validity_minutes", label: "Customer comparison hold (minutes)", type: "number", min: 5, max: 1440, step: 1, hint: "How long a price a customer picks on the website stays reserved while they enter their details." },
      { key: "pdf.footer_text", label: "PDF footer text", type: "textarea", hint: "The first sentence is printed in bold." },
      { key: "quotation.conditions", label: "Quotation conditions", type: "list", hint: "One condition per line." },
    ],
  },
  {
    key: "risk_note", label: "Risk note settings", icon: ScrollText,
    description: "Wording printed on risk notes.",
    fields: [{ key: "risk_note.conditions", label: "Risk note conditions", type: "list", hint: "One condition per line." }],
  },
  {
    key: "levies", label: "Premium & levies", icon: Percent,
    description: "Applied to every new quotation. Existing quotations keep the figures they were priced with.",
    fields: [
      { key: "levy.rate", label: "Levy rate", type: "percent", min: 0, max: 100, hint: "PHCF + Training Levy combined, e.g. 0.45%." },
      { key: "levy.stamp_duty", label: "Stamp duty (KES, flat)", type: "number", min: 0, step: 1 },
    ],
  },
  {
    key: "documents", label: "Client documents", icon: Paperclip,
    description: "Uploads customers make when accepting a quotation.",
    fields: [
      { key: "documents.max_file_size_mb", label: "Maximum file size (MB)", type: "number", min: 1, max: 100, step: 1 },
      { key: "documents.allowed_mime_types", label: "Accepted file types", type: "types" },
    ],
  },
];

const FILE_TYPES = [
  ["application/pdf", "PDF"],
  ["image/jpeg", "JPEG image"],
  ["image/png", "PNG image"],
  ["image/webp", "WEBP image"],
];

const ALL_FIELDS = TABS.flatMap((t) => t.fields);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const [original, setOriginal] = useState({});
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("company");
  const canEdit = user?.role === "SUPER_ADMIN";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/admin/settings");
      setOriginal(res.data);
      setValues(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const changedKeys = useMemo(() => ALL_FIELDS.map((f) => f.key).filter((k) => !same(values[k], original[k])), [values, original]);
  const dirty = changedKeys.length > 0;

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function validate() {
    for (const f of ALL_FIELDS) {
      if (!changedKeys.includes(f.key)) continue;
      const v = values[f.key];
      if (f.required && !String(v ?? "").trim()) return `${f.label} is required.`;
      if (f.type === "number" || f.type === "percent") {
        if (v === "" || v === null || typeof v !== "number" || Number.isNaN(v)) return `${f.label} must be a number.`;
        const shown = f.type === "percent" ? v * 100 : v;
        if (f.min != null && shown < f.min) return `${f.label} must be at least ${f.min}.`;
        if (f.max != null && shown > f.max) return `${f.label} must be at most ${f.max}.`;
      }
      if (f.type === "types" && (!Array.isArray(v) || v.length === 0)) return "Accept at least one file type.";
    }
    return "";
  }

  async function save() {
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const payload = {};
      for (const k of changedKeys) payload[k] = values[k];
      const res = await api.put("/api/admin/settings", { values: payload });
      setOriginal(res.data);
      setValues(res.data);
      toast.success(`Settings saved (${changedKeys.length} change${changedKeys.length === 1 ? "" : "s"}).`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function set(key, v) {
    setValues((all) => ({ ...all, [key]: v }));
  }

  function renderField(f) {
    const v = values[f.key];
    const id = `set-${f.key.replace(/\./g, "-")}`;
    const changed = changedKeys.includes(f.key);
    const label = <>{f.label}{changed && <span className="badge badge-amber no-dot" style={{ marginLeft: 8 }}>Unsaved</span>}</>;
    if (f.type === "textarea") {
      return (
        <Field key={f.key} label={label} hint={f.hint} htmlFor={id} className="span-2">
          <textarea id={id} rows={3} disabled={!canEdit} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} />
        </Field>
      );
    }
    if (f.type === "list") {
      return (
        <Field key={f.key} label={label} hint={f.hint} htmlFor={id} className="span-2">
          <textarea
            id={id}
            rows={5}
            disabled={!canEdit}
            value={(Array.isArray(v) ? v : []).join("\n")}
            onChange={(e) => set(f.key, e.target.value.split("\n").map((x) => x.replace(/\s+$/, "")).filter((x, i, arr) => x || i < arr.length - 1))}
          />
        </Field>
      );
    }
    if (f.type === "types") {
      const list = Array.isArray(v) ? v : [];
      return (
        <Field key={f.key} label={label} className="span-2">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            {FILE_TYPES.map(([mime, name]) => (
              <label key={mime} className="switch">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={list.includes(mime)}
                  onChange={(e) => set(f.key, e.target.checked ? [...list, mime] : list.filter((m) => m !== mime))}
                />
                <span className="track" />
                {name}
              </label>
            ))}
          </div>
        </Field>
      );
    }
    if (f.type === "percent") {
      return (
        <Field key={f.key} label={label} hint={f.hint} htmlFor={id}>
          <div className="input-prefix">
            <span aria-hidden="true">%</span>
            <input
              id={id}
              type="number"
              step="0.01"
              min={f.min}
              max={f.max}
              disabled={!canEdit}
              value={v === "" || v == null ? "" : +(v * 100).toFixed(4)}
              onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value) / 100)}
            />
          </div>
        </Field>
      );
    }
    return (
      <Field key={f.key} label={label} hint={f.hint} htmlFor={id}>
        <input
          id={id}
          type={f.type}
          min={f.min}
          max={f.max}
          step={f.step}
          disabled={!canEdit}
          value={v ?? ""}
          onChange={(e) => set(f.key, f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        />
      </Field>
    );
  }

  const current = TABS.find((t) => t.key === tab);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Company details, quotation wording, levies and document rules used across the system."
        actions={canEdit && (
          <>
            <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={() => { setValues(original); setError(""); }}>
              <RotateCcw size={15} /> Discard changes
            </button>
            <button type="button" className="btn btn-primary" disabled={!dirty || saving} aria-busy={saving} onClick={save}>
              {saving ? <span className="spinner" /> : <><Save size={15} /> Save settings</>}
            </button>
          </>
        )}
      />

      {!canEdit && <div className="alert alert-info"><Lock size={16} /> Only Super Admins can change settings. You can view them below.</div>}
      {dirty && canEdit && (
        <div className="alert alert-info" role="status">
          You have {changedKeys.length} unsaved change{changedKeys.length === 1 ? "" : "s"}. Save or discard them before leaving this page.
        </div>
      )}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {loading ? (
        <div className="card"><span className="skeleton" style={{ width: "30%" }} /><span className="skeleton" style={{ width: "60%", marginTop: 12 }} /></div>
      ) : (
        <div className="grid-main-side settings-layout">
          <nav className="card" style={{ padding: 8, alignSelf: "start" }} aria-label="Settings sections">
            {TABS.map((t) => {
              const Icon = t.icon;
              const tabDirty = t.fields.some((f) => changedKeys.includes(f.key));
              return (
                <button
                  key={t.key}
                  type="button"
                  className="menu-item"
                  aria-current={tab === t.key ? "page" : undefined}
                  style={tab === t.key ? { background: "var(--c-royal-soft)", color: "var(--c-royal)", fontWeight: 600 } : undefined}
                  onClick={() => setTab(t.key)}
                >
                  <Icon size={16} /> {t.label}
                  {tabDirty && <span className="badge badge-amber no-dot" style={{ marginLeft: "auto", padding: "1px 6px" }}>•</span>}
                </button>
              );
            })}
          </nav>
          <Card title={current.label} icon={current.icon} sub={current.description}>
            <div className="form-grid">{current.fields.map(renderField)}</div>
          </Card>
        </div>
      )}
    </div>
  );
}
