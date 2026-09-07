import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage, quoteMoney as money, saveQuoteFlow } from "../../api/client";
import QuoteOfferActions from "../../components/QuoteOfferActions";
import QuoteShell from "../../components/wizard/QuoteShell";

const CATEGORIES = [
  { value: "private", label: "Private Car" },
  { value: "commercial", label: "Commercial" },
  { value: "psv", label: "PSV / Chauffeur Driven" },
  { value: "tuktuk", label: "PSV Tuk Tuk" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "asset", label: "Asset (New Units)" },
  { value: "special", label: "Special Type (Farm / Construction)" },
];

// The only 4 Commercial branches ever offered to a customer. Other
// insurer-internal commercial products (Hybrid, Private Hire, Online-
// Hailed, Tanker) are admin-managed but never shown here.
const COMMERCIAL_USES = [
  {
    value: "own_goods",
    label: "Own Goods",
    desc: "Carries goods belonging to the vehicle owner or their business.",
  },
  {
    value: "general_cartage",
    label: "General Cartage",
    desc: "Carries other people's goods for hire or reward.",
  },
  {
    value: "commercial_institutional",
    label: "Commercial Institutional",
    desc: "School, church, company, NGO, hospital or government vehicle carrying authorized passengers.",
  },
  {
    value: "commercial_tuktuk",
    label: "Commercial Tuk Tuk",
    desc: "A Tuk Tuk used commercially for carrying goods or conducting commercial business.",
  },
];

const INSTITUTION_TYPES = [
  { value: "SCHOOL", label: "School" },
  { value: "CHURCH", label: "Church" },
  { value: "COMPANY", label: "Company" },
  { value: "NGO", label: "NGO" },
  { value: "GOVERNMENT", label: "Government" },
  { value: "HOSPITAL", label: "Hospital" },
  { value: "OTHER", label: "Other" },
];

const INSTITUTIONAL_VEHICLE_TYPES = [
  { value: "VAN", label: "Van" },
  { value: "MINIBUS", label: "Minibus" },
  { value: "BUS", label: "Bus" },
  { value: "OTHER", label: "Other" },
];

const PASSENGER_CATEGORIES = [
  { value: "STUDENTS", label: "Students" },
  { value: "STAFF", label: "Staff" },
  { value: "CHURCH_MEMBERS", label: "Church Members" },
  { value: "GENERAL_INSTITUTIONAL", label: "General (Other Institutional Passengers)" },
];

const emptyVehicle = { registration_no: "", make: "", model: "", year_of_manufacture: "" };

const MIN_MANUFACTURE_YEAR = 1960;
const CURRENT_YEAR = new Date().getFullYear();

// Calendar-year age: current year minus year of manufacture. This is a
// calendar-year difference, not an exact month/day age -- and it's for
// display only. The backend independently recalculates and enforces this
// from year_of_manufacture; nothing derived here is trusted for pricing.
function calculateVehicleAge(yearOfManufacture) {
  const year = Number(yearOfManufacture);
  if (!yearOfManufacture || !Number.isInteger(year)) return null;
  return CURRENT_YEAR - year;
}

export default function QuoteWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0 = Vehicle & Cover, 1 = Compare Quotes
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [fieldErrors, setFieldErrors] = useState({});
  const [coverType, setCoverType] = useState("comprehensive");
  const [category, setCategory] = useState("private");
  const [sumInsured, setSumInsured] = useState("");
  const [numPassengers, setNumPassengers] = useState("");
  const [tonnage, setTonnage] = useState("");
  const [pvt, setPvt] = useState(false);
  const [excessProtector, setExcessProtector] = useState(false);
  const [commercialUse, setCommercialUse] = useState("");
  const [institutionType, setInstitutionType] = useState("");
  const [institutionalVehicleType, setInstitutionalVehicleType] = useState("");
  const [passengerCategory, setPassengerCategory] = useState("");
  const [options, setOptions] = useState([]);
  const [ineligibleOptions, setIneligibleOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState(null);
  const [tonnagePromptId, setTonnagePromptId] = useState(null);
  const [tonnagePromptValue, setTonnagePromptValue] = useState("");

  const isInstitutional = category === "commercial" && commercialUse === "commercial_institutional";

  function handleCategoryChange(value) {
    setCategory(value);
    setCommercialUse("");
    setInstitutionType("");
    setInstitutionalVehicleType("");
    setPassengerCategory("");
    setNumPassengers("");
    setTonnage("");
    setOptions([]);
    setIneligibleOptions([]);
  }

  const calculatedAge = calculateVehicleAge(vehicle.year_of_manufacture);

  function validateVehicle() {
    const errs = {};
    if (!vehicle.registration_no.trim()) {
      errs.registration_no = "Please enter the vehicle registration number.";
    }
    if (!vehicle.year_of_manufacture) {
      errs.year_of_manufacture = "Please enter the year of manufacture.";
    } else {
      const year = Number(vehicle.year_of_manufacture);
      if (!Number.isInteger(year)) {
        errs.year_of_manufacture = `Enter a year between ${MIN_MANUFACTURE_YEAR} and ${CURRENT_YEAR}.`;
      } else if (year > CURRENT_YEAR) {
        errs.year_of_manufacture = `Year of manufacture cannot be later than ${CURRENT_YEAR}.`;
      } else if (year < MIN_MANUFACTURE_YEAR) {
        errs.year_of_manufacture = `Enter a year between ${MIN_MANUFACTURE_YEAR} and ${CURRENT_YEAR}.`;
      }
    }
    return errs;
  }

  function validateCover() {
    if (coverType === "comprehensive" && (!sumInsured || Number(sumInsured) <= 0)) {
      return "Please enter the Sum Insured.";
    }
    if (coverType === "comprehensive" && category === "psv" && (!numPassengers || Number(numPassengers) <= 0)) {
      return "Please enter the number of passengers.";
    }
    if (coverType === "comprehensive" && category === "commercial") {
      if (!commercialUse) {
        return "Please select what this commercial vehicle is used for.";
      }
      if (commercialUse === "commercial_institutional") {
        if (!institutionType) return "Please select the institution type.";
        if (!institutionalVehicleType) return "Please select the vehicle type.";
        if (!passengerCategory) return "Please select the passenger category.";
        if (!numPassengers || !Number.isInteger(Number(numPassengers)) || Number(numPassengers) <= 0) {
          return "Please enter the number of passenger seats, excluding the driver.";
        }
      } else if (tonnage && Number(tonnage) < 0) {
        return "Tonnage cannot be negative.";
      }
    }
    return "";
  }

  function cleanVehicle() {
    return {
      registration_no: vehicle.registration_no.trim(),
      make: vehicle.make.trim() || null,
      model: vehicle.model.trim() || null,
      year_of_manufacture: Number(vehicle.year_of_manufacture),
    };
  }

  // Passenger Legal Liability: PSV classes charge per passenger (Kshs
  // 500/passenger where the selected insurer's class offers it). Sent as
  // options.pll_seats -- the backend looks up each motor class's own
  // documented per-seat rate, so this never hard-codes the 500 figure.
  //
  // Tonnage: commercial (goods-carrying) classes may split their rate
  // bands by carrying capacity as well as Sum Insured (e.g. up to 3T vs
  // 3.01-8T) -- optional, since not every insurer's commercial product
  // uses this. Left blank, pricing falls back to the Sum-Insured-only band.
  function cleanOptions() {
    const extensions = coverType === "comprehensive"
      ? { ...(pvt ? { pvt: true } : {}), ...(excessProtector ? { ep: true } : {}) }
      : {};
    if (coverType === "comprehensive" && category === "psv" && numPassengers) {
      return { ...extensions, pll_seats: Number(numPassengers) };
    }
    if (coverType === "comprehensive" && isInstitutional && numPassengers) {
      return { ...extensions, pll_seats: Number(numPassengers) };
    }
    if (coverType === "comprehensive" && category === "commercial" && !isInstitutional && tonnage) {
      return { ...extensions, tonnage: Number(tonnage) };
    }
    return extensions;
  }

  function institutionalFields() {
    if (!isInstitutional) {
      return { commercial_use: category === "commercial" ? commercialUse || null : null, institution_type: null, institutional_vehicle_type: null, passenger_category: null };
    }
    return {
      commercial_use: commercialUse,
      institution_type: institutionType,
      institutional_vehicle_type: institutionalVehicleType,
      passenger_category: passengerCategory,
    };
  }

  async function goToCompare() {
    setError("");
    const effectiveCategory = coverType === "third_party_only" ? "tpo" : category;
    const si = coverType === "third_party_only" ? 0 : Number(sumInsured);
    setLoading(true);
    try {
      const res = await api.post("/api/quotes/compare", {
        vehicle: cleanVehicle(),
        category: effectiveCategory,
        sum_insured: si,
        options: cleanOptions(),
        ...institutionalFields(),
      });
      setOptions(res.data.options);
      setIneligibleOptions(res.data.ineligible_options || []);
    } catch (err) {
      setOptions([]);
      setIneligibleOptions([]);
      setError(errorMessage(err, "Could not calculate quotes for these details."));
    } finally {
      setLoading(false);
    }
  }

  // `tonnageOverride` is supplied when the selected option flagged
  // `tonnage_required` -- the insurer's own class needs a tonnage figure
  // to price this vehicle, prompted for inline on the result card.
  async function selectOption(opt, tonnageOverride) {
    setError("");
    if (!opt.offer_id && opt.tonnage_required && !(Number(tonnageOverride) > 0)) {
      setError("Please enter the vehicle tonnage required by this insurer.");
      return;
    }
    setSelecting(opt.motor_class_id);
    const si = coverType === "third_party_only" ? 0 : Number(sumInsured);
    const selectOptions = { ...cleanOptions() };
    if (tonnageOverride) selectOptions.tonnage = Number(tonnageOverride);
    const effectiveCategory = coverType === "third_party_only" ? "tpo" : category;
    try {
      let secured = opt;
      if (!secured.offer_id) {
        const compared = await api.post("/api/quotes/compare", {
          vehicle: cleanVehicle(), category: effectiveCategory, sum_insured: si,
          options: selectOptions, ...institutionalFields(),
        });
        secured = compared.data.options.find(item => item.motor_class_id === opt.motor_class_id);
        if (!secured?.offer_id) throw new Error("This quotation could not be prepared.");
        setOptions(current => current.map(item => item.motor_class_id === secured.motor_class_id ? secured : item));
        setTonnagePromptId(null);
        setSelecting(null);
        return; // Show the final tonnage-priced total before any acceptance.
      }
      const res = await api.post(`/api/quote-offers/${secured.offer_id}/select`, {}, {
        headers: { Authorization: `Bearer ${secured.offer_token}` },
      });
      const { access_token, ...selectionSummary } = res.data;
      saveQuoteFlow({
        selectionId: res.data.selection_id,
        quotationId: null,
        token: access_token,
        selectionSummary,
      });
      navigate(`/quote/select/${res.data.selection_id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not select this quotation."));
      setSelecting(null);
    }
  }

  if (step === 0) {
    return (
      <QuoteShell currentIndex={0} heading="Tell Us About Your Vehicle" subtitle="Enter your vehicle and cover details to compare eligible insurers.">
        <div className="wizard-form">
          {error && <div className="alert alert-error">{error}</div>}

          <section className="wizard-section">
            <h2 className="wizard-section-title">Your Vehicle</h2>

            <div className="field-group">
              <label className="first">Registration Number</label>
              <input
                type="text"
                value={vehicle.registration_no}
                onChange={(e) => setVehicle({ ...vehicle, registration_no: e.target.value.toUpperCase() })}
                placeholder="e.g. KCZ 538G"
                aria-invalid={!!fieldErrors.registration_no}
              />
              {fieldErrors.registration_no && <div className="error-text">{fieldErrors.registration_no}</div>}
            </div>

            <div className="row2">
              <div className="field-group">
                <div className="field-label-row">
                  <label>Make</label>
                  <span className="optional-badge">Optional</span>
                </div>
                <input type="text" value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} placeholder="e.g. Toyota" />
              </div>
              <div className="field-group">
                <div className="field-label-row">
                  <label>Model</label>
                  <span className="optional-badge">Optional</span>
                </div>
                <input type="text" value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} placeholder="e.g. Prado" />
              </div>
            </div>

            <div className="row2">
              <div className="field-group">
                <label className="first">Year of Manufacture</label>
                <input
                  type="number"
                  value={vehicle.year_of_manufacture}
                  onChange={(e) => {
                    setVehicle({ ...vehicle, year_of_manufacture: e.target.value });
                    // A new manufacture year invalidates any comparison
                    // already run against the previous age, and any stale
                    // error message for a value that's since been edited.
                    setOptions([]);
                    setIneligibleOptions([]);
                    setFieldErrors((prev) => ({ ...prev, year_of_manufacture: undefined }));
                  }}
                  placeholder={`e.g. ${CURRENT_YEAR - 5}`}
                  min={MIN_MANUFACTURE_YEAR}
                  max={CURRENT_YEAR}
                  step={1}
                  aria-invalid={!!fieldErrors.year_of_manufacture}
                />
                {fieldErrors.year_of_manufacture && <div className="error-text">{fieldErrors.year_of_manufacture}</div>}
              </div>
              <div className="field-group">
                <label>Calculated Vehicle Age</label>
                <div className="calculated-field" aria-live="polite">
                  {calculatedAge === null ? "Calculated automatically" : `${calculatedAge} year${calculatedAge === 1 ? "" : "s"}`}
                </div>
                <div className="hint">Automatically calculated from the year of manufacture and used to show eligible rates.</div>
              </div>
            </div>
          </section>

          <section className="wizard-section">
            <h2 className="wizard-section-title">Cover Details</h2>

            <div className="field-group">
              <label className="first">Cover Type</label>
              <div className="option-card-grid">
                <button
                  type="button"
                  className={`option-card ${coverType === "comprehensive" ? "option-card-selected" : ""}`}
                  onClick={() => {
                    setCoverType("comprehensive");
                    setOptions([]);
                    setIneligibleOptions([]);
                  }}
                  aria-pressed={coverType === "comprehensive"}
                >
                  <div className="option-card-title">Comprehensive</div>
                  <div className="option-card-desc">Covers your own vehicle plus third-party liability.</div>
                </button>
                <button
                  type="button"
                  className={`option-card ${coverType === "third_party_only" ? "option-card-selected" : ""}`}
                  onClick={() => {
                    setCoverType("third_party_only");
                    setOptions([]);
                    setIneligibleOptions([]);
                  }}
                  aria-pressed={coverType === "third_party_only"}
                >
                  <div className="option-card-title">Third Party Only</div>
                  <div className="option-card-desc">Covers legal liability for injury or damage to others.</div>
                </button>
              </div>
            </div>

            {coverType === "comprehensive" && (
              <div className="row2">
                <div className="field-group">
                  <label htmlFor="wizard-category-select">Vehicle Class</label>
                  <select id="wizard-category-select" value={category} onChange={(e) => handleCategoryChange(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-group">
                  <label>Sum Insured (KES)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={sumInsured}
                    onChange={(e) => {
                      setSumInsured(e.target.value);
                      setOptions([]);
                      setIneligibleOptions([]);
                    }}
                    placeholder="e.g. 1500000"
                  />
                  <div className="hint">Your vehicle's current market value.</div>
                </div>
              </div>
            )}

            {coverType === "comprehensive" && category === "psv" && (
              <div className="field-group">
                <label htmlFor="wizard-passengers-input">Number of Passengers</label>
                <input
                  id="wizard-passengers-input"
                  type="number"
                  min="1"
                  step="1"
                  value={numPassengers}
                  onChange={(e) => setNumPassengers(e.target.value)}
                  placeholder="e.g. 14"
                />
                <div className="hint">Passenger Legal Liability is charged per passenger (Kshs 500/passenger where applicable) and is added to the premium.</div>
              </div>
            )}

            {coverType === "comprehensive" && category === "commercial" && (
              <div className="field-group">
                <label className="first">What is this commercial vehicle used for?</label>
                <div className="option-card-grid">
                  {COMMERCIAL_USES.map((u) => (
                    <button
                      key={u.value}
                      type="button"
                      className={`option-card ${commercialUse === u.value ? "option-card-selected" : ""}`}
                      onClick={() => {
                        setCommercialUse(u.value);
                        setInstitutionType("");
                        setInstitutionalVehicleType("");
                        setPassengerCategory("");
                        setNumPassengers("");
                        setTonnage("");
                        setOptions([]);
                        setIneligibleOptions([]);
                      }}
                      aria-pressed={commercialUse === u.value}
                    >
                      <div className="option-card-title">{u.label}</div>
                      <div className="option-card-desc">{u.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {coverType === "comprehensive" && isInstitutional && (
              <>
                <div className="row2">
                  <div className="field-group">
                    <label htmlFor="wizard-institution-type-select">Institution Type</label>
                    <select
                      id="wizard-institution-type-select"
                      value={institutionType}
                      onChange={(e) => setInstitutionType(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {INSTITUTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group">
                    <label htmlFor="wizard-institutional-vehicle-type-select">Vehicle Type</label>
                    <select
                      id="wizard-institutional-vehicle-type-select"
                      value={institutionalVehicleType}
                      onChange={(e) => setInstitutionalVehicleType(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {INSTITUTIONAL_VEHICLE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="row2">
                  <div className="field-group">
                    <label htmlFor="wizard-passenger-category-select">Passenger Category</label>
                    <select
                      id="wizard-passenger-category-select"
                      value={passengerCategory}
                      onChange={(e) => setPassengerCategory(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {PASSENGER_CATEGORIES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group">
                    <label htmlFor="wizard-institutional-seats-input">Passenger Seats (excluding the driver)</label>
                    <input
                      id="wizard-institutional-seats-input"
                      type="number"
                      min="1"
                      step="1"
                      value={numPassengers}
                      onChange={(e) => setNumPassengers(e.target.value)}
                      placeholder="e.g. 32"
                    />
                    <div className="hint">Passenger Legal Liability is calculated from this insurer's rate for the selected passenger category.</div>
                  </div>
                </div>
              </>
            )}

            {coverType === "comprehensive" && category === "commercial" && commercialUse && !isInstitutional && (
              <div className="field-group">
                <div className="field-label-row">
                  <label htmlFor="wizard-tonnage-input">Vehicle Tonnage</label>
                  <span className="optional-badge">Optional</span>
                </div>
                <input
                  id="wizard-tonnage-input"
                  type="number"
                  min="0"
                  step="any"
                  value={tonnage}
                  onChange={(e) => setTonnage(e.target.value)}
                  placeholder="e.g. 5"
                />
                <div className="hint">Some insurers price goods-carrying vehicles (including Tuk Tuks) by carrying capacity as well as Sum Insured. Leave blank if unsure.</div>
              </div>
            )}
          </section>

          {coverType === "comprehensive" && <section className="optional-cover-section">
            <h2 className="wizard-section-title">Optional cover</h2>
            <p className="hint">Choose additional protection to include in your quotation. Prices follow each insurer’s rates. Cover already included is not charged twice; mandatory insurer cover still applies.</p>
            <div className="optional-cover-grid">
              <label className="optional-cover-choice">
                <input type="checkbox" checked={pvt} onChange={e => setPvt(e.target.checked)} />
                <span><strong>PVT</strong><small>Political Violence &amp; Terrorism cover, where offered.</small></span>
              </label>
              <label className="optional-cover-choice">
                <input type="checkbox" checked={excessProtector} onChange={e => setExcessProtector(e.target.checked)} />
                <span><strong>Excess Protector</strong><small>Own-damage excess protection, where offered.</small></span>
              </label>
            </div>
          </section>}

          <div className="quote-footer-nav quote-footer-nav-end">
            <button
              className="btn btn-primary"
              disabled={loading}
              onClick={async () => {
                const vehicleErrs = validateVehicle();
                setFieldErrors(vehicleErrs);
                if (Object.keys(vehicleErrs).length > 0) {
                  setError("Please fix the highlighted fields to continue.");
                  return;
                }
                const coverErr = validateCover();
                if (coverErr) {
                  setError(coverErr);
                  return;
                }
                setError("");
                setStep(1);
                await goToCompare();
              }}
            >
              {loading ? <span className="spinner" /> : "Compare Quotes →"}
            </button>
          </div>
        </div>
      </QuoteShell>
    );
  }

  // step === 1: Compare Quotes
  return (
    <QuoteShell
      currentIndex={1}
      heading="Compare Quotes"
      subtitle="Review eligible insurers for your vehicle and accept the quote that suits you."
      onNavigate={(i) => i === 0 && setStep(0)}
    >
      <div className="wizard-form">
        {error && <div className="alert alert-error">{error}</div>}

        {loading && <div className="card">Comparing insurers…</div>}

        {!loading && options.length > 0 && (
          <div>
            <h2 className="wizard-section-title">Eligible Insurers</h2>
            <p className="hint" style={{ marginBottom: 14 }}>
              Compare premiums, download a PDF or email a quotation to review later. Accept when you are ready.
            </p>
            <div className="indicative-quote-notice">
              <strong>Indicative Motor Insurance Quotation</strong>
              <p>This quotation has not yet been accepted and does not constitute an active insurance policy.</p>
            </div>
            {options.map((opt, i) => (
              <div key={opt.motor_class_id} className="insurer-card">
                <div className="insurer-card-head">
                  <div>
                    <div className="insurer-card-eyebrow">Insurer quotation</div>
                    <div className="insurer-card-name">
                      {opt.insurer_name}
                      {i === 0 && (
                        <span className="badge badge-green" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                          Lowest premium
                        </span>
                      )}
                    </div>
                    <div className="insurer-card-meta">
                      {opt.motor_class_label} · {opt.cover_type === "comprehensive" ? "Comprehensive" : "Third Party Only"}
                      {opt.max_age != null && ` · Max vehicle age ${opt.max_age} years`}
                    </div>
                  </div>
                  <div className="insurer-card-premium">
                    <div className="insurer-card-premium-amount">{money(opt.total_premium)}</div>
                    <div className="insurer-card-premium-label">Total premium · Includes levies &amp; stamp duty</div>
                  </div>
                </div>
                <dl className="insurer-card-details">
                  <div><dt>Basic premium</dt><dd>{money(opt.basic_premium)}</dd></div>
                  <div><dt>Levies</dt><dd>{money(opt.levies)}</dd></div>
                  <div><dt>Stamp duty</dt><dd>{money(opt.stamp_duty)}</dd></div>
                </dl>
                {(opt.premium_lines?.length > 1 || opt.extension_notes?.length > 0) && (
                  <div className="insurer-extension-details">
                    {opt.premium_lines?.slice(1).map((line, index) => (
                      <div className="insurer-extension-line" key={index}>
                        <span>{line.label}</span><strong>{money(line.amount)}</strong>
                      </div>
                    ))}
                    {opt.extension_notes?.map(note => <p className="hint" key={note}>{note}</p>)}
                    <div className="insurer-extension-line"><span>Subtotal before levies &amp; stamp duty</span><strong>{money(opt.subtotal)}</strong></div>
                  </div>
                )}
                {opt.tonnage_required && tonnagePromptId === opt.motor_class_id ? (
                  <div className="insurer-card-actions" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                    <div className="field-group" style={{ margin: 0 }}>
                      <label htmlFor={`tonnage-prompt-${opt.motor_class_id}`}>Vehicle Tonnage (required by this insurer)</label>
                      <input
                        id={`tonnage-prompt-${opt.motor_class_id}`}
                        type="number"
                        min="0"
                        step="any"
                        value={tonnagePromptValue}
                        onChange={(e) => setTonnagePromptValue(e.target.value)}
                        placeholder="e.g. 5"
                        autoFocus
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={selecting !== null}
                        onClick={() => selectOption(opt, Number(tonnagePromptValue))}
                      >
                        {selecting === opt.motor_class_id ? <span className="spinner" /> : "Prepare Quotation"}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={selecting !== null}
                        onClick={() => {
                          setTonnagePromptId(null);
                          setTonnagePromptValue("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <QuoteOfferActions offer={opt}>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={selecting !== null}
                      onClick={() => {
                        if (opt.tonnage_required && !opt.offer_id) {
                          setTonnagePromptId(opt.motor_class_id);
                          setTonnagePromptValue("");
                          return;
                        }
                        selectOption(opt);
                      }}
                    >
                      {selecting === opt.motor_class_id ? <span className="spinner" /> : "Accept This Quote"}
                    </button>
                  </QuoteOfferActions>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && ineligibleOptions.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h2 className="wizard-section-title">Not Eligible for This Vehicle</h2>
            <p className="hint" style={{ marginBottom: 14 }}>
              These insurers offer this vehicle class but cannot cover this particular vehicle.
            </p>
            {ineligibleOptions.map((opt) => (
              <div key={opt.motor_class_id} className="insurer-card" style={{ opacity: 0.75 }}>
                <div className="insurer-card-head">
                  <div>
                    <div className="insurer-card-name">{opt.insurer_name}</div>
                    <div className="insurer-card-meta">{opt.motor_class_label}</div>
                  </div>
                </div>
                <div className="insurer-card-details" style={{ whiteSpace: "pre-line" }}>
                  {opt.reason}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="quote-footer-nav">
          <button className="btn btn-secondary" onClick={() => setStep(0)}>
            ← Back
          </button>
        </div>
      </div>
    </QuoteShell>
  );
}
