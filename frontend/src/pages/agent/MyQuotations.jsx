import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, FilePlus2, FileSearch, Printer, RotateCcw, Search } from "lucide-react";
import { api, dateFmt, downloadBlob, errorMessage, openPdfInNewTab, serverFilename } from "../../api/client";
import { ActionMenu, DataTable, EmptyState, IconInput, PageHeader, Pagination, StatusBadge, categoryLabel, kes } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

const PAGE_SIZE = 25;

export default function MyQuotations() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
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
    try {
      const res = await api.get(`/api/admin/quotations/${it.id}/pdf`, { responseType: "blob" });
      downloadBlob(res.data, serverFilename(res, `Imoth_Quote_${it.quotation_number}.pdf`));
    } catch (err) {
      toast.error(errorMessage(err, "Could not download the PDF."));
    }
  }

  async function printPdf(it) {
    try {
      await openPdfInNewTab(`/api/admin/quotations/${it.id}/pdf`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not open the PDF."));
    }
  }

  const columns = [
    {
      key: "quotation_number", header: "Quotation", sortable: true,
      render: (it) => (
        <>
          <div className="cell-main" style={{ whiteSpace: "nowrap" }}>{it.quotation_number}</div>
          <div className="cell-sub">{it.client_name}</div>
        </>
      ),
    },
    { key: "registration_no", header: "Reg. No.", sortable: true, render: (it) => <span className="cell-main" style={{ whiteSpace: "nowrap" }}>{it.registration_no}</span> },
    {
      key: "insurer_name", header: "Insurer & Class", sortable: true,
      render: (it) => (
        <div style={{ minWidth: 180 }}>
          <div>{it.insurer_name}</div>
          <div className="cell-sub">{it.vehicle_category ? `${categoryLabel(it.vehicle_category)} · ` : ""}{it.vehicle_class_label}</div>
        </div>
      ),
    },
    { key: "total_premium", header: "Premium", align: "right", sortable: true, render: (it) => <strong>{kes(it.total_premium)}</strong> },
    { key: "created_at", header: "Date", sortable: true, render: (it) => <span style={{ whiteSpace: "nowrap" }}>{dateFmt(it.created_at)}</span> },
    { key: "status", header: "Status", sortable: true, render: (it) => <StatusBadge status={it.status} /> },
    {
      key: "actions", header: "", width: 48,
      render: (it) => (
        <ActionMenu
          label={`Actions for ${it.quotation_number}`}
          items={[
            { label: "Download PDF", icon: Download, onClick: () => downloadPdf(it) },
            { label: "Open / print PDF", icon: Printer, onClick: () => printPdf(it) },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="My Quotations"
        description="Every quotation you've generated."
        actions={<button type="button" className="btn btn-primary" onClick={() => navigate("/agent/new")}><FilePlus2 size={16} /> New Quotation</button>}
      />

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <form
          className="filter-bar"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
        >
          <div className="grow">
            <label htmlFor="mq-search">Search</label>
            <IconInput icon={Search}>
              <input id="mq-search" type="text" placeholder="Quotation #, client, or reg. no." value={q} onChange={(e) => setQ(e.target.value)} />
            </IconInput>
          </div>
          <div className="shrink" style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={loading}><Search size={15} /> Search</button>
            {query && (
              <button type="button" className="btn btn-secondary" onClick={() => { setQ(""); setQuery(""); setPage(1); }}>
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
        minWidth={820}
        empty={
          <EmptyState icon={FileSearch} title={query ? "No quotations match your search." : "You haven't created any quotations yet."}>
            {query ? "Try a different search." : "Generate your first quotation from New Quotation."}
          </EmptyState>
        }
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} loading={loading} onPage={setPage} />
    </div>
  );
}
