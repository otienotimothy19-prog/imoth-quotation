import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage, money } from "../../api/client";

function StatTile({ label, value }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="hint" style={{ margin: 0 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--imoth-blue)", marginTop: 4 }}>{value}</div>
    </div>
  );
}

// A plain <input type="date"> gives "YYYY-MM-DD" with no time component.
// The backend expects a full ISO datetime, and the end date must cover the
// whole day (up to 23:59:59.999) or records from that day would be excluded.
function toStartOfDayIso(dateStr) {
  return dateStr ? `${dateStr}T00:00:00` : null;
}
function toEndOfDayIso(dateStr) {
  return dateStr ? `${dateStr}T23:59:59.999` : null;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState({ date_from: "", date_to: "" });

  async function load() {
    if (range.date_from && range.date_to && range.date_from > range.date_to) {
      setError("Start date must be before end date.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const params = {};
      const from = toStartOfDayIso(range.date_from);
      const to = toEndOfDayIso(range.date_to);
      if (from) params.date_from = from;
      if (to) params.date_to = to;
      const res = await api.get("/api/admin/dashboard", { params });
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>Dashboard</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            aria-label="Start date"
            value={range.date_from}
            max={range.date_to || undefined}
            onChange={(e) => setRange({ ...range, date_from: e.target.value })}
          />
          <span className="hint">to</span>
          <input
            type="date"
            aria-label="End date"
            value={range.date_to}
            min={range.date_from || undefined}
            onChange={(e) => setRange({ ...range, date_to: e.target.value })}
          />
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading} aria-busy={loading}>
            {loading ? <span className="spinner spinner-dark" /> : "Filter"}
          </button>
          {(range.date_from || range.date_to) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={loading}
              onClick={() => {
                setRange({ date_from: "", date_to: "" });
                setError("");
                setTimeout(load, 0);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error ? (
        <div className="card">Loading…</div>
      ) : !data ? null : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 20 }}>
            <StatTile label="Quotations Today" value={data.quotations_today} />
            <StatTile label="Quotations This Month" value={data.quotations_this_month} />
            <StatTile label="Accepted" value={data.accepted_quotations} />
            <StatTile label="Rejected" value={data.rejected_quotations} />
            <StatTile label="Conversion Rate" value={`${data.conversion_rate_pct}%`} />
            <StatTile label="Total Quoted Premium" value={money(data.total_quoted_premium)} />
            <StatTile label="Risk Notes Generated" value={data.risk_notes_generated} />
          </div>

          <div className="row2">
            <div className="card">
              <h3 style={{ fontSize: 13 }}>Quotations by Insurer</h3>
              {data.by_insurer.length === 0 ? (
                <p className="hint">No quotations in this range.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Insurer</th>
                      <th className="num">Count</th>
                      <th className="num">Total Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_insurer.map((r) => (
                      <tr key={r.insurer}>
                        <td>{r.insurer}</td>
                        <td className="num">{r.count}</td>
                        <td className="num">{money(r.total_premium)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card">
              <h3 style={{ fontSize: 13 }}>Quotations by Vehicle Class</h3>
              {data.by_vehicle_class.length === 0 ? (
                <p className="hint">No quotations in this range.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th className="num">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_vehicle_class.map((r) => (
                      <tr key={r.vehicle_class}>
                        <td>{r.vehicle_class}</td>
                        <td className="num">{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="row2" style={{ marginTop: 16 }}>
            <div className="card">
              <h3 style={{ fontSize: 13 }}>Recent Quotations</h3>
              {data.recent_quotations.length === 0 ? (
                <p className="hint">No quotations yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Client</th>
                      <th className="num">Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_quotations.map((q) => (
                      <tr key={q.id}>
                        <td>
                          <Link to={`/admin/quotations/${q.id}`}>{q.quotation_number}</Link>
                        </td>
                        <td>{q.client_name}</td>
                        <td className="num">{money(q.total_premium)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card">
              <h3 style={{ fontSize: 13 }}>Recent Risk Notes</h3>
              {data.recent_risk_notes.length === 0 ? (
                <p className="hint">No risk notes yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Status</th>
                      <th className="num">Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_risk_notes.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/admin/risk-notes/${r.id}`}>{r.risk_note_number}</Link>
                        </td>
                        <td>{r.status}</td>
                        <td className="num">{money(r.premium)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
