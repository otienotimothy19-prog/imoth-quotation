import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, dateTimeFmt, errorMessage } from "../../api/client";

function emptyBand() {
  return {
    min_si: 0, max_si: "", rate: 0, min_premium: 0,
    ep_included: true, ep_not_offered: false, ep_rate: 0, ep_min: 0, ep_mandatory: false,
    pvt_included: true, pvt_not_offered: false, pvt_rate: 0, pvt_min: 0, pvt_mandatory: false,
  };
}

// The three cover-basis flags (Included / Not Offered / Mandatory) must
// stay mutually exclusive -- a band that's "included in the base rate" and
// "not offered" and "always separately charged" at once is a contradiction
// the pricing engine can't sensibly resolve. Modelling this as a single
// radio choice makes that contradiction impossible to create in the UI,
// instead of three independent checkboxes that happened to be validated
// server-side.
function coverMode(band, prefix) {
  if (band[`${prefix}_included`]) return "included";
  if (band[`${prefix}_not_offered`]) return "not_offered";
  if (band[`${prefix}_mandatory`]) return "mandatory";
  return "optional";
}
function applyCoverMode(band, prefix, mode) {
  return {
    ...band,
    [`${prefix}_included`]: mode === "included",
    [`${prefix}_not_offered`]: mode === "not_offered",
    [`${prefix}_mandatory`]: mode === "mandatory",
  };
}

function numOrEmpty(v) {
  return v === "" || v === null || v === undefined ? "" : v;
}

function CoverSection({ title, band, prefix, onChange }) {
  const mode = coverMode(band, prefix);
  const showRate = mode === "optional" || mode === "mandatory";
  return (
    <div className="cover-group">
      <div className="cover-group-title">{title}</div>
      <div className="tri-toggle">
        {[
          ["optional", "Optional (customer choice)"],
          ["included", "Included"],
          ["not_offered", "Not offered"],
          ["mandatory", "Mandatory"],
        ].map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name={`${prefix}-${title}`}
              checked={mode === value}
              onChange={() => onChange(applyCoverMode(band, prefix, value))}
            />
            {label}
          </label>
        ))}
      </div>
      {showRate && (
        <div className="row2" style={{ marginTop: 8 }}>
          <div>
            <label>Rate (e.g. 0.03 = 3%)</label>
            <input
              type="number"
              step="any"
              min="0"
              value={numOrEmpty(band[`${prefix}_rate`])}
              onChange={(e) => onChange({ ...band, [`${prefix}_rate`]: e.target.value === "" ? 0 : Number(e.target.value) })}
            />
          </div>
          <div>
            <label>Minimum Premium</label>
            <input
              type="number"
              step="any"
              min="0"
              value={numOrEmpty(band[`${prefix}_min`])}
              onChange={(e) => onChange({ ...band, [`${prefix}_min`]: e.target.value === "" ? 0 : Number(e.target.value) })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BandCard({ index, band, onChange, onRemove }) {
  return (
    <div className="rate-band-card">
      <button type="button" className="btn btn-danger btn-sm remove-band" onClick={onRemove} aria-label={`Remove band ${index + 1}`}>
        ✕
      </button>
      <h4>Band {index + 1}</h4>
      <div className="row2">
        <div>
          <label className="first">Minimum Sum Insured</label>
          <input type="number" step="any" min="0" value={numOrEmpty(band.min_si)} onChange={(e) => onChange({ ...band, min_si: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </div>
        <div>
          <label className="first">Maximum Sum Insured</label>
          <input
            type="number"
            step="any"
            min="0"
            placeholder="open"
            value={numOrEmpty(band.max_si)}
            onChange={(e) => onChange({ ...band, max_si: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="row2">
        <div>
          <label>Basic Rate</label>
          <input type="number" step="any" min="0" value={numOrEmpty(band.rate)} onChange={(e) => onChange({ ...band, rate: e.target.value === "" ? 0 : Number(e.target.value) })} />
          <div className="hint">0.03 = 3%</div>
        </div>
        <div>
          <label>Minimum Premium</label>
          <input type="number" step="any" min="0" value={numOrEmpty(band.min_premium)} onChange={(e) => onChange({ ...band, min_premium: e.target.value === "" ? 0 : Number(e.target.value) })} />
        </div>
      </div>

      <CoverSection title="Excess Protector" band={band} prefix="ep" onChange={onChange} />
      <CoverSection title="Political Violence & Terrorism" band={band} prefix="pvt" onChange={onChange} />
    </div>
  );
}

function VersionHistory({ versions }) {
  return (
    <div className="card">
      <h3 style={{ fontSize: 13 }}>Version History</h3>
      {versions.length === 0 ? (
        <p className="hint">No versions recorded yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Reason</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>v{v.version_no}</td>
                  <td>{v.change_reason}</td>
                  <td>{dateTimeFmt(v.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function validateBands(bands, label) {
  for (const b of bands) {
    if (b.min_si < 0 || b.rate < 0 || b.min_premium < 0) return `${label}: values cannot be negative.`;
    if (b.max_si !== null && b.max_si !== "" && Number(b.max_si) < Number(b.min_si)) {
      return `${label}: a band's Maximum Sum Insured cannot be less than its Minimum.`;
    }
  }
  const sorted = [...bands].sort((a, b) => a.min_si - b.min_si);
  for (let i = 0; i < sorted.length - 1; i++) {
    const prevEnd = sorted[i].max_si === "" || sorted[i].max_si === null ? Infinity : Number(sorted[i].max_si);
    if (sorted[i + 1].min_si <= prevEnd) return `${label}: bands overlap around Sum Insured ${sorted[i + 1].min_si.toLocaleString()}.`;
  }
  return "";
}

export default function Rates() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [insurers, setInsurers] = useState([]);
  const [insurerId, setInsurerId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(searchParams.get("motor_class_id") || "");
  const [resolvingDeepLink, setResolvingDeepLink] = useState(!!searchParams.get("motor_class_id"));
  const [bands, setBands] = useState([]);
  const [bandsAlt, setBandsAlt] = useState([]);
  const [hasLrToggle, setHasLrToggle] = useState(false);
  const [flatOnly, setFlatOnly] = useState(null);
  const [flatForm, setFlatForm] = useState(null);
  const [reason, setReason] = useState("");
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loadingRates, setLoadingRates] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/api/admin/insurers").then((res) => setInsurers(res.data));
  }, []);

  // Deep link support: /admin/rates?motor_class_id=... must select the
  // right insurer AND class, not just load the rate data underneath an
  // empty pair of dropdowns.
  useEffect(() => {
    const deepLinkId = searchParams.get("motor_class_id");
    if (!deepLinkId) return;
    let cancelled = false;
    api
      .get(`/api/admin/motor-classes/${deepLinkId}`)
      .then((res) => {
        if (cancelled) return;
        setInsurerId(res.data.insurer_id);
        setClassId(deepLinkId);
      })
      .catch((err) => !cancelled && setError(errorMessage(err, "Could not open this motor class.")))
      .finally(() => !cancelled && setResolvingDeepLink(false));
    return () => {
      cancelled = true;
    };
    // Only resolve once, from the URL present on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!insurerId) {
      setClasses([]);
      return;
    }
    api.get("/api/admin/motor-classes", { params: { insurer_id: insurerId } }).then((res) => setClasses(res.data));
  }, [insurerId]);

  async function loadRates(id) {
    if (!id) return;
    setError("");
    setLoadingRates(true);
    try {
      const res = await api.get(`/api/admin/rates/${id}`);
      setFlatOnly(res.data.flat_only);
      setFlatForm(
        res.data.flat_only
          ? {
              premium: res.data.flat_only.premium ?? "",
              rate_on_si: res.data.flat_only.rate_on_si ?? "",
              min_premium: res.data.flat_only.min_premium ?? "",
              note: res.data.flat_only.note ?? "",
            }
          : null
      );
      setBands((res.data.bands || []).map((b) => ({ ...b })));
      setBandsAlt((res.data.bands_alt || []).map((b) => ({ ...b })));
      setHasLrToggle(res.data.has_lr_toggle || false);
      const v = await api.get(`/api/admin/rates/${id}/versions`);
      setVersions(v.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingRates(false);
    }
  }

  useEffect(() => {
    if (classId) {
      setSearchParams({ motor_class_id: classId }, { replace: true });
      loadRates(classId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function save() {
    setError("");
    setStatus("");
    if (!reason.trim()) return setError("Please provide a reason for this rate change (for the audit trail).");

    if (flatOnly) {
      const hasPremium = flatForm.premium !== "" && flatForm.premium !== null;
      const hasRateOnSi = flatForm.rate_on_si !== "" && flatForm.rate_on_si !== null;
      if (!hasPremium && !hasRateOnSi) return setError("Provide either a fixed premium or a rate on sum insured.");
      if (hasRateOnSi && (flatForm.min_premium === "" || flatForm.min_premium === null)) {
        return setError("A minimum premium is required when using a rate on sum insured.");
      }
      setSaving(true);
      try {
        await api.patch(`/api/admin/motor-classes/${classId}`, {
          flat_only: {
            premium: hasPremium ? Number(flatForm.premium) : null,
            rate_on_si: hasRateOnSi ? Number(flatForm.rate_on_si) : null,
            min_premium: flatForm.min_premium === "" ? null : Number(flatForm.min_premium),
            note: flatForm.note || "",
          },
          change_reason: reason,
        });
        setStatus("Flat rate updated and versioned.");
        setReason("");
        await loadRates(classId);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }

    const bandsError = validateBands(bands, "Standard bands");
    if (bandsError) return setError(bandsError);
    if (hasLrToggle) {
      const altError = validateBands(bandsAlt, "Alternative bands");
      if (altError) return setError(altError);
      if (bandsAlt.length === 0) return setError("This class has a Loss-Ratio toggle; at least one alternative band is required.");
    }
    if (bands.length === 0) return setError("At least one rate band is required.");

    setSaving(true);
    try {
      const clean = (list) => list.map((b) => ({ ...b, max_si: b.max_si === "" ? null : b.max_si }));
      await api.put(`/api/admin/rates/${classId}`, {
        bands: clean(bands),
        bands_alt: hasLrToggle ? clean(bandsAlt) : null,
        change_reason: reason,
      });
      setStatus("Rates updated and versioned.");
      setReason("");
      await loadRates(classId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const selectedClass = classes.find((c) => c.id === classId);

  return (
    <div>
      <h1 style={{ fontSize: 20, color: "var(--imoth-blue)", marginBottom: 16 }}>Rate Management</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row2">
          <div>
            <label className="first" htmlFor="rates-insurer-select">Insurer</label>
            <select
              id="rates-insurer-select"
              value={insurerId}
              onChange={(e) => {
                setInsurerId(e.target.value);
                setClassId("");
                setSearchParams({});
              }}
            >
              <option value="">Select insurer…</option>
              {insurers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="first" htmlFor="rates-class-select">Motor Class</label>
            <select id="rates-class-select" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!insurerId}>
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.active === false ? " (Inactive — not offered to clients)" : ""}
                </option>
              ))}
            </select>
            {selectedClass?.active === false && (
              <div className="alert alert-error" style={{ marginTop: 10 }}>
                This class is inactive. Editing its rates has no effect on client quotes — it has been superseded or
                deactivated. Look for the active replacement class in this dropdown instead.
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {status && <div className="alert alert-success">{status}</div>}

      {resolvingDeepLink && <div className="card">Loading…</div>}
      {!resolvingDeepLink && classId && loadingRates && <div className="card">Loading rates…</div>}

      {!resolvingDeepLink && classId && !loadingRates && flatOnly && flatForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 13 }}>Flat-Rate Product</h3>
          <p className="hint" style={{ marginBottom: 12 }}>
            This product charges either a fixed annual premium or a rate applied to the Sum Insured (with a minimum
            premium floor) -- not a table of Sum-Insured bands.
          </p>
          <div className="row2">
            <div>
              <label className="first" htmlFor="flat-premium-input">Fixed Premium (leave blank to use a rate instead)</label>
              <input
                id="flat-premium-input"
                type="number"
                step="any"
                min="0"
                value={numOrEmpty(flatForm.premium)}
                onChange={(e) => setFlatForm({ ...flatForm, premium: e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="first">Rate on Sum Insured (e.g. 0.04 = 4%)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={numOrEmpty(flatForm.rate_on_si)}
                onChange={(e) => setFlatForm({ ...flatForm, rate_on_si: e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="row2">
            <div>
              <label>Minimum Premium (required if using a rate)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={numOrEmpty(flatForm.min_premium)}
                onChange={(e) => setFlatForm({ ...flatForm, min_premium: e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </div>
            <div>
              <label>Note</label>
              <input type="text" value={flatForm.note} onChange={(e) => setFlatForm({ ...flatForm, note: e.target.value })} />
            </div>
          </div>

          <div style={{ marginTop: 18, borderTop: "1px solid var(--panel)", paddingTop: 14 }}>
            <label className="first">Reason for this change (required, recorded in rate version history)</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2027 rate card update" />
            <button type="button" className="btn btn-primary" style={{ marginTop: 10 }} disabled={saving} aria-busy={saving} onClick={save}>
              {saving ? <span className="spinner" /> : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {!resolvingDeepLink && classId && !loadingRates && !flatOnly && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13 }}>Standard Bands</h3>
            <div className="rate-band-grid">
              {bands.map((b, i) => (
                <BandCard
                  key={i}
                  index={i}
                  band={b}
                  onChange={(nb) => setBands(bands.map((x, j) => (j === i ? nb : x)))}
                  onRemove={() => {
                    if (window.confirm(`Remove Band ${i + 1}? This cannot be undone until you save, but will apply once you do.`)) {
                      setBands(bands.filter((_, j) => j !== i));
                    }
                  }}
                />
              ))}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setBands([...bands, emptyBand()])}>
              + Add Band
            </button>

            {hasLrToggle && (
              <>
                <h3 style={{ fontSize: 13, marginTop: 24 }}>Loss-Ratio "Bad" Bands (alternative)</h3>
                <div className="rate-band-grid">
                  {bandsAlt.map((b, i) => (
                    <BandCard
                      key={i}
                      index={i}
                      band={b}
                      onChange={(nb) => setBandsAlt(bandsAlt.map((x, j) => (j === i ? nb : x)))}
                      onRemove={() => {
                        if (window.confirm(`Remove Alternative Band ${i + 1}?`)) {
                          setBandsAlt(bandsAlt.filter((_, j) => j !== i));
                        }
                      }}
                    />
                  ))}
                </div>
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setBandsAlt([...bandsAlt, emptyBand()])}>
                  + Add Alternative Band
                </button>
              </>
            )}

            <div style={{ marginTop: 18, borderTop: "1px solid var(--panel)", paddingTop: 14 }}>
              <label className="first">Reason for this change (required, recorded in rate version history)</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2027 rate card update" />
              <div className="hint">
                Saving creates a new rate version. Quotations already generated under the previous rates are never affected.
              </div>
              <button type="button" className="btn btn-primary" style={{ marginTop: 10 }} disabled={saving} aria-busy={saving} onClick={save}>
                {saving ? <span className="spinner" /> : "Save Changes"}
              </button>
            </div>
          </div>

          <VersionHistory versions={versions} />
        </>
      )}

      {!resolvingDeepLink && classId && !loadingRates && flatOnly && <VersionHistory versions={versions} />}
    </div>
  );
}
