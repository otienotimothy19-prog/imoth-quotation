import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, dateTimeFmt, errorMessage, money } from "../../api/client";

const STATUSES = ["DRAFT", "GENERATED", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"];

export default function Quotations() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const pageSize = 20;

  async function load() {
    try {
      const params = { page, page_size: pageSize };
      if (q) params.q = q;
      if (status) params.status = status;
      const res = await api.get("/api/admin/quotations", { params });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div>
      <h1 style={{ fontSize: 20, color: "var(--imoth-blue)", marginBottom: 16 }}>Quotations</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="first">Search</label>
            <input type="text" placeholder="Quotation #, client, or reg. no." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label className="first">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setPage(1);
              load();
            }}
          >
            Search
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Quotation #</th>
                <th>Client</th>
                <th>Reg. No.</th>
                <th>Insurer</th>
                <th>Class</th>
                <th>Status</th>
                <th className="num">Premium</th>
                <th>Risk Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.quotation_number}</td>
                  <td>{it.client_name}</td>
                  <td>{it.registration_no}</td>
                  <td>{it.insurer_name}</td>
                  <td>{it.vehicle_class_label}</td>
                  <td>
                    <span className="badge badge-blue">{it.status}</span>
                  </td>
                  <td className="num">{money(it.total_premium)}</td>
                  <td>{it.has_risk_note ? "Yes" : "—"}</td>
                  <td>
                    <Link className="btn btn-secondary btn-sm" to={`/admin/quotations/${it.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "var(--muted)" }}>
                    No quotations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <span className="hint">
            {total} total · page {page} of {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <button className="btn btn-ghost btn-sm" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
