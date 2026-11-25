import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileCheck2,
  FilePlus2,
  FileText,
  Receipt,
  RotateCcw,
  Scale,
  Tag,
} from "lucide-react";
import { api, downloadBlob, errorMessage, serverFilename } from "../../api/client";
import { Card, EmptyState, Field, IconInput, MoneyInput, PageHeader, kes } from "../../components/ui";

// KES with cents, so figures agree exactly with the quotation PDF.
const quoteMoney = (n) => kes(n, { decimals: 2 });
import VehicleMakeSelect from "../../components/VehicleMakeSelect";

const CATEGORY_LABELS = {
  private: "Private",
  commercial: "Commercial",
  psv: "PSV",
  tuktuk: "Tuk Tuk",
  motorcycle: "Motorcycle",
  asset: "Asset",
  special: "Special",
  tpo: "Third Party Only",
};

// What an agent can compare across insurers (the same choices a customer
// gets, plus Third Party Only).
const COMPARE_CATEGORIES = [
  { value: "private", label: "Private Car" },
  { value: "commercial", label: "Commercial" },
  { value: "psv", label: "PSV / Chauffeur Driven" },
  { value: "tuktuk", label: "PSV Tuk Tuk" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "asset", label: "Asset (New Units)" },
  { value: "special", label: "Special Type (Farm / Construction)" },
  { value: "tpo", label: "Third Party Only" },
];
const COMMERCIAL_USES = [
  { value: "own_goods", label: "Own Goods" },
  { value: "general_cartage", label: "General Cartage" },
  { value: "commercial_institutional", label: "Commercial Institutional" },
  { value: "commercial_tuktuk", label: "Commercial Tuk Tuk" },
];
const INSTITUTION_TYPES = ["SCHOOL", "CHURCH", "COMPANY", "NGO", "GOVERNMENT", "HOSPITAL", "OTHER"];
const INSTITUTIONAL_VEHICLE_TYPES = ["VAN", "MINIBUS", "BUS", "OTHER"];
const PASSENGER_CATEGORIES = ["STUDENTS", "STAFF", "CHURCH_MEMBERS", "GENERAL_INSTITUTIONAL"];
const titleCase = (v) => v.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function emptyCompare() {
  return { category: "private", commercialUse: "", institutionType: "", institutionalVehicleType: "", passengerCategory: "", seats: "" };
}

function emptyForm() {
  return {
    regNo: "",
    yom: "",
    make: "",
    model: "",
    sumInsured: "",
    amountPaid: "0",
    ep: false,
    pvt: false,
    pllSeats: "",
    pllOptionKey: "",
    tonnage: "",
    lrBand: "good",
    courtesyDays: "",
    institutionType: "",
    institutionalVehicleType: "",
    passengerCategory: "",
  };
}

// Extras an agent can tick on one compared insurer: Excess Protector and
// PVT (where the insurer charges for them) and a courtesy car period.
function RowExtras({ option, picked, onChange }) {
  const x = option.extras;
  if (!x) return null;
  const coverChoice = (key, label) => {
    const info = x[key] || {};
    if (info.status === "optional") {
      return (
        <label key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500, margin: 0 }}>
          <input type="checkbox" checked={!!picked[key]} onChange={(e) => onChange({ [key]: e.target.checked })} />
          {label} <span className="hint">+{quoteMoney(info.amount)}</span>
        </label>
      );
    }
    const text = { included: "included", mandatory: "included (mandatory)", not_offered: "not offered" }[info.status];
    return text ? <span key={key} className="hint">{label}: {text}</span> : null;
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 6, alignItems: "center", fontSize: 12.5 }}>
      {coverChoice("ep", "Excess Protector")}
      {coverChoice("pvt", "PVT")}
      {x.courtesy_car?.length > 0 ? (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500, margin: 0 }}>
          Courtesy car
          <select
            value={picked.courtesyDays || ""}
            onChange={(e) => onChange({ courtesyDays: e.target.value })}
            style={{ padding: "2px 6px", minHeight: "auto", fontSize: 12.5, width: "auto" }}
          >
            <option value="">None</option>
            {x.courtesy_car.map((c) => (
              <option key={c.days} value={c.days}>{c.days} days (+{quoteMoney(c.amount)})</option>
            ))}
          </select>
        </label>
      ) : (
        <span className="hint">Courtesy car: not offered</span>
      )}
    </div>
  );
}

export default function NewQuotation() {
  const [insurers, setInsurers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [insurerId, setInsurerId] = useState("");
  const [classId, setClassId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState("compare");
  const [cmp, setCmp] = useState(emptyCompare());
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState(null);
  // Extras ticked on each compared insurer row, keyed by insurer+class.
  const [rowExtras, setRowExtras] = useState({});
  // Which compared row is currently being turned into a quotation.
  const [generatingKey, setGeneratingKey] = useState(null);
  // Which compared row has its benefits/excess/limits expanded.
  const [expanded, setExpanded] = useState(null);
  const isAgentArea = useLocation().pathname.startsWith("/agent");
  // Set when the agent picks an insurer from the comparison: the class to
  // select once that insurer's classes have loaded, and option values
  // (institutional details) to keep when the class changes.
  const pendingClassRef = useRef(null);
  const carryRef = useRef(null);

  useEffect(() => {
    api.get("/api/admin/insurers")
      .then((res) => setInsurers(res.data.filter((i) => i.active)))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    setClassId("");
    if (!insurerId) {
      setClasses([]);
      return;
    }
    setLoadingClasses(true);
    api.get("/api/admin/motor-classes", { params: { insurer_id: insurerId } })
      .then((res) => {
        const active = res.data.filter((c) => c.active);
        setClasses(active);
        const pending = pendingClassRef.current;
        pendingClassRef.current = null;
        if (pending && active.some((c) => c.id === pending)) setClassId(pending);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoadingClasses(false));
  }, [insurerId]);

  const selectedClass = useMemo(() => classes.find((c) => c.id === classId) || null, [classes, classId]);
  const isFlat = !!selectedClass?.flat_only;
  const isInstitutional = selectedClass?.commercial_use === "commercial_institutional";
  const showPll = isInstitutional || !!selectedClass?.pll_per_seat || !!(selectedClass?.pll_options?.length);
  const showTonnage = !!selectedClass?.tonnage_required;
  const showLrBand = !!selectedClass?.has_lr_toggle;

  // A class's own option fields (EP/PVT/PLL/tonnage/loss-ratio) never carry
  // over to a different class with different terms.
  useEffect(() => {
    update({
      ep: false, pvt: false, pllSeats: "", pllOptionKey: "", tonnage: "",
      lrBand: "good", courtesyDays: "", institutionType: "", institutionalVehicleType: "", passengerCategory: "",
      ...(carryRef.current || {}),
    });
    carryRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const classesByCategory = useMemo(() => {
    const groups = {};
    for (const c of classes) {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    }
    return groups;
  }, [classes]);

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function resetForNewQuote() {
    setForm(emptyForm());
    setInsurerId("");
    setClassId("");
    setResult(null);
    setError("");
    setMode("compare");
    setCmp(emptyCompare());
    setComparison(null);
    setExpanded(null);
  }

  const cmpInstitutional = cmp.category === "commercial" && cmp.commercialUse === "commercial_institutional";

  async function compareRates() {
    setError("");
    setComparison(null);
    if (!form.yom) return setError("Enter the year of manufacture to compare rates.");
    if (cmp.category !== "tpo" && !(Number(form.sumInsured) > 0)) return setError("Enter the sum insured to compare rates.");
    if (cmp.category === "commercial" && !cmp.commercialUse) return setError("Select the commercial use.");
    if (cmpInstitutional && (!cmp.institutionType || !cmp.institutionalVehicleType || !cmp.passengerCategory || !(Number(cmp.seats) > 0))) {
      return setError("Institution type, vehicle type, passenger category and number of seats are needed for Commercial Institutional.");
    }
    setComparing(true);
    try {
      const res = await api.post("/api/admin/quotations/compare", {
        vehicle: { registration_no: form.regNo.trim() || "TBA", year_of_manufacture: Number(form.yom) },
        category: cmp.category,
        commercial_use: cmp.category === "commercial" ? cmp.commercialUse : null,
        institution_type: cmpInstitutional ? cmp.institutionType : null,
        institutional_vehicle_type: cmpInstitutional ? cmp.institutionalVehicleType : null,
        passenger_category: cmpInstitutional ? cmp.passengerCategory : null,
        sum_insured: Number(form.sumInsured || 0),
        options: { pll_seats: cmpInstitutional ? Number(cmp.seats) : 0 },
      });
      setComparison(res.data);
      setRowExtras({});
    } catch (err) {
      setError(errorMessage(err, "Could not compare rates."));
    } finally {
      setComparing(false);
    }
  }

  const rowKey = (o) => `${o.insurer_id}-${o.motor_class_id}`;

  function setRowExtra(o, patch) {
    setRowExtras((all) => ({ ...all, [rowKey(o)]: { ...(all[rowKey(o)] || {}), ...patch } }));
  }

  // Price of an option with the extras ticked on its row. Uses the amounts
  // the server worked out for each extra, then applies levies and stamp
  // duty exactly as the quotation will.
  function rowTotal(o) {
    const picked = rowExtras[rowKey(o)] || {};
    const x = o.extras || {};
    let extra = 0;
    if (picked.ep && x.ep?.status === "optional") extra += x.ep.amount;
    if (picked.pvt && x.pvt?.status === "optional") extra += x.pvt.amount;
    const cc = (x.courtesy_car || []).find((c) => String(c.days) === String(picked.courtesyDays));
    if (cc) extra += cc.amount;
    const subtotal = o.subtotal + extra;
    return subtotal + subtotal * (comparison?.levy_rate ?? 0) + o.stamp_duty;
  }

  function openInPicker(option) {
    setError("");
    const picked = rowExtras[rowKey(option)] || {};
    carryRef.current = {
      ep: !!picked.ep,
      pvt: !!picked.pvt,
      courtesyDays: picked.courtesyDays || "",
      ...(cmpInstitutional
        ? {
            institutionType: cmp.institutionType,
            institutionalVehicleType: cmp.institutionalVehicleType,
            passengerCategory: cmp.passengerCategory,
            pllSeats: cmp.seats,
          }
        : {}),
    };
    if (option.insurer_id === insurerId && option.motor_class_id === classId) {
      update(carryRef.current);
      carryRef.current = null;
    } else if (option.insurer_id === insurerId) {
      setClassId(option.motor_class_id);
    } else {
      pendingClassRef.current = option.motor_class_id;
      setInsurerId(option.insurer_id);
    }
    setMode("pick");
  }

  // "Generate quote" on a compared insurer: creates the quotation straight
  // away with that row's extras -- no second step.
  async function generateFromOption(option) {
    setError("");
    if (option.tonnage_required) {
      openInPicker(option);
      setError("This insurer's product needs the vehicle's tonnage. Enter it below, then generate the quote.");
      return;
    }
    if (!form.regNo.trim()) return setError("Enter the registration number to generate the quote.");
    if (!form.yom) return setError("Enter the year of manufacture to generate the quote.");
    const picked = rowExtras[rowKey(option)] || {};
    const payload = {
      vehicle: {
        registration_no: form.regNo.trim(),
        year_of_manufacture: Number(form.yom),
        make: form.make.trim() || null,
        model: form.model.trim() || null,
      },
      insurer_id: option.insurer_id,
      motor_class_id: option.motor_class_id,
      commercial_use: cmp.category === "commercial" ? cmp.commercialUse : null,
      institution_type: cmpInstitutional ? cmp.institutionType : null,
      institutional_vehicle_type: cmpInstitutional ? cmp.institutionalVehicleType : null,
      passenger_category: cmpInstitutional ? cmp.passengerCategory : null,
      // Same sum insured the comparison was priced with.
      sum_insured: Number(form.sumInsured || 0),
      options: {
        ep: !!picked.ep,
        pvt: !!picked.pvt,
        courtesy_days: picked.courtesyDays ? Number(picked.courtesyDays) : null,
        pll_seats: cmpInstitutional ? Number(cmp.seats) : 0,
      },
      amount_paid: Number(form.amountPaid || 0),
    };
    setGeneratingKey(rowKey(option));
    try {
      const res = await api.post("/api/admin/quotations", payload);
      setResult(res.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(errorMessage(err, "Could not generate this quotation."));
    } finally {
      setGeneratingKey(null);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.regNo.trim()) return setError("Registration number is required.");
    if (!form.yom) return setError("Year of manufacture is required.");
    if (!insurerId) return setError("Select an insurance company.");
    if (!classId) return setError("Select a class of business.");
    if (!isFlat && !form.sumInsured) return setError("Sum insured is required for this class.");
    if (isInstitutional && (!form.institutionType || !form.institutionalVehicleType || !form.passengerCategory)) {
      return setError("Institution type, vehicle type and passenger category are all required for this class.");
    }
    if (showPll && !(Number(form.pllSeats) > 0)) {
      return setError("Number of seats/passengers to cover must be greater than zero for this class.");
    }
    if (showTonnage && !form.tonnage) {
      return setError("This insurer's product requires a tonnage (carrying capacity) figure.");
    }

    const payload = {
      vehicle: {
        registration_no: form.regNo.trim(),
        year_of_manufacture: Number(form.yom),
        make: form.make.trim() || null,
        model: form.model.trim() || null,
      },
      insurer_id: insurerId,
      motor_class_id: classId,
      commercial_use: selectedClass?.commercial_use || null,
      institution_type: isInstitutional ? form.institutionType : null,
      institutional_vehicle_type: isInstitutional ? form.institutionalVehicleType : null,
      passenger_category: isInstitutional ? form.passengerCategory : null,
      sum_insured: isFlat ? 0 : Number(form.sumInsured),
      options: {
        ep: form.ep,
        pvt: form.pvt,
        courtesy_days: form.courtesyDays ? Number(form.courtesyDays) : null,
        lr_band: showLrBand ? form.lrBand : null,
        pll_seats: showPll ? Number(form.pllSeats || 0) : 0,
        pll_option_key: showPll ? form.pllOptionKey || null : null,
        tonnage: showTonnage ? Number(form.tonnage) : null,
      },
      amount_paid: Number(form.amountPaid || 0),
    };

    setSubmitting(true);
    try {
      const res = await api.post("/api/admin/quotations", payload);
      setResult(res.data);
    } catch (err) {
      setError(errorMessage(err, "Could not generate this quotation."));
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadPdf() {
    if (!result) return;
    setError("");
    setDownloading(true);
    try {
      const res = await api.get(`/api/admin/quotations/${result.id}/pdf`, { responseType: "blob" });
      downloadBlob(res.data, serverFilename(res, `Imoth_Quote_${result.quotation_number}.pdf`));
    } catch (err) {
      setError(errorMessage(err, "Could not download the PDF."));
    } finally {
      setDownloading(false);
    }
  }

  const sectionNo = (n) => <span className="step" aria-hidden="true">{n}</span>;

  if (result) {
    return (
      <div>
        <PageHeader
          title="Quotation generated"
          description={`${result.insurer_name} · ${result.vehicle_class_label} · ${result.registration_no}`}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={resetForNewQuote}>
                <FilePlus2 size={16} /> New Quotation
              </button>
              <button type="button" className="btn btn-primary" onClick={downloadPdf} disabled={downloading} aria-busy={downloading}>
                {downloading ? <span className="spinner" /> : <><Download size={16} /> Download PDF</>}
              </button>
            </>
          }
        />
        {error && <div className="alert alert-error">{error}</div>}
        <div className="grid-main-side">
          <Card title="Premium breakdown" icon={Receipt}>
            <div className="table-wrap">
              <table>
                <tbody>
                  {result.items.map((it, i) => (
                    <tr key={i}><td>{it.label}</td><td className="num">{quoteMoney(it.amount)}</td></tr>
                  ))}
                  <tr><td>Sub-total</td><td className="num">{quoteMoney(result.subtotal)}</td></tr>
                  <tr><td>Levies</td><td className="num">{quoteMoney(result.levies)}</td></tr>
                  <tr><td>Stamp Duty</td><td className="num">{quoteMoney(result.stamp_duty)}</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>Total Premium</td><td className="num">{quoteMoney(result.total_premium)}</td></tr>
                  {result.amount_paid > 0 && (
                    <>
                      <tr><td>Amount Paid</td><td className="num">{quoteMoney(result.amount_paid)}</td></tr>
                      <tr style={{ fontWeight: 700 }}><td>Balance Due</td><td className="num" style={{ color: "var(--c-red-hover)" }}>{quoteMoney(result.balance)}</td></tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Quotation" icon={FileText}>
            <dl className="kv">
              <dt>Quotation No.</dt><dd><strong>{result.quotation_number}</strong></dd>
              <dt>Client</dt><dd>{result.client_name}</dd>
              <dt>Insurer</dt><dd>{result.insurer_name}</dd>
              <dt>Class</dt><dd>{result.vehicle_class_label}</dd>
              <dt>Registration</dt><dd>{result.registration_no}</dd>
              <dt>Sum Insured</dt><dd>{quoteMoney(result.sum_insured)}</dd>
            </dl>
            <div className="alert alert-success" style={{ marginTop: 16, marginBottom: 0 }}>
              <CheckCircle2 size={16} /> Saved. You can find it again under {isAgentArea ? "My Quotations" : "Quotations"}.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="New Quotation"
        description="Compare every insurer's rate for the vehicle, then generate the quote for the one you want."
      />
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <form
        noValidate
        onSubmit={(e) => {
          // Enter in any field compares (compare mode) or generates (picker).
          if (mode === "compare") {
            e.preventDefault();
            compareRates();
          } else {
            submit(e);
          }
        }}
      >
        <div className="stack">
          <Card>
            <h2 className="section-title">{sectionNo(1)} Vehicle details</h2>
            <div className="form-grid">
              <Field label="Registration number" required htmlFor="nq-reg">
                <IconInput icon={Car}>
                  <input id="nq-reg" type="text" value={form.regNo} onChange={(e) => update({ regNo: e.target.value.toUpperCase() })} placeholder="e.g. KCZ 538G" autoComplete="off" />
                </IconInput>
              </Field>
              <Field label="Year of manufacture" required htmlFor="nq-yom">
                <IconInput icon={CalendarDays}>
                  <input id="nq-yom" type="number" inputMode="numeric" min="1960" max={new Date().getFullYear()} value={form.yom} onChange={(e) => update({ yom: e.target.value })} placeholder={`e.g. ${new Date().getFullYear() - 5}`} />
                </IconInput>
              </Field>
              <Field label="Make" hint="Optional" htmlFor="nq-make">
                <VehicleMakeSelect id="nq-make" value={form.make} onChange={(make) => update({ make })} />
              </Field>
              <Field label="Model" hint="Optional" htmlFor="nq-model">
                <IconInput icon={Tag}>
                  <input id="nq-model" type="text" value={form.model} onChange={(e) => update({ model: e.target.value })} placeholder="e.g. Axio" />
                </IconInput>
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="section-title">{sectionNo(2)} Cover selection</h2>
            <div className="segmented" role="tablist" aria-label="How to choose the insurer">
              <button type="button" role="tab" aria-selected={mode === "compare"} onClick={() => setMode("compare")}>
                <Scale size={15} /> Compare insurers
              </button>
              <button type="button" role="tab" aria-selected={mode === "pick"} onClick={() => setMode("pick")}>
                <Building2 size={15} /> Choose one insurer
              </button>
            </div>
            <p className="hint" style={{ margin: "10px 0 0" }}>
              {mode === "compare"
                ? "Price every insurer side by side, add extras per insurer, then generate the quote you want."
                : "Pick the insurer and class yourself when you already know which one the client wants."}
            </p>
            {mode === "pick" && (
              <div className="form-grid" style={{ marginTop: 14 }}>
                <Field label="Insurance company" required htmlFor="nq-insurer">
                  <select id="nq-insurer" value={insurerId} onChange={(e) => setInsurerId(e.target.value)}>
                    <option value="">Select insurer…</option>
                    {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </Field>
                <Field label="Class of business" required htmlFor="nq-class">
                  <select id="nq-class" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!insurerId || loadingClasses}>
                    <option value="">{loadingClasses ? "Loading…" : "Select class…"}</option>
                    {Object.entries(classesByCategory).map(([cat, list]) => (
                      <optgroup key={cat} label={CATEGORY_LABELS[cat] || cat}>
                        {list.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="section-title">{sectionNo(3)} Quotation details</h2>
            {mode === "compare" ? (
              <>
                <div className="form-grid">
                  <Field label="Vehicle category" required htmlFor="cmp-category">
                    <select id="cmp-category" value={cmp.category} onChange={(e) => { setCmp({ ...emptyCompare(), category: e.target.value }); setComparison(null); }}>
                      {COMPARE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Sum insured" required={cmp.category !== "tpo"} hint={cmp.category === "tpo" ? "Not used for Third Party Only" : undefined} htmlFor="cmp-si">
                    <MoneyInput id="cmp-si" value={form.sumInsured} onChange={(v) => update({ sumInsured: v })} placeholder="1,500,000" />
                  </Field>
                  {cmp.category === "commercial" && (
                    <Field label="Commercial use" required htmlFor="cmp-use">
                      <select id="cmp-use" value={cmp.commercialUse} onChange={(e) => { setCmp({ ...cmp, commercialUse: e.target.value }); setComparison(null); }}>
                        <option value="">Select…</option>
                        {COMMERCIAL_USES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </Field>
                  )}
                  {cmpInstitutional && (
                    <>
                      <Field label="Institution type" required htmlFor="cmp-inst">
                        <select id="cmp-inst" value={cmp.institutionType} onChange={(e) => setCmp({ ...cmp, institutionType: e.target.value })}>
                          <option value="">Select…</option>
                          {INSTITUTION_TYPES.map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                        </select>
                      </Field>
                      <Field label="Vehicle type" required htmlFor="cmp-vtype">
                        <select id="cmp-vtype" value={cmp.institutionalVehicleType} onChange={(e) => setCmp({ ...cmp, institutionalVehicleType: e.target.value })}>
                          <option value="">Select…</option>
                          {INSTITUTIONAL_VEHICLE_TYPES.map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                        </select>
                      </Field>
                      <Field label="Passenger category" required htmlFor="cmp-pcat">
                        <select id="cmp-pcat" value={cmp.passengerCategory} onChange={(e) => setCmp({ ...cmp, passengerCategory: e.target.value })}>
                          <option value="">Select…</option>
                          {PASSENGER_CATEGORIES.map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                        </select>
                      </Field>
                      <Field label="Number of seats / passengers" required htmlFor="cmp-seats">
                        <input id="cmp-seats" type="number" min="1" value={cmp.seats} onChange={(e) => setCmp({ ...cmp, seats: e.target.value })} />
                      </Field>
                    </>
                  )}
                  <Field label="Amount paid" hint="Optional. Enter a part-payment to show the balance on the quote." htmlFor="nq-paid">
                    <MoneyInput id="nq-paid" value={form.amountPaid} onChange={(v) => update({ amountPaid: v })} placeholder="0" />
                  </Field>
                </div>
              </>
            ) : !selectedClass ? (
              <EmptyState icon={Building2} title="Choose an insurer and class first">
                The fields for that product appear here.
              </EmptyState>
            ) : (
              <>
                <div className="form-grid">
                  {!isFlat ? (
                    <Field label="Sum insured" required htmlFor="nq-si">
                      <MoneyInput id="nq-si" value={form.sumInsured} onChange={(v) => update({ sumInsured: v })} placeholder="1,500,000" />
                    </Field>
                  ) : (
                    <div className="alert alert-info span-2" style={{ margin: 0 }}>This is a flat-premium class. Sum insured is not used for pricing.</div>
                  )}
                  <Field label="Amount paid" hint="Optional. Enter a part-payment to show the balance on the quote." htmlFor="nq-paid">
                    <MoneyInput id="nq-paid" value={form.amountPaid} onChange={(v) => update({ amountPaid: v })} placeholder="0" />
                  </Field>
                  {showTonnage && (
                    <Field label="Tonnage (carrying capacity, tonnes)" required htmlFor="nq-ton">
                      <input id="nq-ton" type="number" min="0" step="0.1" value={form.tonnage} onChange={(e) => update({ tonnage: e.target.value })} />
                    </Field>
                  )}
                  {selectedClass.courtesy_car_options?.length > 0 && (
                    <Field label="Courtesy car" htmlFor="nq-courtesy">
                      <select id="nq-courtesy" value={form.courtesyDays} onChange={(e) => update({ courtesyDays: e.target.value })}>
                        <option value="">Not added</option>
                        {selectedClass.courtesy_car_options.map((c) => (
                          <option key={c.days} value={c.days}>{c.days} days (+{quoteMoney(c.premium)})</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {isInstitutional && (
                    <>
                      <Field label="Institution type" required htmlFor="nq-inst">
                        <select id="nq-inst" value={form.institutionType} onChange={(e) => update({ institutionType: e.target.value })}>
                          <option value="">Select…</option>
                          {(selectedClass.eligible_institution_types || []).map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                        </select>
                      </Field>
                      <Field label="Vehicle type" required htmlFor="nq-vtype">
                        <select id="nq-vtype" value={form.institutionalVehicleType} onChange={(e) => update({ institutionalVehicleType: e.target.value })}>
                          <option value="">Select…</option>
                          {(selectedClass.eligible_vehicle_types || []).map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                        </select>
                      </Field>
                      <Field label="Passenger category" required htmlFor="nq-pcat">
                        <select id="nq-pcat" value={form.passengerCategory} onChange={(e) => update({ passengerCategory: e.target.value })}>
                          <option value="">Select…</option>
                          {(selectedClass.eligible_passenger_categories || []).map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                        </select>
                      </Field>
                    </>
                  )}
                  {showPll && (
                    <Field label={isInstitutional ? "Number of seats / passengers" : "Seats / passengers to cover"} required htmlFor="nq-seats">
                      <input id="nq-seats" type="number" min="0" value={form.pllSeats} onChange={(e) => update({ pllSeats: e.target.value })} />
                    </Field>
                  )}
                  {showPll && !isInstitutional && selectedClass.pll_options?.length > 0 && (
                    <Field label="Passenger type" htmlFor="nq-ptype">
                      <select id="nq-ptype" value={form.pllOptionKey} onChange={(e) => update({ pllOptionKey: e.target.value })}>
                        <option value="">Default</option>
                        {selectedClass.pll_options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                    </Field>
                  )}
                </div>

                {!isFlat && (
                  <div className="optional-cover-grid" style={{ marginTop: 14 }}>
                    <label className="optional-cover-choice">
                      <input type="checkbox" checked={form.ep} onChange={(e) => update({ ep: e.target.checked })} />
                      <span><strong>Excess Protector</strong><small>Own-damage excess protection, where offered.</small></span>
                    </label>
                    <label className="optional-cover-choice">
                      <input type="checkbox" checked={form.pvt} onChange={(e) => update({ pvt: e.target.checked })} />
                      <span><strong>PVT</strong><small>Political Violence &amp; Terrorism cover, where offered.</small></span>
                    </label>
                  </div>
                )}

                {showLrBand && (
                  <fieldset style={{ border: "none", padding: 0, margin: "14px 0 0" }}>
                    <legend style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Loss ratio band</legend>
                    <div className="segmented">
                      <button type="button" aria-selected={form.lrBand === "good"} onClick={() => update({ lrBand: "good" })}>3-yr loss ratio below 60%</button>
                      <button type="button" aria-selected={form.lrBand === "bad"} onClick={() => update({ lrBand: "bad" })}>Above 60%</button>
                    </div>
                  </fieldset>
                )}
              </>
            )}

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={resetForNewQuote} disabled={comparing || submitting}>
                <RotateCcw size={15} /> Clear form
              </button>
              {mode === "compare" ? (
                <button type="button" className="btn btn-primary" disabled={comparing} aria-busy={comparing} onClick={compareRates}>
                  {comparing ? <span className="spinner" /> : <><Scale size={16} /> Compare rates</>}
                </button>
              ) : (
                <button className="btn btn-accent" type="submit" disabled={submitting || !selectedClass} aria-busy={submitting}>
                  {submitting ? <span className="spinner" /> : <><FileCheck2 size={16} /> Generate Quote</>}
                </button>
              )}
            </div>
          </Card>

          {mode === "compare" && comparison && (
            <Card
              title="Insurer comparison"
              icon={Scale}
              sub={comparison.options.length ? `${comparison.options.length} insurer${comparison.options.length === 1 ? "" : "s"} · vehicle age ${comparison.calculated_age_years} yrs · cheapest first` : undefined}
            >
              {comparison.options.length === 0 ? (
                <EmptyState icon={Scale} title="No insurer offers this cover">
                  No insurer covers this category at this sum insured and vehicle age.
                </EmptyState>
              ) : (
                <div className="table-wrap">
                  <table style={{ minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th>Insurer &amp; class</th>
                        <th>Extras</th>
                        <th className="num">Total premium</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.options.map((o, i) => {
                        const key = rowKey(o);
                        const open = expanded === key;
                        return (
                          <Fragment key={key}>
                            <tr>
                              <td style={{ minWidth: 220 }}>
                                <div className="cell-main">
                                  {o.insurer_name}
                                  {i === 0 && <span className="badge badge-green no-dot" style={{ marginLeft: 6 }}>Cheapest</span>}
                                </div>
                                <div className="cell-sub">{o.motor_class_label}{o.tonnage_required && " · needs tonnage"}</div>
                                {(o.benefits?.length > 0 || o.excess?.length > 0 || o.limits?.length > 0) && (
                                  <button type="button" className="cell-link" style={{ border: "none", background: "none", padding: 0, marginTop: 4, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }} aria-expanded={open} onClick={() => setExpanded(open ? null : key)}>
                                    {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {open ? "Hide" : "View"} benefits &amp; excess
                                  </button>
                                )}
                              </td>
                              <td><RowExtras option={o} picked={rowExtras[key] || {}} onChange={(patch) => setRowExtra(o, patch)} /></td>
                              <td className="num" style={{ whiteSpace: "nowrap" }}>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>{quoteMoney(rowTotal(o))}</div>
                                <div className="cell-sub">Basic {quoteMoney(o.basic_premium)}</div>
                              </td>
                              <td style={{ width: 150, textAlign: "right" }}>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${i === 0 ? "btn-accent" : "btn-primary"}`}
                                  style={{ whiteSpace: "nowrap" }}
                                  disabled={generatingKey !== null}
                                  aria-busy={generatingKey === key}
                                  onClick={() => generateFromOption(o)}
                                >
                                  {generatingKey === key ? <span className="spinner" /> : "Generate quote"}
                                </button>
                              </td>
                            </tr>
                            {open && (
                              <tr>
                                <td colSpan={4} style={{ background: "var(--c-row-hover)" }}>
                                  <div className="grid-3" style={{ fontSize: 12.5 }}>
                                    {[["Benefits", o.benefits], ["Excess", o.excess], ["Limits", o.limits]].map(([title, list]) => (
                                      <div key={title}>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
                                        {list?.length ? (
                                          <ul style={{ margin: 0, paddingLeft: 16, color: "var(--c-text-2)", lineHeight: 1.5 }}>
                                            {list.map((x) => <li key={x}>{x}</li>)}
                                          </ul>
                                        ) : <div className="hint">Per insurer's standard policy wording</div>}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {comparison.ineligible_options?.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary className="hint" style={{ cursor: "pointer" }}>
                    {comparison.ineligible_options.length} not available for this vehicle
                  </summary>
                  <ul className="hint" style={{ marginTop: 6 }}>
                    {comparison.ineligible_options.map((x, i) => (
                      <li key={i}><strong>{x.insurer_name}</strong> — {x.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          )}
        </div>
      </form>
    </div>
  );
}
