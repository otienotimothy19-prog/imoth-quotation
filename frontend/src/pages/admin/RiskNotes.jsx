import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage, money } from "../../api/client";

const STATUSES = ["ACTIVE", "VOID", "CANCELLED", "SUPERSEDED"];

export default function RiskNotes() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  async function load(targetPage) {
    setError("");
    setLoading(true);
    try {
      const params = { page: targetPage, page_size: pageSize };
      if (q) params.q = q;
      if (status) params.status = status;
      const res = await api.get("/api/admin/risk-notes", { params });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function search() {
    if (page === 1) load(1);
    else setPage(1);
  }

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 style={{ fontSize: 20, color: "var(--imoth-blue)", marginBottom: 16 }}>Risk Notes</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="first">Search</label>
            <input
              type="text"
              placeholder="RN #, quotation #, client, or reg. no."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
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
          <button className="btn btn-primary" onClick={search} disabled={loading} aria-busy={loading}>
            {loading ? <span className="spinner" /> : "Search"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Risk Note #</th>
                <th>Quotation #</th>
                <th>Client</th>
                <th>Reg. No.</th>
                <th>Insurer</th>
                <th>Status</th>
                <th className="num">Premium</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.risk_note_number}</td>
                  <td>{it.quotation_number}</td>
                  <td>{it.client_name}</td>
                  <td>{it.registration_no}</td>
                  <td>{it.insurer_name}</td>
                  <td>
                    <span className={`badge ${it.status === "ACTIVE" ? "badge-green" : "badge-gray"}`}>{it.status}</span>
                  </td>
                  <td className="num">{money(it.premium)}</td>
                  <td>
                    <Link className="btn btn-secondary btn-sm" to={`/admin/risk-notes/${it.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>
                    No risk notes found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 8 }}>
          <span className="hint">
            {total} total · page {page} of {lastPage}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <button className="btn btn-ghost btn-sm" disabled={loading || page >= lastPage} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
