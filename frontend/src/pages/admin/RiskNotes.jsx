import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Ban, CheckCircle2, Download, Eye, FileSearch, FileText, Printer, RotateCcw, ScrollText, Search, Wallet } from "lucide-react";
import { api, dateFmt, downloadBlob, errorMessage, openPdfInNewTab, serverFilename } from "../../api/client";
import { ActionMenu, DataTable, EmptyState, IconInput, PageHeader, Pagination, StatCard, StatusBadge, humanize, kes } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

const STATUSES = ["ACTIVE", "VOID", "CANCELLED", "SUPERSEDED"];
const EMPTY_FILTERS = { q: "", status: "", insurer_id: "", date_from: "", date_to: "" };

export default function RiskNotes() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [insurers, setInsurers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    api.get("/api/admin/insurers").then((res) => setInsurers(res.data)).catch(() => {});
  }, []);

  async function load(targetPage, f = filters) {
    if (f.date_from && f.date_to && f.date_from > f.date_to) {
      setError("Start date must be before end date.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const params = { page: targetPage, page_size: pageSize };
      if (f.q) params.q = f.q;
      if (f.status) params.status = f.status;
      if (f.insurer_id) params.insurer_id = f.insurer_id;
      if (f.date_from) params.date_from = `${f.date_from}T00:00:00`;
      if (f.date_to) params.date_to = `${f.date_to}T23:59:59.999`;
      const res = await api.get("/api/admin/risk-notes", { params });
      setItems(res.data.items);
      setTotal(res.data.total);
      setSummary({ counts: res.data.status_counts || {}, premium: res.data.premium_total || 0 });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function search(f = filters) {
    if (page === 1) load(1, f);
    else setPage(1);
  }

  function setFilter(key, value, immediate = false) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (immediate) search(next);
  }

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function download(rn) {
    try {
      const res = await api.get(`/api/admin/risk-notes/${rn.id}/pdf`, { responseType: "blob" });
      downloadBlob(res.data, serverFilename(res, `${rn.risk_note_number}.pdf`));
    } catch (err) {
      toast.error(errorMessage(err, "Could not download the PDF."));
    }
  }

  async function print(rn) {
    try {
      await openPdfInNewTab(`/api/admin/risk-notes/${rn.id}/pdf`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not open the PDF."));
    }
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const counts = summary?.counts || {};
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const columns = [
    {
      key: "risk_note_number", header: "Risk Note", sortable: true,
      render: (rn) => (
        <>
          <Link to={`/admin/risk-notes/${rn.id}`} className="cell-link" style={{ whiteSpace: "nowrap" }}>{rn.risk_note_number}</Link>
          <div className="cell-sub" style={{ whiteSpace: "nowrap" }}>{rn.quotation_number}</div>
        </>
      ),
    },
    { key: "client_name", header: "Insured", sortable: true, render: (rn) => <div style={{ minWidth: 130 }}>{rn.client_name}</div> },
    { key: "registration_no", header: "Reg. No.", sortable: true, render: (rn) => <span className="cell-main" style={{ whiteSpace: "nowrap" }}>{rn.registration_no}</span> },
    { key: "insurer_name", header: "Insurer", sortable: true, render: (rn) => <div style={{ minWidth: 150 }}>{rn.insurer_name}</div> },
    {
      key: "cover_type", header: "Cover", sortable: true,
      render: (rn) => (
        <>
          <div>{humanize(rn.cover_type)}</div>
          <div className="cell-sub" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={rn.vehicle_class_label}>{rn.vehicle_class_label}</div>
        </>
      ),
    },
    { key: "premium", header: "Premium", align: "right", sortable: true, render: (rn) => <strong>{kes(rn.premium)}</strong> },
    {
      key: "cover_start_date", header: "Cover Period", sortable: true,
      render: (rn) => <span style={{ whiteSpace: "nowrap" }}>{dateFmt(rn.cover_start_date)} – {dateFmt(rn.cover_end_date)}</span>,
    },
    { key: "generated_at", header: "Created", sortable: true, render: (rn) => <span style={{ whiteSpace: "nowrap" }}>{dateFmt(rn.generated_at)}</span> },
    { key: "status", header: "Status", sortable: true, render: (rn) => <StatusBadge status={rn.status} /> },
    {
      key: "actions", header: "", width: 48,
      render: (rn) => (
        <ActionMenu
          label={`Actions for ${rn.risk_note_number}`}
          items={[
            { label: "View details", icon: Eye, onClick: () => navigate(`/admin/risk-notes/${rn.id}`) },
            { label: "View quotation", icon: FileText, onClick: () => navigate(`/admin/quotations/${rn.quotation_id}`) },
            { label: "Download PDF", icon: Download, onClick: () => download(rn) },
            { label: "Open / print PDF", icon: Printer, onClick: () => print(rn) },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Risk Notes"
        description="Cover confirmations issued when a client accepts a quotation."
      />

      {summary && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <StatCard icon={ScrollText} label="Risk notes" value={allCount.toLocaleString()} note={hasFilters ? "Matching search and dates" : "All time"} />
          <StatCard icon={CheckCircle2} tone="green" label="Active" value={(counts.ACTIVE || 0).toLocaleString()} />
          <StatCard icon={Ban} tone="red" label="Void / cancelled" value={((counts.VOID || 0) + (counts.CANCELLED || 0)).toLocaleString()} note={counts.SUPERSEDED ? `${counts.SUPERSEDED} superseded` : undefined} />
          <StatCard icon={Wallet} tone="navy" label="Total premium" value={kes(summary.premium)} />
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <form className="filter-bar" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <div className="grow">
            <label htmlFor="rf-search">Search</label>
            <IconInput icon={Search}>
              <input id="rf-search" type="text" placeholder="RN #, quotation #, client, or reg. no." value={filters.q} onChange={(e) => setFilter("q", e.target.value)} />
            </IconInput>
          </div>
          <div>
            <label htmlFor="rf-insurer">Insurer</label>
            <select id="rf-insurer" value={filters.insurer_id} onChange={(e) => setFilter("insurer_id", e.target.value, true)}>
              <option value="">All insurers</option>
              {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rf-status">Status</label>
            <select id="rf-status" value={filters.status} onChange={(e) => setFilter("status", e.target.value, true)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rf-from">From</label>
            <input id="rf-from" type="date" value={filters.date_from} max={filters.date_to || undefined} onChange={(e) => setFilter("date_from", e.target.value)} />
          </div>
          <div>
            <label htmlFor="rf-to">To</label>
            <input id="rf-to" type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={(e) => setFilter("date_to", e.target.value)} />
          </div>
          <div className="shrink" style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={loading} aria-busy={loading}>
              {loading ? <span className="spinner" /> : <><Search size={15} /> Search</>}
            </button>
            {hasFilters && (
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => { setFilters(EMPTY_FILTERS); search(EMPTY_FILTERS); }}>
                <RotateCcw size={15} /> Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <DataTable
        columns={columns}
        rows={items}
        loading={loading && items.length === 0}
        minWidth={1250}
        empty={
          <EmptyState icon={FileSearch} title={hasFilters ? "No risk notes match these filters" : "No risk notes yet"}>
            {hasFilters ? "Try clearing a filter." : "Risk notes appear here once a client accepts a quotation."}
          </EmptyState>
        }
      />
      <Pagination page={page} pageSize={pageSize} total={total} loading={loading} onPage={setPage} />
    </div>
  );
}
