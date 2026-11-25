import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CarFront,
  CheckCircle2,
  FilePlus2,
  FileText,
  PieChart,
  ScrollText,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { api, dateFmt, errorMessage } from "../../api/client";
import { BarList, Card, DataTable, EmptyState, PageHeader, StatCard, StatusBadge, TrendChart, categoryLabel, kes } from "../../components/ui";

// A plain <input type="date"> gives "YYYY-MM-DD" with no time component.
// The backend expects a full ISO datetime, and the end date must cover the
// whole day (up to 23:59:59.999) or records from that day would be excluded.
function toStartOfDayIso(dateStr) {
  return dateStr ? `${dateStr}T00:00:00` : null;
}
function toEndOfDayIso(dateStr) {
  return dateStr ? `${dateStr}T23:59:59.999` : null;
}
const isoDay = (d) => d.toISOString().slice(0, 10);

function presetRange(key) {
  const today = new Date();
  const start = new Date(today);
  if (key === "7d") start.setDate(today.getDate() - 6);
  else if (key === "30d") start.setDate(today.getDate() - 29);
  else if (key === "month") start.setDate(1);
  else return { date_from: "", date_to: "" };
  return { date_from: isoDay(start), date_to: isoDay(today) };
}

const PRESETS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

const CATEGORY_COLORS = ["#2454d6", "#102b60", "#ed3237", "#0ea5e9", "#15803d", "#b45309", "#7c3aed", "#64748b"];

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState({ date_from: "", date_to: "" });
  const [preset, setPreset] = useState("all");

  async function load(r = range) {
    if (r.date_from && r.date_to && r.date_from > r.date_to) {
      setError("Start date must be before end date.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const params = {};
      const from = toStartOfDayIso(r.date_from);
      const to = toEndOfDayIso(r.date_to);
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

  function applyPreset(key) {
    const r = presetRange(key);
    setPreset(key);
    setRange(r);
    load(r);
  }

  const rangeLabel = preset === "all" && !range.date_from && !range.date_to
    ? "All time"
    : `${range.date_from ? dateFmt(range.date_from) : "Start"} – ${range.date_to ? dateFmt(range.date_to) : "Today"}`;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Quotation and risk note activity across all insurers."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin/quotations")}>
              <FileText size={16} /> Quotations
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate("/admin/risk-notes")}>
              <ScrollText size={16} /> Risk Notes
            </button>
            <button type="button" className="btn btn-primary" onClick={() => navigate("/admin/quotations/new")}>
              <FilePlus2 size={16} /> New Quotation
            </button>
          </>
        }
      />

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div className="filter-bar">
          <div className="shrink">
            <label>Period</label>
            <div className="segmented" role="tablist" aria-label="Date range">
              {PRESETS.map((p) => (
                <button key={p.key} type="button" role="tab" aria-selected={preset === p.key} onClick={() => applyPreset(p.key)} disabled={loading}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="dash-from">From</label>
            <input id="dash-from" type="date" aria-label="Start date" value={range.date_from} max={range.date_to || undefined}
              onChange={(e) => { setPreset("custom"); setRange({ ...range, date_from: e.target.value }); }} />
          </div>
          <div>
            <label htmlFor="dash-to">To</label>
            <input id="dash-to" type="date" aria-label="End date" value={range.date_to} min={range.date_from || undefined}
              onChange={(e) => { setPreset("custom"); setRange({ ...range, date_to: e.target.value }); }} />
          </div>
          <div className="shrink">
            <button type="button" className="btn btn-primary" onClick={() => load()} disabled={loading} aria-busy={loading}>
              {loading ? <span className="spinner" /> : <><CalendarDays size={16} /> Apply</>}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!data ? (
        !error && (
          <div className="stat-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="stat-card"><div style={{ flex: 1 }}><span className="skeleton" style={{ width: "50%" }} /><span className="skeleton" style={{ width: "70%", height: 20, marginTop: 10 }} /></div></div>
            ))}
          </div>
        )
      ) : (
        <div className="stack">
          <div className="stat-grid">
            <StatCard icon={FileText} label="Total Quotations" value={data.total_quotations.toLocaleString()} note={rangeLabel} />
            <StatCard icon={TrendingUp} tone="navy" label="Quotations Today" value={data.quotations_today.toLocaleString()} />
            <StatCard icon={CalendarDays} tone="navy" label="This Month" value={data.quotations_this_month.toLocaleString()} note="Quotations since the 1st" />
            <StatCard icon={Wallet} tone="green" label="Total Quoted Premium" value={kes(data.total_quoted_premium)} note={rangeLabel} />
            <StatCard icon={ScrollText} tone="red" label="Total Risk Notes" value={data.total_risk_notes.toLocaleString()} note={`${data.risk_notes_generated.toLocaleString()} in ${rangeLabel.toLowerCase()}`} />
            <StatCard icon={CheckCircle2} tone="green" label="Conversion Rate" value={`${data.conversion_rate_pct}%`} note={`${data.accepted_quotations} accepted · ${data.rejected_quotations} rejected`} />
            <StatCard icon={Building2} tone="amber" label="Active Insurers" value={data.active_insurers.toLocaleString()} />
            <StatCard icon={Users} tone="navy" label="Registered Users" value={data.registered_users.toLocaleString()} note="Active accounts" />
          </div>

          <div className="grid-main-side">
            <Card title="Quotation trend" icon={BarChart3} sub={data.trend.length ? `${dateFmt(data.trend[0].date)} – ${dateFmt(data.trend[data.trend.length - 1].date)}` : ""}>
              {data.trend.some((p) => p.count > 0) ? <TrendChart points={data.trend} /> : <EmptyState title="No quotations in this period" />}
            </Card>
            <Card title="By vehicle category" icon={PieChart}>
              {data.by_category.length ? (
                <BarList items={data.by_category.map((c, i) => ({ label: categoryLabel(c.category), value: c.count, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))} />
              ) : (
                <EmptyState title="No quotations in this period" />
              )}
            </Card>
          </div>

          <div className="grid-2">
            <Card title="Quotations by insurer" icon={Building2}>
              {data.by_insurer.length ? (
                <BarList items={data.by_insurer.map((r) => ({ label: r.insurer, value: r.count, extra: kes(r.total_premium) }))} />
              ) : (
                <EmptyState title="No quotations in this period" />
              )}
            </Card>
            <Card title="Top vehicle classes" icon={CarFront}>
              {data.by_vehicle_class.length ? (
                <BarList items={data.by_vehicle_class.map((r) => ({ label: r.vehicle_class, value: r.count, color: "#102b60" }))} />
              ) : (
                <EmptyState title="No quotations yet" />
              )}
            </Card>
          </div>

          <div className="grid-2">
            <Card title="Recent quotations" icon={FileText} actions={<Link to="/admin/quotations" className="cell-link" style={{ fontSize: 13 }}>View all</Link>}>
              <DataTable
                rows={data.recent_quotations}
                empty={<EmptyState title="No quotations yet" />}
                columns={[
                  { key: "quotation_number", header: "Quotation", render: (q) => (
                    <>
                      <Link to={`/admin/quotations/${q.id}`} className="cell-link">{q.quotation_number}</Link>
                      <div className="cell-sub">{q.registration_no}{q.insurer_name ? ` · ${q.insurer_name}` : ""}</div>
                    </>
                  ) },
                  { key: "status", header: "Status", render: (q) => <StatusBadge status={q.status} /> },
                  { key: "total_premium", header: "Premium", align: "right", render: (q) => kes(q.total_premium) },
                ]}
              />
            </Card>
            <Card title="Recent risk notes" icon={ScrollText} actions={<Link to="/admin/risk-notes" className="cell-link" style={{ fontSize: 13 }}>View all</Link>}>
              <DataTable
                rows={data.recent_risk_notes}
                empty={<EmptyState title="No risk notes yet" />}
                columns={[
                  { key: "risk_note_number", header: "Risk note", render: (r) => (
                    <>
                      <Link to={`/admin/risk-notes/${r.id}`} className="cell-link">{r.risk_note_number}</Link>
                      <div className="cell-sub">{[r.registration_no, r.insurer_name].filter(Boolean).join(" · ") || dateFmt(r.generated_at)}</div>
                    </>
                  ) },
                  { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
                  { key: "premium", header: "Premium", align: "right", render: (r) => kes(r.premium) },
                ]}
              />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
