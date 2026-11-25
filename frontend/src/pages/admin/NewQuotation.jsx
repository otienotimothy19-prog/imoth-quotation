import { useEffect, useMemo, useRef, useState } from "react";
import { api, downloadBlob, errorMessage, quoteMoney, serverFilename } from "../../api/client";
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

  function chooseOption(option) {
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

  if (result) {
    return (
      <div>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>Quotation Generated</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="card">
          <div className="row2">
            <div><strong>Quotation No.</strong><div>{result.quotation_number}</div></div>
            <div><strong>Client</strong><div>{result.client_name}</div></div>
          </div>
          <div className="row2">
            <div><strong>Insurer</strong><div>{result.insurer_name}</div></div>
            <div><strong>Class</strong><div>{result.vehicle_class_label}</div></div>
          </div>
          <div className="row2">
            <div><strong>Registration</strong><div>{result.registration_no}</div></div>
            <div><strong>Sum Insured</strong><div>{quoteMoney(result.sum_insured)}</div></div>
          </div>

          <table style={{ width: "100%", marginTop: 16, fontSize: 13.5, borderCollapse: "collapse" }}>
            <tbody>
              {result.items.map((it, i) => (
                <tr key={i}>
                  <td style={{ padding: "4px 0" }}>{it.label}</td>
                  <td style={{ padding: "4px 0", textAlign: "right" }}>{quoteMoney(it.amount)}</td>
                </tr>
              ))}
              <tr><td style={{ padding: "4px 0" }}>Sub-total</td><td style={{ padding: "4px 0", textAlign: "right" }}>{quoteMoney(result.subtotal)}</td></tr>
              <tr><td style={{ padding: "4px 0" }}>Levies</td><td style={{ padding: "4px 0", textAlign: "right" }}>{quoteMoney(result.levies)}</td></tr>
              <tr><td style={{ padding: "4px 0" }}>Stamp Duty</td><td style={{ padding: "4px 0", textAlign: "right" }}>{quoteMoney(result.stamp_duty)}</td></tr>
              <tr style={{ fontWeight: 700, borderTop: "1px solid #dce4ee" }}>
                <td style={{ padding: "6px 0" }}>Total Premium</td>
                <td style={{ padding: "6px 0", textAlign: "right" }}>{quoteMoney(result.total_premium)}</td>
              </tr>
              {result.amount_paid > 0 && (
                <>
                  <tr><td style={{ padding: "4px 0" }}>Amount Paid</td><td style={{ padding: "4px 0", textAlign: "right" }}>{quoteMoney(result.amount_paid)}</td></tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td style={{ padding: "4px 0" }}>Balance Due</td>
                    <td style={{ padding: "4px 0", textAlign: "right" }}>{quoteMoney(result.balance)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={downloadPdf} disabled={downloading}>
              {downloading ? "Preparing PDF…" : "⬇ Download PDF"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetForNewQuote}>+ New Quotation</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>New Quotation</h1>
      <p className="hint" style={{ marginBottom: 16 }}>
        Compare every insurer's rate for the vehicle, choose one, then generate the quotation.
      </p>
      {error && <div className="alert alert-error">{error}</div>}

      <form className="card" onSubmit={submit}>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>Vehicle</h2>
        <div className="row2">
          <div>
            <label className="first">Registration No.</label>
            <input type="text" value={form.regNo} onChange={(e) => update({ regNo: e.target.value.toUpperCase() })} placeholder="e.g. KCZ 538G" />
          </div>
          <div>
            <label className="first">Year of Manufacture</label>
            <input type="number" value={form.yom} onChange={(e) => update({ yom: e.target.value })} placeholder={`e.g. ${new Date().getFullYear() - 5}`} />
          </div>
        </div>
        <div className="row2">
          <div>
            <label htmlFor="nq-make">Make (optional)</label>
            <VehicleMakeSelect id="nq-make" value={form.make} onChange={(make) => update({ make })} />
          </div>
          <div>
            <label>Model (optional)</label>
            <input type="text" value={form.model} onChange={(e) => update({ model: e.target.value })} placeholder="e.g. Axio" />
          </div>
        </div>

        <h2 style={{ fontSize: 15, margin: "20px 0 10px" }}>Cover</h2>
        <div role="tablist" aria-label="How to choose the insurer" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button type="button" role="tab" aria-selected={mode === "compare"} className={`btn btn-sm ${mode === "compare" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("compare")}>
            Compare insurers
          </button>
          <button type="button" role="tab" aria-selected={mode === "pick"} className={`btn btn-sm ${mode === "pick" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("pick")}>
            Choose one insurer
          </button>
        </div>

        {mode === "compare" && (
          <div>
            <div className="row2">
              <div>
                <label className="first" htmlFor="cmp-category">Vehicle Category</label>
                <select id="cmp-category" value={cmp.category} onChange={(e) => { setCmp({ ...emptyCompare(), category: e.target.value }); setComparison(null); }}>
                  {COMPARE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="first" htmlFor="cmp-si">Sum Insured (KES){cmp.category === "tpo" && <span className="hint"> (not used for TPO)</span>}</label>
                <input id="cmp-si" type="number" min="0" step="1000" value={form.sumInsured} onChange={(e) => update({ sumInsured: e.target.value })} placeholder="e.g. 1500000" />
              </div>
            </div>
            {cmp.category === "commercial" && (
              <>
                <label htmlFor="cmp-use">Commercial Use</label>
                <select id="cmp-use" value={cmp.commercialUse} onChange={(e) => { setCmp({ ...cmp, commercialUse: e.target.value }); setComparison(null); }}>
                  <option value="">Select…</option>
                  {COMMERCIAL_USES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </>
            )}
            {cmpInstitutional && (
              <>
                <div className="row2">
                  <div>
                    <label>Institution Type</label>
                    <select value={cmp.institutionType} onChange={(e) => setCmp({ ...cmp, institutionType: e.target.value })}>
                      <option value="">Select…</option>
                      {INSTITUTION_TYPES.map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Vehicle Type</label>
                    <select value={cmp.institutionalVehicleType} onChange={(e) => setCmp({ ...cmp, institutionalVehicleType: e.target.value })}>
                      <option value="">Select…</option>
                      {INSTITUTIONAL_VEHICLE_TYPES.map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="row2">
                  <div>
                    <label>Passenger Category</label>
                    <select value={cmp.passengerCategory} onChange={(e) => setCmp({ ...cmp, passengerCategory: e.target.value })}>
                      <option value="">Select…</option>
                      {PASSENGER_CATEGORIES.map((v) => <option key={v} value={v}>{titleCase(v)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Number of Seats/Passengers</label>
                    <input type="number" min="1" value={cmp.seats} onChange={(e) => setCmp({ ...cmp, seats: e.target.value })} />
                  </div>
                </div>
              </>
            )}

            <button type="button" className="btn btn-secondary" style={{ marginTop: 14 }} disabled={comparing} aria-busy={comparing} onClick={compareRates}>
              {comparing ? <span className="spinner spinner-dark" /> : "Compare rates"}
            </button>

            {comparison && (
              <div style={{ marginTop: 16 }}>
                {comparison.options.length === 0 ? (
                  <div className="alert alert-info">No insurer offers this category at this sum insured and vehicle age.</div>
                ) : (
                  <>
                    <div className="hint" style={{ marginBottom: 8 }}>
                      {comparison.options.length} insurer{comparison.options.length === 1 ? "" : "s"} · vehicle age {comparison.calculated_age_years} yrs · tick extras on any insurer to see its price with them.
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Insurer &amp; Class</th>
                            <th className="num">Total Premium</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.options.map((o, i) => (
                            <tr key={`${o.insurer_id}-${o.motor_class_id}`}>
                              <td>
                                <strong>{o.insurer_name}</strong>
                                {i === 0 && <span className="badge badge-green" style={{ marginLeft: 6 }}>Cheapest</span>}
                                <div className="hint">
                                  {o.motor_class_label}
                                  {o.tonnage_required && " · needs tonnage"}
                                </div>
                                <RowExtras option={o} picked={rowExtras[rowKey(o)] || {}} onChange={(patch) => setRowExtra(o, patch)} />
                              </td>
                              <td className="num" style={{ whiteSpace: "nowrap" }}>
                                <strong>{quoteMoney(rowTotal(o))}</strong>
                                <div className="hint">Basic {quoteMoney(o.basic_premium)}</div>
                              </td>
                              <td>
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => chooseOption(o)}>Choose</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {comparison.ineligible_options?.length > 0 && (
                  <details style={{ marginTop: 10 }}>
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
              </div>
            )}
          </div>
        )}

        {mode === "pick" && (
        <>
        <div className="row2">
          <div>
            <label className="first">Insurance Company</label>
            <select value={insurerId} onChange={(e) => setInsurerId(e.target.value)}>
              <option value="">Select insurer…</option>
              {insurers.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="first">Class of Business</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!insurerId || loadingClasses}>
              <option value="">{loadingClasses ? "Loading…" : "Select class…"}</option>
              {Object.entries(classesByCategory).map(([cat, list]) => (
                <optgroup key={cat} label={CATEGORY_LABELS[cat] || cat}>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {selectedClass && (
          <>
            {!isFlat ? (
              <>
                <label>Sum Insured (KES)</label>
                <input type="number" min="0" step="1000" value={form.sumInsured} onChange={(e) => update({ sumInsured: e.target.value })} placeholder="e.g. 1500000" />
              </>
            ) : (
              <div className="hint" style={{ marginTop: 10 }}>This is a flat-premium class — Sum Insured is not used for pricing.</div>
            )}

            {!isFlat && (
              <div className="optional-cover-grid" style={{ marginTop: 10 }}>
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

            {selectedClass.courtesy_car_options?.length > 0 && (
              <>
                <label htmlFor="nq-courtesy">Courtesy Car</label>
                <select id="nq-courtesy" value={form.courtesyDays} onChange={(e) => update({ courtesyDays: e.target.value })}>
                  <option value="">Not added</option>
                  {selectedClass.courtesy_car_options.map((c) => (
                    <option key={c.days} value={c.days}>{c.days} days (+{quoteMoney(c.premium)})</option>
                  ))}
                </select>
              </>
            )}

            {showLrBand && (
              <div style={{ marginTop: 12 }}>
                <label className="first">Loss Ratio Band</label>
                <label style={{ display: "block", fontWeight: 400 }}>
                  <input type="radio" name="lrBand" checked={form.lrBand === "good"} onChange={() => update({ lrBand: "good" })} /> 3-yr Loss Ratio below 60%
                </label>
                <label style={{ display: "block", fontWeight: 400 }}>
                  <input type="radio" name="lrBand" checked={form.lrBand === "bad"} onChange={() => update({ lrBand: "bad" })} /> 3-yr Loss Ratio above 60%
                </label>
              </div>
            )}

            {showTonnage && (
              <>
                <label>Tonnage (carrying capacity, in tonnes)</label>
                <input type="number" min="0" step="0.1" value={form.tonnage} onChange={(e) => update({ tonnage: e.target.value })} />
              </>
            )}

            {isInstitutional && (
              <div className="row2" style={{ marginTop: 12 }}>
                <div>
                  <label className="first">Institution Type</label>
                  <select value={form.institutionType} onChange={(e) => update({ institutionType: e.target.value })}>
                    <option value="">Select…</option>
                    {(selectedClass.eligible_institution_types || []).map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="first">Vehicle Type</label>
                  <select value={form.institutionalVehicleType} onChange={(e) => update({ institutionalVehicleType: e.target.value })}>
                    <option value="">Select…</option>
                    {(selectedClass.eligible_vehicle_types || []).map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {isInstitutional && (
              <div className="row2">
                <div>
                  <label>Passenger Category</label>
                  <select value={form.passengerCategory} onChange={(e) => update({ passengerCategory: e.target.value })}>
                    <option value="">Select…</option>
                    {(selectedClass.eligible_passenger_categories || []).map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Number of Seats/Passengers</label>
                  <input type="number" min="0" value={form.pllSeats} onChange={(e) => update({ pllSeats: e.target.value })} />
                </div>
              </div>
            )}

            {showPll && !isInstitutional && (
              <div className="row2" style={{ marginTop: 12 }}>
                <div>
                  <label>Number of Seats/Passengers to Cover</label>
                  <input type="number" min="0" value={form.pllSeats} onChange={(e) => update({ pllSeats: e.target.value })} />
                </div>
                {selectedClass.pll_options && selectedClass.pll_options.length > 0 && (
                  <div>
                    <label>Passenger Type</label>
                    <select value={form.pllOptionKey} onChange={(e) => update({ pllOptionKey: e.target.value })}>
                      <option value="">Default</option>
                      {selectedClass.pll_options.map((o) => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        </>
        )}

        <label style={{ marginTop: 16 }}>
          Amount Paid (KES) <span style={{ fontWeight: 400, color: "var(--muted)" }}>— optional</span>
        </label>
        <input type="number" min="0" step="100" value={form.amountPaid} onChange={(e) => update({ amountPaid: e.target.value })} />
        <div className="hint">Leave as 0 for a fresh quotation. Enter a part-payment to show the outstanding balance on the quote.</div>

        <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: 20 }}>
          {submitting ? "Generating…" : "Generate Quote"}
        </button>
      </form>
    </div>
  );
}
