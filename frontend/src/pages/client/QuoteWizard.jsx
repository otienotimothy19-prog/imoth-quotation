import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage, money } from "../../api/client";
import QuoteShell from "../../components/wizard/QuoteShell";

const CATEGORIES = [
  { value: "private", label: "Private Car" },
  { value: "commercial", label: "Commercial (Own Goods / General Cartage / Hybrid)" },
  { value: "institutional", label: "Institutional / School Bus" },
  { value: "psv", label: "PSV / Chauffeur Driven" },
  { value: "tuktuk", label: "Tuk Tuk" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "asset", label: "Asset (New Units)" },
  { value: "special", label: "Special Type (Farm / Construction)" },
];

const emptyClient = { full_name: "", id_or_passport: "", phone: "", email: "" };
const emptyVehicle = { registration_no: "", make: "", model: "", year_of_manufacture: "", age_years: "" };

// Light-touch Kenyan phone check -- accepts 07xx/01xx local format or +254/254
// prefixed, without being so strict it rejects a legitimately entered number.
function isValidKenyanPhone(value) {
  const digits = value.replace(/[\s-]/g, "");
  return /^(?:\+?254|0)[17]\d{8}$/.test(digits);
}

export default function QuoteWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0 = Your Details, 1 = Choose Cover
  const [client, setClient] = useState(emptyClient);
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [fieldErrors, setFieldErrors] = useState({});
  const [coverType, setCoverType] = useState("comprehensive");
  const [category, setCategory] = useState("private");
  const [sumInsured, setSumInsured] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState(null);

  function validateDetails() {
    const errs = {};
    if (!client.full_name.trim() || client.full_name.trim().length < 2) {
      errs.full_name = "Please enter your full name.";
    }
    if (!client.phone.trim()) {
      errs.phone = "Please enter your phone number.";
    } else if (!isValidKenyanPhone(client.phone)) {
      errs.phone = "Enter a valid Kenyan number, e.g. 07XX XXX XXX.";
    }
    if (client.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email.trim())) {
      errs.email = "Enter a valid email address.";
    }
    if (!vehicle.registration_no.trim()) {
      errs.registration_no = "Please enter the vehicle registration number.";
    }
    return errs;
  }

  function validateCover() {
    if (coverType === "comprehensive" && (!sumInsured || Number(sumInsured) <= 0)) {
      return "Please enter the Sum Insured.";
    }
    return "";
  }

  function cleanClient() {
    return {
      full_name: client.full_name.trim(),
      id_or_passport: client.id_or_passport.trim() || null,
      phone: client.phone.trim(),
      email: client.email.trim() || null,
    };
  }
  function cleanVehicle() {
    return {
      registration_no: vehicle.registration_no.trim(),
      make: vehicle.make.trim() || null,
      model: vehicle.model.trim() || null,
      year_of_manufacture: vehicle.year_of_manufacture ? Number(vehicle.year_of_manufacture) : null,
      age_years: vehicle.age_years !== "" ? Number(vehicle.age_years) : null,
    };
  }

  async function goToCompare() {
    setError("");
    const effectiveCategory = coverType === "third_party_only" ? "tpo" : category;
    const si = coverType === "third_party_only" ? 0 : Number(sumInsured);
    setLoading(true);
    try {
      const res = await api.post("/api/quotes/compare", {
        client: cleanClient(),
        vehicle: cleanVehicle(),
        category: effectiveCategory,
        sum_insured: si,
      });
      setOptions(res.data.options);
    } catch (err) {
      setOptions([]);
      setError(errorMessage(err, "Could not calculate quotes for these details."));
    } finally {
      setLoading(false);
    }
  }

  async function selectOption(opt) {
    setError("");
    setSelecting(opt.motor_class_id);
    const si = coverType === "third_party_only" ? 0 : Number(sumInsured);
    try {
      const res = await api.post("/api/quotes/generate", {
        client: cleanClient(),
        vehicle: cleanVehicle(),
        insurer_id: opt.insurer_id,
        motor_class_id: opt.motor_class_id,
        sum_insured: si,
        amount_paid: 0,
      });
      navigate(`/quote/${res.data.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not generate this quotation."));
      setSelecting(null);
    }
  }

  if (step === 0) {
    return (
      <QuoteShell currentIndex={0} heading="Tell Us About Yourself and Your Vehicle" subtitle="Enter the details needed to calculate and securely save your quotation.">
        <div className="wizard-form">
          {error && <div className="alert alert-error">{error}</div>}

          <section className="wizard-section">
            <h2 className="wizard-section-title">About You</h2>

            <div className="field-group">
              <label className="first">Full Name</label>
              <input
                type="text"
                value={client.full_name}
                onChange={(e) => setClient({ ...client, full_name: e.target.value })}
                placeholder="e.g. John Mwangi"
                aria-invalid={!!fieldErrors.full_name}
              />
              {fieldErrors.full_name && <div className="error-text">{fieldErrors.full_name}</div>}
            </div>

            <div className="row2">
              <div className="field-group">
                <div className="field-label-row">
                  <label>ID / Passport Number</label>
                  <span className="optional-badge">Optional</span>
                </div>
                <input
                  type="text"
                  value={client.id_or_passport}
                  onChange={(e) => setClient({ ...client, id_or_passport: e.target.value })}
                />
              </div>
              <div className="field-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  value={client.phone}
                  onChange={(e) => setClient({ ...client, phone: e.target.value })}
                  placeholder="07XX XXX XXX"
                  aria-invalid={!!fieldErrors.phone}
                />
                {fieldErrors.phone && <div className="error-text">{fieldErrors.phone}</div>}
              </div>
            </div>

            <div className="field-group">
              <div className="field-label-row">
                <label>Email Address</label>
                <span className="optional-badge">Optional</span>
              </div>
              <input
                type="email"
                value={client.email}
                onChange={(e) => setClient({ ...client, email: e.target.value })}
              />
              <div className="hint">We can use this to send your quotation documents.</div>
              {fieldErrors.email && <div className="error-text">{fieldErrors.email}</div>}
            </div>
          </section>

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
                <div className="field-label-row">
                  <label>Year of Manufacture</label>
                  <span className="optional-badge">Optional</span>
                </div>
                <input
                  type="number"
                  value={vehicle.year_of_manufacture}
                  onChange={(e) => setVehicle({ ...vehicle, year_of_manufacture: e.target.value })}
                  placeholder="e.g. 2019"
                />
              </div>
              <div className="field-group">
                <label>Vehicle Age (years)</label>
                <input
                  type="number"
                  min="0"
                  value={vehicle.age_years}
                  onChange={(e) => setVehicle({ ...vehicle, age_years: e.target.value })}
                  placeholder="e.g. 5"
                />
                <div className="hint">Affects eligibility and some optional covers.</div>
              </div>
            </div>
          </section>

          <div className="quote-footer-nav quote-footer-nav-end">
            <button
              className="btn btn-primary"
              onClick={() => {
                const errs = validateDetails();
                setFieldErrors(errs);
                if (Object.keys(errs).length > 0) {
                  setError("Please fix the highlighted fields to continue.");
                  return;
                }
                setError("");
                setStep(1);
              }}
            >
              Save &amp; Continue →
            </button>
          </div>
        </div>
      </QuoteShell>
    );
  }

  // step === 1: Choose Cover
  return (
    <QuoteShell
      currentIndex={1}
      heading="Choose Your Cover"
      subtitle="Select your cover type, tell us a bit more, and compare eligible insurers instantly."
      onNavigate={(i) => i === 0 && setStep(0)}
    >
      <div className="wizard-form">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="field-group">
          <label className="first">Cover Type</label>
          <div className="option-card-grid">
            <button
              type="button"
              className={`option-card ${coverType === "comprehensive" ? "option-card-selected" : ""}`}
              onClick={() => setCoverType("comprehensive")}
              aria-pressed={coverType === "comprehensive"}
            >
              <div className="option-card-title">Comprehensive</div>
              <div className="option-card-desc">Covers your own vehicle plus third-party liability.</div>
            </button>
            <button
              type="button"
              className={`option-card ${coverType === "third_party_only" ? "option-card-selected" : ""}`}
              onClick={() => setCoverType("third_party_only")}
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
              <label>Vehicle Class</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
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
                onChange={(e) => setSumInsured(e.target.value)}
                placeholder="e.g. 1500000"
              />
              <div className="hint">Your vehicle's current market value.</div>
            </div>
          </div>
        )}

        <div className="quote-footer-nav">
          <button className="btn btn-secondary" onClick={() => setStep(0)}>
            ← Back
          </button>
          <button
            className="btn btn-primary"
            disabled={loading}
            onClick={() => {
              const err = validateCover();
              if (err) return setError(err);
              setError("");
              goToCompare();
            }}
          >
            {loading ? <span className="spinner" /> : "Get Quotes →"}
          </button>
        </div>

        {options.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <h2 className="wizard-section-title">Eligible Insurers</h2>
            <p className="hint" style={{ marginBottom: 14 }}>
              Premiums shown include levies and stamp duty. Select an option to generate your quotation.
            </p>
            {options.map((opt, i) => (
              <div key={opt.motor_class_id} className={`insurer-card ${i === 0 ? "insurer-card-selected" : ""}`}>
                <div className="insurer-card-head">
                  <div>
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
                    </div>
                    {opt.age_warning && (
                      <div className="hint" style={{ color: "var(--warn)", marginTop: 6 }}>
                        Vehicle age exceeds this insurer's max ({opt.max_age} yrs) — subject to underwriting review before
                        eligibility is confirmed.
                      </div>
                    )}
                  </div>
                  <div className="insurer-card-premium">
                    <div className="insurer-card-premium-amount">{money(opt.total_premium)}</div>
                    <div className="insurer-card-premium-label">Total premium</div>
                  </div>
                </div>
                <div className="insurer-card-details">
                  Basic premium {money(opt.basic_premium)} · Levies {money(opt.levies)} · Stamp duty {money(opt.stamp_duty)}
                </div>
                <div className="insurer-card-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={selecting !== null}
                    onClick={() => selectOption(opt)}
                  >
                    {selecting === opt.motor_class_id ? <span className="spinner" /> : "Select this quote"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </QuoteShell>
  );
}
