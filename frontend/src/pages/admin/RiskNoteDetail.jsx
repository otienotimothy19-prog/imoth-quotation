import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Download, FileText, History, Mail, Printer, ShieldCheck } from "lucide-react";
import { api, commercialUseLabel, dateFmt, dateTimeFmt, downloadBlob, errorMessage, openPdfInNewTab } from "../../api/client";
import { Card, EmptyState, Modal, StatusBadge, humanize, kes } from "../../components/ui";

const money = (n) => kes(n, { decimals: 2 });
import { useAuth } from "../../context/AuthContext";

function titleCase(value) {
  if (!value) return "—";
  return String(value).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RiskNoteDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [rn, setRn] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [voidBox, setVoidBox] = useState(false);
  const [voidStatus, setVoidStatus] = useState("VOID");
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailStatus, setEmailStatus] = useState("");

  async function load() {
    setLoadError("");
    try {
      const [d, a] = await Promise.all([
        api.get(`/api/admin/risk-notes/${id}`),
        api.get(`/api/admin/risk-notes/${id}/audit`),
      ]);
      setRn(d.data);
      setAudit(a.data);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function downloadPdf() {
    setError("");
    setPdfBusy(true);
    try {
      const res = await api.get(`/api/admin/risk-notes/${id}/pdf`, { responseType: "blob" });
      downloadBlob(res.data, `${rn.risk_note_number}.pdf`);
    } catch (err) {
      setError(errorMessage(err, "Could not download the PDF."));
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleVoid() {
    if (rn.status !== "ACTIVE") {
      setError("This risk note is already inactive and cannot be voided again.");
      return;
    }
    if (!voidReason.trim()) {
      setError("A reason is required.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api.post(`/api/admin/risk-notes/${id}/void`, { new_status: voidStatus, reason: voidReason });
      setVoidBox(false);
      setVoidReason("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not void this risk note."));
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail(both) {
    setBusy(true);
    setEmailStatus("");
    setError("");
    try {
      const res = await api.post(`/api/admin/risk-notes/${id}/email`, {
        to_email: emailTo || null,
        include_quotation: both,
        include_risk_note: true,
      });
      setEmailStatus(res.data.status === "SENT" ? "Sent!" : `Failed: ${res.data.error}`);
    } catch (err) {
      setEmailStatus("");
      setError(errorMessage(err, "Could not send the email."));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <div className="alert alert-error">{loadError}</div>;
  if (!rn) return <div className="card">Loading…</div>;

  const canVoid = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

  async function printPdf() {
    setError("");
    try {
      await openPdfInNewTab(`/api/admin/risk-notes/${id}/pdf`);
    } catch (err) {
      setError(errorMessage(err, "Could not open the PDF."));
    }
  }

  return (
    <div>
      <Link to="/admin/risk-notes" className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
        <ArrowLeft size={14} /> Back to Risk Notes
      </Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {rn.risk_note_number} <StatusBadge status={rn.status} />
          </h1>
          <p>{rn.insurer_name} · {rn.registration_no} · Cover {dateFmt(rn.cover_start_date)} – {dateFmt(rn.cover_end_date)}</p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-secondary" to={`/admin/quotations/${rn.quotation_id}`}>
            <FileText size={16} /> View quotation
          </Link>
          {canVoid && rn.status === "ACTIVE" && (
            <button type="button" className="btn btn-danger" onClick={() => { setVoidBox(true); setError(""); }}>
              <Ban size={16} /> Void / Cancel
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={printPdf}>
            <Printer size={16} /> Print
          </button>
          <button type="button" className="btn btn-primary" onClick={downloadPdf} disabled={pdfBusy} aria-busy={pdfBusy}>
            {pdfBusy ? <span className="spinner" /> : <><Download size={16} /> Download PDF</>}
          </button>
        </div>
      </div>

      {error && !voidBox && <div className="alert alert-error">{error}</div>}

      <div className="grid-main-side">
        <div className="stack">
          <Card title="Cover summary" icon={ShieldCheck}>
            <dl className="kv">
              <dt>Insured</dt><dd>{rn.client_name}</dd>
              <dt>Vehicle</dt><dd>{rn.registration_no}</dd>
              <dt>Insurer</dt><dd>{rn.insurer_name}</dd>
              <dt>Sum insured</dt><dd>{money(rn.sum_insured)}</dd>
              <dt>Premium</dt><dd><strong>{money(rn.premium)}</strong></dd>
              <dt>Cover start</dt><dd>{dateTimeFmt(rn.cover_start_date)}</dd>
              <dt>Cover end</dt><dd>{dateTimeFmt(rn.cover_end_date)}</dd>
              <dt>Accepted on</dt><dd>{dateTimeFmt(rn.quotation_accepted_at)}</dd>
              {rn.commercial_use && (
                <>
                  <dt>Commercial use</dt><dd>{commercialUseLabel(rn.commercial_use)}</dd>
                  {rn.tonnage != null && <><dt>Tonnage</dt><dd>{rn.tonnage} tons</dd></>}
                </>
              )}
              {rn.institution_type && (
                <>
                  <dt>Institution type</dt><dd>{titleCase(rn.institution_type)}</dd>
                  <dt>Vehicle type</dt><dd>{titleCase(rn.institutional_vehicle_type)}</dd>
                  <dt>Passenger category</dt><dd>{titleCase(rn.passenger_category)}</dd>
                  {rn.passenger_seats != null && <><dt>Passenger seats (excl. driver)</dt><dd>{rn.passenger_seats}</dd></>}
                </>
              )}
            </dl>
          </Card>

          <Card title="Status history" icon={History}>
            {rn.status_history.length === 0 ? (
              <EmptyState title="No status changes" />
            ) : (
              <div className="table-wrap">
                <table className="stack-mobile">
                  <thead>
                    <tr><th>From</th><th>To</th><th>Reason</th><th>When</th></tr>
                  </thead>
                  <tbody>
                    {rn.status_history.map((h, i) => (
                      <tr key={i}>
                        <td data-label="From">{h.previous_status ? <StatusBadge status={h.previous_status} /> : "—"}</td>
                        <td data-label="To"><StatusBadge status={h.new_status} /></td>
                        <td data-label="Reason">{h.reason}</td>
                        <td data-label="When" style={{ whiteSpace: "nowrap" }}>{dateTimeFmt(h.changed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Email documents" icon={Mail}>
            <label className="first" htmlFor="rn-email">Send to</label>
            <input id="rn-email" type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="client@email.com" />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} aria-busy={busy} onClick={() => sendEmail(false)}>
                Email Risk Note
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy} onClick={() => sendEmail(true)}>
                Email Both Documents
              </button>
            </div>
            {emailStatus && <div className="hint" style={{ marginTop: 6 }}>{emailStatus}</div>}
          </Card>

          <Card title="Audit trail" icon={History}>
            {audit.length === 0 ? (
              <EmptyState title="No audit entries" />
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {audit.map((a, i) => (
                  <div key={i} style={{ borderLeft: "3px solid var(--c-border)", paddingLeft: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{humanize(a.action)}</div>
                    <div className="cell-sub">{[a.actor_label, dateTimeFmt(a.timestamp)].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={voidBox}
        title={`Void or cancel ${rn.risk_note_number}`}
        onClose={busy ? undefined : () => setVoidBox(false)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setVoidBox(false)}>Cancel</button>
            <button type="button" className="btn btn-danger-solid" disabled={busy || !voidReason.trim()} aria-busy={busy} onClick={handleVoid}>
              {busy ? <span className="spinner" /> : `Mark as ${voidStatus}`}
            </button>
          </>
        }
      >
        <div className="alert alert-error" style={{ marginBottom: 14 }}>This cannot be undone. The risk note will no longer be active.</div>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="first" htmlFor="rn-void-status">New status</label>
        <select id="rn-void-status" value={voidStatus} onChange={(e) => setVoidStatus(e.target.value)}>
          <option value="VOID">Void</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <label htmlFor="rn-void-reason">Reason <span className="req" style={{ color: "var(--c-red)" }}>*</span></label>
        <textarea id="rn-void-reason" rows={3} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Explain why this risk note is being voided" />
      </Modal>
    </div>
  );
}
