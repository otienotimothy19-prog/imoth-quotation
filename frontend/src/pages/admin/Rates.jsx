import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, dateTimeFmt, errorMessage } from "../../api/client";

const BAND_FIELDS = [
  ["min_si", "Min SI"],
  ["max_si", "Max SI"],
  ["rate", "Rate (e.g. 0.045 = 4.5%)"],
  ["min_premium", "Min Premium"],
  ["ep_included", "EP Included"],
  ["ep_not_offered", "EP Not Offered"],
  ["ep_rate", "EP Rate"],
  ["ep_min", "EP Min"],
  ["pvt_included", "PVT Included"],
  ["pvt_not_offered", "PVT Not Offered"],
  ["pvt_rate", "PVT Rate"],
  ["pvt_min", "PVT Min"],
];

function emptyBand() {
  return { min_si: 0, max_si: "", rate: 0, min_premium: 0, ep_included: true, ep_not_offered: false, ep_rate: 0, ep_min: 0, pvt_included: true, pvt_not_offered: false, pvt_rate: 0, pvt_min: 0 };
}

function BandRow({ band, onChange, onRemove }) {
  return (
    <tr>
      {BAND_FIELDS.map(([key]) => (
        <td key={key}>
          {typeof band[key] === "boolean" ? (
            <input type="checkbox" checked={band[key]} onChange={(e) => onChange({ ...band, [key]: e.target.checked })} />
          ) : (
            <input
              type="number"
              step="any"
              value={band[key] ?? ""}
              style={{ width: 90, padding: 6, fontSize: 12 }}
              onChange={(e) => onChange({ ...band, [key]: e.target.value === "" ? null : Number(e.target.value) })}
            />
          )}
        </td>
      ))}
      <td>
        <button className="btn btn-danger btn-sm" onClick={onRemove}>
          ✕
        </button>
      </td>
    </tr>
  );
}

export default function Rates() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [insurers, setInsurers] = useState([]);
  const [insurerId, setInsurerId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(searchParams.get("motor_class_id") || "");
  const [bands, setBands] = useState([]);
  const [bandsAlt, setBandsAlt] = useState([]);
  const [hasLrToggle, setHasLrToggle] = useState(false);
  const [flatOnly, setFlatOnly] = useState(null);
  const [reason, setReason] = useState("");
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    api.get("/api/admin/insurers").then((res) => setInsurers(res.data));
  }, []);

  useEffect(() => {
    if (!insurerId) return;
    api.get("/api/admin/motor-classes", { params: { insurer_id: insurerId } }).then((res) => setClasses(res.data));
  }, [insurerId]);

  async function loadRates(id) {
    if (!id) return;
    setError("");
    try {
      const res = await api.get(`/api/admin/rates/${id}`);
      setFlatOnly(res.data.flat_only);
      setBands((res.data.bands || []).map((b) => ({ ...b })));
      setBandsAlt((res.data.bands_alt || []).map((b) => ({ ...b })));
      setHasLrToggle(res.data.has_lr_toggle || false);
      const v = await api.get(`/api/admin/rates/${id}/versions`);
      setVersions(v.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    if (classId) {
      setSearchParams({ motor_class_id: classId });
      loadRates(classId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function save() {
    if (!reason.trim()) return setError("Please provide a reason for this rate change (for the audit trail).");
    setStatus("");
    setError("");
    try {
      const clean = (list) => list.map((b) => ({ ...b, max_si: b.max_si === "" ? null : b.max_si }));
      await api.put(`/api/admin/rates/${classId}`, {
        bands: clean(bands),
        bands_alt: hasLrToggle ? clean(bandsAlt) : null,
        change_reason: reason,
      });
      setStatus("Rates updated and versioned.");
      setReason("");
      loadRates(classId);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, color: "var(--imoth-blue)", marginBottom: 16 }}>Rate Management</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row2">
          <div>
            <label className="first">Insurer</label>
            <select value={insurerId} onChange={(e) => { setInsurerId(e.target.value); setClassId(""); }}>
              <option value="">Select insurer…</option>
              {insurers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="first">Motor Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!insurerId}>
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {status && <div className="alert alert-success">{status}</div>}

      {classId && flatOnly && (
        <div className="alert alert-info">
          This is a flat-rate class (premium: {flatOnly.premium ?? `${(flatOnly.rate_on_si * 100).toFixed(2)}% of SI, min ${flatOnly.min_premium}`}).
          Edit it via Admin → Motor Classes.
        </div>
      )}

      {classId && !flatOnly && (
        <>
          <div className="card" style={{ marginBottom: 16, overflowX: "auto" }}>
            <h3 style={{ fontSize: 13 }}>Standard Bands</h3>
            <table>
              <thead>
                <tr>
                  {BAND_FIELDS.map(([k, label]) => (
                    <th key={k}>{label}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b, i) => (
                  <BandRow
                    key={i}
                    band={b}
                    onChange={(nb) => setBands(bands.map((x, j) => (j === i ? nb : x)))}
                    onRemove={() => setBands(bands.filter((_, j) => j !== i))}
                  />
                ))}
              </tbody>
            </table>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setBands([...bands, emptyBand()])}>
              + Add Band
            </button>

            {hasLrToggle && (
              <>
                <h3 style={{ fontSize: 13, marginTop: 20 }}>Loss-Ratio "Bad" Bands (alt)</h3>
                <table>
                  <thead>
                    <tr>
                      {BAND_FIELDS.map(([k, label]) => (
                        <th key={k}>{label}</th>
                      ))}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bandsAlt.map((b, i) => (
                      <BandRow
                        key={i}
                        band={b}
                        onChange={(nb) => setBandsAlt(bandsAlt.map((x, j) => (j === i ? nb : x)))}
                        onRemove={() => setBandsAlt(bandsAlt.filter((_, j) => j !== i))}
                      />
                    ))}
                  </tbody>
                </table>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setBandsAlt([...bandsAlt, emptyBand()])}>
                  + Add Alt Band
                </button>
              </>
            )}

            <div style={{ marginTop: 18, borderTop: "1px solid var(--panel)", paddingTop: 14 }}>
              <label className="first">Reason for this change (required, recorded in rate version history)</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2027 rate card update" />
              <div className="hint">
                Saving creates a new rate version. Quotations already generated under the previous rates are never affected.
              </div>
              <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={save}>
                Save Rates
              </button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 13 }}>Version History</h3>
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
        </>
      )}
    </div>
  );
}
