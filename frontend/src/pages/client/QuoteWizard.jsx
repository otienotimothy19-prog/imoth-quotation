import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage, money } from "../../api/client";
import StepIndicator from "../../components/StepIndicator";

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

export default function QuoteWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [client, setClient] = useState(emptyClient);
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [coverType, setCoverType] = useState("comprehensive");
  const [category, setCategory] = useState("private");
  const [sumInsured, setSumInsured] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState(null);

  function validateClient() {
    if (!client.full_name.trim() || client.full_name.trim().length < 2) return "Please enter your full name";
    if (!client.phone.trim() || client.phone.trim().length < 7) return "Please enter a valid phone number";
    return "";
  }
  function validateVehicle() {
    if (!vehicle.registration_no.trim()) return "Please enter the vehicle registration number";
    return "";
  }
  function validateCover() {
    if (coverType === "comprehensive" && (!sumInsured || Number(sumInsured) <= 0)) {
      return "Please enter the Sum Insured";
    }
    return "";
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
      setStep(4);
    } catch (err) {
      setError(errorMessage(err, "Could not calculate quotes for these details."));
    } finally {
      setLoading(false);
    }
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

  async function selectOption(opt) {
    setError("");
    setSelecting(opt.motor_class_id);
    const effectiveCategory = coverType === "third_party_only" ? "tpo" : category;
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

  return (
    <div className="card">
      <StepIndicator current={step} />
      {error && <div className="alert alert-error">{error}</div>}

      {step === 1 && (
        <div>
          <h2 style={{ fontSize: 15 }}>Your Details</h2>
          <label className="first">Full Name</label>
          <input
            type="text"
            value={client.full_name}
            onChange={(e) => setClient({ ...client, full_name: e.target.value })}
            placeholder="e.g. John Mwangi"
          />
          <div className="row2">
            <div>
              <label>ID / Passport No. (optional)</label>
              <input
                type="text"
                value={client.id_or_passport}
                onChange={(e) => setClient({ ...client, id_or_passport: e.target.value })}
              />
            </div>
            <div>
              <label>Phone Number</label>
              <input
                type="tel"
                value={client.phone}
                onChange={(e) => setClient({ ...client, phone: e.target.value })}
                placeholder="07XXXXXXXX"
              />
            </div>
          </div>
          <label>Email (optional, for sending your documents)</label>
          <input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                const err = validateClient();
                if (err) return setError(err);
                setError("");
                setStep(2);
              }}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 style={{ fontSize: 15 }}>Vehicle Details</h2>
          <label className="first">Registration Number</label>
          <input
            type="text"
            value={vehicle.registration_no}
            onChange={(e) => setVehicle({ ...vehicle, registration_no: e.target.value.toUpperCase() })}
            placeholder="e.g. KCZ 538G"
          />
          <div className="row2">
            <div>
              <label>Make (optional)</label>
              <input type="text" value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} placeholder="e.g. Toyota" />
            </div>
            <div>
              <label>Model (optional)</label>
              <input type="text" value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} placeholder="e.g. Prado" />
            </div>
          </div>
          <div className="row2">
            <div>
              <label>Year of Manufacture (optional)</label>
              <input
                type="number"
                value={vehicle.year_of_manufacture}
                onChange={(e) => setVehicle({ ...vehicle, year_of_manufacture: e.target.value })}
                placeholder="e.g. 2019"
              />
            </div>
            <div>
              <label>Vehicle Age (years)</label>
              <input
                type="number"
                min="0"
                value={vehicle.age_years}
                onChange={(e) => setVehicle({ ...vehicle, age_years: e.target.value })}
                placeholder="e.g. 5"
              />
            </div>
          </div>
          <div className="hint">Vehicle age affects eligibility and some optional covers (e.g. Excess Protector on older private vehicles).</div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const err = validateVehicle();
                if (err) return setError(err);
                setError("");
                setStep(3);
              }}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 style={{ fontSize: 15 }}>Cover Type &amp; Vehicle Class</h2>
          <label className="first">Cover Type</label>
          <div className="row2">
            <button
              type="button"
              className={coverType === "comprehensive" ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => setCoverType("comprehensive")}
            >
              Comprehensive
            </button>
            <button
              type="button"
              className={coverType === "third_party_only" ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => setCoverType("third_party_only")}
            >
              Third Party Only
            </button>
          </div>

          {coverType === "comprehensive" && (
            <>
              <label>Vehicle Class</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>

              <label>Sum Insured (KES)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={sumInsured}
                onChange={(e) => setSumInsured(e.target.value)}
                placeholder="e.g. 1500000"
              />
              <div className="hint">Enter your vehicle's current market value. We'll use this to calculate premiums across eligible insurers.</div>
            </>
          )}
          {coverType === "third_party_only" && (
            <div className="alert alert-info" style={{ marginTop: 12 }}>
              Third Party Only covers legal liability for injury/death and property damage to third parties. No Sum
              Insured is required for this cover.
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
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
              {loading ? <span className="spinner" /> : "Compare Insurers →"}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2 style={{ fontSize: 15 }}>Compare Insurers</h2>
          <p className="hint" style={{ marginBottom: 14 }}>
            Premiums below include levies and stamp duty. Select an insurer to generate your quotation.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Insurer</th>
                  <th>Class</th>
                  <th className="num">Premium (Kshs)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {options.map((opt, i) => (
                  <tr key={opt.motor_class_id} style={i === 0 ? { background: "#eafaf0" } : undefined}>
                    <td>
                      {opt.insurer_name}
                      {i === 0 && (
                        <span className="badge badge-green" style={{ marginLeft: 8 }}>
                          Lowest
                        </span>
                      )}
                      {opt.age_warning && (
                        <div className="hint" style={{ color: "var(--warn)" }}>
                          Vehicle age exceeds this insurer's max ({opt.max_age} yrs) — approval may be required.
                        </div>
                      )}
                    </td>
                    <td>{opt.motor_class_label}</td>
                    <td className="num">{money(opt.total_premium)}</td>
                    <td>
                      <button className="btn btn-primary btn-sm" disabled={selecting !== null} onClick={() => selectOption(opt)}>
                        {selecting === opt.motor_class_id ? <span className="spinner" /> : "Select"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep(3)}>← Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
