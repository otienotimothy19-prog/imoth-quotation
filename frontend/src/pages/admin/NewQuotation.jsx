import { useEffect, useMemo, useState } from "react";
import { api, downloadBlob, errorMessage, quoteMoney } from "../../api/client";

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

function emptyForm() {
  return {
    clientName: "",
    idOrPassport: "",
    phone: "",
    email: "",
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
    institutionType: "",
    institutionalVehicleType: "",
    passengerCategory: "",
  };
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
      .then((res) => setClasses(res.data.filter((c) => c.active)))
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
      lrBand: "good", institutionType: "", institutionalVehicleType: "", passengerCategory: "",
    });
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
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.clientName.trim()) return setError("Client / Insured name is required.");
    if (form.phone.trim().length < 7) return setError("A valid phone number is required.");
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
      client: {
        full_name: form.clientName.trim(),
        id_or_passport: form.idOrPassport.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
      },
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
      downloadBlob(res.data, `Imoth-Motor-Quote-${result.insurer_name}-${result.quotation_number}.pdf`);
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
        Generate a quotation directly for a client on the phone or in person — pick the insurer and class yourself and it's priced instantly.
      </p>
      {error && <div className="alert alert-error">{error}</div>}

      <form className="card" onSubmit={submit}>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>Client</h2>
        <label className="first">Client / Insured Name</label>
        <input value={form.clientName} onChange={(e) => update({ clientName: e.target.value })} placeholder="e.g. John Mwangi" />
        <div className="row2">
          <div>
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="e.g. 0712345678" />
          </div>
          <div>
            <label>Email (optional)</label>
            <input type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} />
          </div>
        </div>
        <label>ID / Passport No. (optional)</label>
        <input value={form.idOrPassport} onChange={(e) => update({ idOrPassport: e.target.value })} />

        <h2 style={{ fontSize: 15, margin: "20px 0 10px" }}>Vehicle</h2>
        <div className="row2">
          <div>
            <label className="first">Registration No.</label>
            <input value={form.regNo} onChange={(e) => update({ regNo: e.target.value.toUpperCase() })} placeholder="e.g. KCZ 538G" />
          </div>
          <div>
            <label className="first">Year of Manufacture</label>
            <input type="number" value={form.yom} onChange={(e) => update({ yom: e.target.value })} placeholder={`e.g. ${new Date().getFullYear() - 5}`} />
          </div>
        </div>
        <div className="row2">
          <div>
            <label>Make (optional)</label>
            <input value={form.make} onChange={(e) => update({ make: e.target.value })} placeholder="e.g. Toyota" />
          </div>
          <div>
            <label>Model (optional)</label>
            <input value={form.model} onChange={(e) => update({ model: e.target.value })} placeholder="e.g. Axio" />
          </div>
        </div>

        <h2 style={{ fontSize: 15, margin: "20px 0 10px" }}>Cover</h2>
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
