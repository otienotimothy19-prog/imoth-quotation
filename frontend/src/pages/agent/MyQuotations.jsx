import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, dateFmt, downloadBlob, errorMessage, money } from "../../api/client";

const PAGE_SIZE = 25;

export default function MyQuotations() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .get("/api/agent/quotations", { params: { q: query || undefined, page, page_size: PAGE_SIZE } })
      .then((res) => {
        setItems(res.data.items);
        setTotal(res.data.total);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [query, page]);

  async function downloadPdf(it) {
    setError("");
    setDownloadingId(it.id);
    try {
      const res = await api.get(`/api/admin/quotations/${it.id}/pdf`, { responseType: "blob" });
      downloadBlob(res.data, `Imoth-Motor-Quote-${it.insurer_name}-${it.quotation_number}.pdf`);
    } catch (err) {
      setError(errorMessage(err, "Could not download the PDF."));
    } finally {
      setDownloadingId(null);
    }
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>My Quotations</h1>
        <Link className="btn btn-primary" to="/agent/new">+ New Quotation</Link>
      </div>

      <form
        className="card"
        style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(q.trim());
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="first" htmlFor="mq-search">Search</label>
          <input id="mq-search" type="text" placeholder="Quotation #, client, or reg. no." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>Search</button>
      </form>

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
                <th>Status</th>
                <th className="num">Premium</th>
                <th>Date</th>
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
                  <td><span className="badge badge-blue">{it.status}</span></td>
                  <td className="num">{money(it.total_premium)}</td>
                  <td>{dateFmt(it.created_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={downloadingId === it.id}
                      aria-busy={downloadingId === it.id}
                      onClick={() => downloadPdf(it)}
                    >
                      {downloadingId === it.id ? <span className="spinner spinner-dark" /> : "PDF"}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !error && items.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>
                    {query ? "No quotations match your search." : "You haven't created any quotations yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 8 }}>
          <span className="hint">{total} total · page {page} of {lastPage}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn btn-ghost btn-sm" disabled={loading || page >= lastPage} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
