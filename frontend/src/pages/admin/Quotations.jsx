import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage, money } from "../../api/client";

const STATUSES = ["DRAFT", "GENERATED", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"];

export default function Quotations() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  // The `page` state is the single source of truth for what's loaded --
  // this effect is the only place that fetches. Prev/Next/search all just
  // change `page` (or call load() directly when they need a page React
  // would treat as unchanged, e.g. searching while already on page 1) so
  // there is exactly one fetch per page change, never a duplicate.
  async function load(targetPage) {
    setError("");
    setLoading(true);
    try {
      const params = { page: targetPage, page_size: pageSize };
      if (q) params.q = q;
      if (status) params.status = status;
      const res = await api.get("/api/admin/quotations", { params });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function search() {
    // Always jump back to page 1 -- a new search/filter invalidates
    // whatever page the user was previously on.
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
      <h1 style={{ fontSize: 20, color: "var(--imoth-blue)", marginBottom: 16 }}>Quotations</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="first">Search</label>
            <input
              type="text"
              placeholder="Quotation #, client, or reg. no."
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
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "var(--muted)" }}>
                    No quotations found.
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
