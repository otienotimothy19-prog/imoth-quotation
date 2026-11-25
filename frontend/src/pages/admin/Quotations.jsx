import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, Eye, FilePlus2, FileSearch, Printer, RotateCcw, Search } from "lucide-react";
import { api, dateFmt, downloadBlob, errorMessage, openPdfInNewTab, serverFilename } from "../../api/client";
import { ActionMenu, CATEGORY_LABELS, DataTable, EmptyState, IconInput, PageHeader, Pagination, StatusBadge, categoryLabel, kes } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

const STATUSES = ["DRAFT", "GENERATED", "SENT", "DOCUMENTS_PENDING", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"];
const EMPTY_FILTERS = { q: "", status: "", insurer_id: "", vehicle_category: "", date_from: "", date_to: "" };

export default function Quotations() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [insurers, setInsurers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    api.get("/api/admin/insurers").then((res) => setInsurers(res.data)).catch(() => {});
  }, []);

  // The `page` state is the single source of truth for what's loaded --
  // this effect is the only place that fetches. Prev/Next/search all just
  // change `page` (or call load() directly when they need a page React
  // would treat as unchanged, e.g. searching while already on page 1) so
  // there is exactly one fetch per page change, never a duplicate.
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
      if (f.vehicle_category) params.vehicle_category = f.vehicle_category;
      if (f.date_from) params.date_from = `${f.date_from}T00:00:00`;
      if (f.date_to) params.date_to = `${f.date_to}T23:59:59.999`;
      const res = await api.get("/api/admin/quotations", { params });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function search(f = filters) {
    // Always jump back to page 1 -- a new search/filter invalidates
    // whatever page the user was previously on.
    if (page === 1) load(1, f);
    else setPage(1);
  }

  function setFilter(key, value, immediate = false) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (immediate) search(next);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    search(EMPTY_FILTERS);
  }

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function download(q) {
    try {
      const res = await api.get(`/api/admin/quotations/${q.id}/pdf`, { responseType: "blob" });
      downloadBlob(res.data, serverFilename(res, `Imoth_Quote_${q.quotation_number}.pdf`));
    } catch (err) {
      toast.error(errorMessage(err, "Could not download the PDF."));
    }
  }

  async function print(q) {
    try {
      await openPdfInNewTab(`/api/admin/quotations/${q.id}/pdf`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not open the PDF."));
    }
  }

  const hasFilters = Object.values(filters).some(Boolean);

  const columns = [
    {
      key: "quotation_number", header: "Quotation", sortable: true,
      render: (q) => (
        <>
          <Link to={`/admin/quotations/${q.id}`} className="cell-link" style={{ whiteSpace: "nowrap" }}>{q.quotation_number}</Link>
          <div className="cell-sub">{q.client_name}</div>
        </>
      ),
    },
    { key: "registration_no", header: "Reg. No.", sortable: true, render: (q) => <span className="cell-main" style={{ whiteSpace: "nowrap" }}>{q.registration_no}</span> },
    {
      key: "vehicle_category", header: "Category", sortable: true,
      render: (q) => (
        <>
          <div>{q.vehicle_category ? categoryLabel(q.vehicle_category) : "—"}</div>
          <div className="cell-sub" title={q.vehicle_class_label} style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.vehicle_class_label}</div>
        </>
      ),
    },
    { key: "insurer_name", header: "Insurer", sortable: true, render: (q) => <div style={{ minWidth: 150 }}>{q.insurer_name}</div> },
    { key: "sum_insured", header: "Sum Insured", align: "right", sortable: true, render: (q) => kes(q.sum_insured) },
    { key: "total_premium", header: "Premium", align: "right", sortable: true, render: (q) => <strong>{kes(q.total_premium)}</strong> },
    { key: "amount_paid", header: "Paid", align: "right", sortable: true, render: (q) => kes(q.amount_paid) },
    {
      key: "balance", header: "Balance", align: "right", sortable: true,
      render: (q) => <span style={{ color: q.balance > 0 ? "var(--c-red-hover)" : "var(--c-green)" }}>{kes(q.balance)}</span>,
    },
    {
      key: "created_by_name", header: "Created By", sortable: true,
      render: (q) => q.created_by_name ? (
        <>
          <div>{q.created_by_name}</div>
          {q.created_by_role === "AGENT" && <span className="badge badge-amber no-dot" style={{ marginTop: 2 }}>Agent</span>}
        </>
      ) : <span className="cell-sub">Client portal</span>,
    },
    { key: "created_at", header: "Created", sortable: true, render: (q) => <span style={{ whiteSpace: "nowrap" }}>{dateFmt(q.created_at)}</span> },
    {
      key: "status", header: "Status", sortable: true,
      render: (q) => (
        <>
          <StatusBadge status={q.status} />
          {q.has_risk_note && <div className="cell-sub" style={{ marginTop: 3 }}>Risk note issued</div>}
        </>
      ),
    },
    {
      key: "actions", header: "", width: 48,
      render: (q) => (
        <ActionMenu
          label={`Actions for ${q.quotation_number}`}
          items={[
            { label: "View details", icon: Eye, onClick: () => navigate(`/admin/quotations/${q.id}`) },
            { label: "Download PDF", icon: Download, onClick: () => download(q) },
            { label: "Open / print PDF", icon: Printer, onClick: () => print(q) },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Every quotation generated by staff, agents and the client portal."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate("/admin/quotations/new")}>
            <FilePlus2 size={16} /> New Quotation
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <form
          className="filter-bar"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <div className="grow">
            <label htmlFor="qf-search">Search</label>
            <IconInput icon={Search}>
              <input id="qf-search" type="text" placeholder="Quotation #, client, or reg. no." value={filters.q} onChange={(e) => setFilter("q", e.target.value)} />
            </IconInput>
          </div>
          <div>
            <label htmlFor="qf-insurer">Insurer</label>
            <select id="qf-insurer" value={filters.insurer_id} onChange={(e) => setFilter("insurer_id", e.target.value, true)}>
              <option value="">All insurers</option>
              {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="qf-category">Category</label>
            <select id="qf-category" value={filters.vehicle_category} onChange={(e) => setFilter("vehicle_category", e.target.value, true)}>
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="qf-status">Status</label>
            <select id="qf-status" value={filters.status} onChange={(e) => setFilter("status", e.target.value, true)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="qf-from">From</label>
            <input id="qf-from" type="date" value={filters.date_from} max={filters.date_to || undefined} onChange={(e) => setFilter("date_from", e.target.value)} />
          </div>
          <div>
            <label htmlFor="qf-to">To</label>
            <input id="qf-to" type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={(e) => setFilter("date_to", e.target.value)} />
          </div>
          <div className="shrink" style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={loading} aria-busy={loading}>
              {loading ? <span className="spinner" /> : <><Search size={15} /> Search</>}
            </button>
            {hasFilters && (
              <button type="button" className="btn btn-secondary" onClick={clearFilters} disabled={loading}>
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
        minWidth={1500}
        empty={
          <EmptyState icon={FileSearch} title={hasFilters ? "No quotations match these filters" : "No quotations yet"}>
            {hasFilters ? "Try clearing a filter or widening the date range." : "Generated quotations will appear here."}
          </EmptyState>
        }
      />
      <Pagination page={page} pageSize={pageSize} total={total} loading={loading} onPage={setPage} />
    </div>
  );
}
