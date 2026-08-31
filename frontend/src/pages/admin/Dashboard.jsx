import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, dateTimeFmt, errorMessage, money } from "../../api/client";

function StatTile({ label, value }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="hint" style={{ margin: 0 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--imoth-blue)", marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState({ date_from: "", date_to: "" });

  async function load() {
    try {
      const params = {};
      if (range.date_from) params.date_from = range.date_from;
      if (range.date_to) params.date_to = range.date_to;
      const res = await api.get("/api/admin/dashboard", { params });
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>Dashboard</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={range.date_from} onChange={(e) => setRange({ ...range, date_from: e.target.value })} />
          <span className="hint">to</span>
          <input type="date" value={range.date_to} onChange={(e) => setRange({ ...range, date_to: e.target.value })} />
          <button className="btn btn-secondary btn-sm" onClick={load}>
            Filter
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!data ? (
        <div className="card">Loading…</div>
      ) : (
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
            </div>
            <div className="card">
              <h3 style={{ fontSize: 13 }}>Quotations by Vehicle Class</h3>
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
            </div>
          </div>

          <div className="row2" style={{ marginTop: 16 }}>
            <div className="card">
              <h3 style={{ fontSize: 13 }}>Recent Quotations</h3>
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
            </div>
            <div className="card">
              <h3 style={{ fontSize: 13 }}>Recent Risk Notes</h3>
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
