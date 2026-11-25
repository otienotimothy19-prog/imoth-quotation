// Shared building blocks for the admin and agent app. Styles live in
// src/styles/app.css (scoped to .app-shell).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Inbox, MoreVertical, X } from "lucide-react";

export function PageHeader({ title, description, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, icon: Icon, sub, actions, children, className = "", style }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || actions) && (
        <div className="card-title">
          <h2>
            {Icon && <Icon size={17} aria-hidden="true" />}
            {title}
            {sub && <span className="sub">{sub}</span>}
          </h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ icon: Icon, label, value, note, tone = "" }) {
  return (
    <div className="stat-card">
      {Icon && (
        <span className={`stat-icon ${tone}`} aria-hidden="true">
          <Icon size={19} />
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {note && <div className="stat-note">{note}</div>}
      </div>
    </div>
  );
}

const STATUS_TONES = {
  ACTIVE: "green",
  ACCEPTED: "green",
  SENT: "blue",
  GENERATED: "blue",
  DOCUMENTS_PENDING: "amber",
  DRAFT: "gray",
  REJECTED: "red",
  EXPIRED: "gray",
  CANCELLED: "gray",
  VOID: "red",
  SUPERSEDED: "gray",
  PENDING: "amber",
  FAILED: "red",
  DISABLED: "gray",
  LOCKED: "red",
};

export function humanize(value) {
  if (!value) return "";
  return String(value).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status, label, tone }) {
  const t = tone || STATUS_TONES[status] || "gray";
  return <span className={`badge badge-${t}`}>{label || humanize(status)}</span>;
}

export function Avatar({ name, size = 32 }) {
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

export function EmptyState({ icon: Icon = Inbox, title = "Nothing here yet", children }) {
  return (
    <div className="empty">
      <Icon size={28} aria-hidden="true" />
      <div className="empty-title">{title}</div>
      {children && <div style={{ fontSize: 13 }}>{children}</div>}
    </div>
  );
}

export function Field({ label, required, hint, error, htmlFor, children, className = "" }) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label htmlFor={htmlFor}>
          {label}
          {required && <span className="req" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? <div className="field-error" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function IconInput({ icon: Icon, children }) {
  return (
    <div className="input-icon">
      <Icon size={16} aria-hidden="true" />
      {children}
    </div>
  );
}

// Closes on outside click and Escape.
function useDismiss(open, onClose, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, ref]);
}

// Three-dot row menu. items: [{ label, icon, onClick, danger, disabled, hidden }]
export function ActionMenu({ items, label = "Actions" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useMemo(() => () => setOpen(false), []);
  useDismiss(open, close, ref);
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;
  return (
    <div className="menu-wrap" ref={ref} style={{ display: "inline-block" }}>
      <button type="button" className="app-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ width: 32, height: 32 }}>
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`menu-item ${item.danger ? "danger" : ""}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {Icon && <Icon size={15} aria-hidden="true" />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Dropdown({ trigger, children, align = "right", up = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useMemo(() => () => setOpen(false), []);
  useDismiss(open, close, ref);
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div className={`menu-pop ${up ? "up" : ""}`} style={align === "left" ? { left: 0, right: "auto" } : undefined} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function useLockScroll(open) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

export function Modal({ open, title, onClose, children, footer, wide = false, drawer = false }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useLockScroll(open);
  // Escape closes; focus moves into the dialog once, when it opens (not on
  // every re-render, which would pull the cursor away while typing).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onCloseRef.current?.();
    document.addEventListener("keydown", onKey);
    const first = panelRef.current?.querySelector(".modal-body input:not([disabled]), .modal-body select:not([disabled]), .modal-body textarea, .modal-foot button");
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className={`overlay ${drawer ? "drawer-overlay" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={panelRef} className={drawer ? "drawer" : `modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="app-icon-btn" aria-label="Close" onClick={onClose} style={{ border: "none" }}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={drawer ? { flex: 1 } : undefined}>{children}</div>
        {footer && <div className="modal-foot" style={drawer ? { borderRadius: 0 } : undefined}>{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer(props) {
  return <Modal {...props} drawer />;
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? undefined : onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`} onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? <span className="spinner" /> : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>{message}</div>
    </Modal>
  );
}

// columns: [{ key, header, align: "right", sortable, sortValue: (row) => any,
//             render: (row) => node, width, className }]
// Sorting is client-side, over the rows passed in.
export function DataTable({ columns, rows, rowKey = (r) => r.id, loading = false, empty, skeletonRows = 6, onRowClick, minWidth }) {
  const [sort, setSort] = useState(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sortValue || ((r) => r[col.key]);
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, columns, sort]);

  function toggleSort(col) {
    if (!col.sortable) return;
    setSort((s) => (s?.key === col.key ? (s.dir === "asc" ? { key: col.key, dir: "desc" } : null) : { key: col.key, dir: "asc" }));
  }

  return (
    <div className="table-wrap">
      <table style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const SortIcon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th
                  key={col.key}
                  className={`${col.align === "right" ? "num" : ""} ${col.sortable ? "sortable" : ""}`}
                  style={col.width ? { width: col.width } : undefined}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  onClick={() => toggleSort(col)}
                  onKeyDown={(e) => col.sortable && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleSort(col))}
                  tabIndex={col.sortable ? 0 : undefined}
                >
                  <span className="th-inner">
                    {col.header}
                    {col.sortable && <SortIcon size={12} aria-hidden="true" style={{ opacity: active ? 1 : 0.45 }} />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`s${i}`}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      <span className="skeleton" style={{ width: col.align === "right" ? "60%" : "80%", marginLeft: col.align === "right" ? "auto" : 0 }} />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.map((row) => (
                <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: "pointer" } : undefined}>
                  {columns.map((col) => (
                    <td key={col.key} className={`${col.align === "right" ? "num" : ""} ${col.className || ""}`}>
                      {col.render ? col.render(row) : row[col.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={{ padding: 0 }}>
                {empty || <EmptyState />}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, loading }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="table-foot">
      <span>
        {total === 0 ? "No results" : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      <div className="pager">
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={15} /> Prev
        </button>
        <span>Page {page} of {last}</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading || page >= last} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

export function BarList({ items, format = (v) => v.toLocaleString() }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div key={item.label}>
          <div className="bar-row-top">
            <span className="label" title={item.label}>{item.label}</span>
            <span className="value">{format(item.value)}{item.extra ? ` · ${item.extra}` : ""}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.value / max) * 100}%`, background: item.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Daily counts as a column chart. points: [{ date: "2026-11-25", count }]
export function TrendChart({ points, height = 180 }) {
  const [hover, setHover] = useState(null);
  const width = 640;
  const pad = { top: 12, right: 8, bottom: 24, left: 30 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.map((p) => p.count));
  const niceMax = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const step = innerW / Math.max(1, points.length);
  const barW = Math.max(2, Math.min(28, step * 0.7));
  const ticks = [0, niceMax / 2, niceMax];
  const labelEvery = Math.ceil(points.length / 8);
  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return (
    <div className="trend-chart" style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Quotations per day">
        {ticks.map((t) => {
          const y = pad.top + innerH - (t / niceMax) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={t === 0 ? "" : "3 3"} />
              <text x={pad.left - 6} y={y + 3} textAnchor="end" className="axis">{Math.round(t)}</text>
            </g>
          );
        })}
        {points.map((p, i) => {
          const h = (p.count / niceMax) * innerH;
          const x = pad.left + i * step + (step - barW) / 2;
          return (
            <g key={p.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.left + i * step} y={pad.top} width={step} height={innerH} fill="transparent" />
              <rect x={x} y={pad.top + innerH - h} width={barW} height={Math.max(h, p.count ? 1 : 0)} rx="3" fill={hover === i ? "#1d45b3" : "#2454d6"} />
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="axis">{fmt(p.date)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && points[hover] && (
        <div style={{ position: "absolute", top: 0, right: 0, background: "#102b60", color: "#fff", fontSize: 12, padding: "4px 8px", borderRadius: 6 }}>
          {fmt(points[hover].date)}: {points[hover].count} quotation{points[hover].count === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

// "KES 1,234,567" -- whole shillings, thousands separators.
export function kes(n, { decimals = 0 } = {}) {
  const v = Number(n) || 0;
  return `KES ${v.toLocaleString("en-KE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export const CATEGORY_LABELS = {
  private: "Private",
  commercial: "Commercial",
  psv: "PSV",
  tuktuk: "Tuk Tuk",
  motorcycle: "Motorcycle",
  asset: "Asset",
  special: "Special Type",
  tpo: "Third Party Only",
};

export function categoryLabel(value) {
  return CATEGORY_LABELS[value] || humanize(value);
}

// Amount input showing thousands separators ("1,500,000") with a KES
// prefix. `value`/`onChange` carry plain digits, like a number input.
export function MoneyInput({ value, onChange, id, placeholder, ...rest }) {
  const shown = value === "" || value == null ? "" : Number(String(value).replace(/,/g, "")).toLocaleString("en-KE");
  return (
    <div className="input-prefix">
      <span aria-hidden="true">KES</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={shown}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        {...rest}
      />
    </div>
  );
}
