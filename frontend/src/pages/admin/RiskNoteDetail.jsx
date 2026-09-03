import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, dateTimeFmt, downloadBlob, errorMessage, money } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

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
    if (!window.confirm(`Mark ${rn.risk_note_number} as ${voidStatus}? This cannot be undone.`)) {
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

  return (
    <div>
      <Link to="/admin/risk-notes" className="hint">
        ← Back to Risk Notes
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 18px", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>{rn.risk_note_number}</h1>
        <span className={`badge ${rn.status === "ACTIVE" ? "badge-green" : "badge-gray"}`}>{rn.status}</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={downloadPdf} disabled={pdfBusy} aria-busy={pdfBusy}>
          {pdfBusy ? <span className="spinner spinner-dark" /> : "⬇ Download PDF"}
        </button>
        <Link className="btn btn-secondary btn-sm" to={`/admin/quotations/${rn.quotation_id}`}>
          View Quotation ({rn.quotation_number})
        </Link>
        {canVoid && rn.status === "ACTIVE" && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              setVoidBox((v) => !v);
              setError("");
            }}
          >
            Void / Cancel
          </button>
        )}
      </div>

      {voidBox && (
        <div className="card alert-info" style={{ marginBottom: 16 }}>
          <label className="first">New Status</label>
          <select value={voidStatus} onChange={(e) => setVoidStatus(e.target.value)}>
            <option value="VOID">VOID</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          <label>Reason (required)</label>
          <input type="text" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Explain why this risk note is being voided" />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-danger" disabled={busy || !voidReason.trim()} aria-busy={busy} onClick={handleVoid}>
              {busy ? <span className="spinner" /> : "Confirm"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setVoidBox(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="row2">
        <div className="card">
          <h3 style={{ fontSize: 13 }}>Risk Note Details</h3>
          <table>
            <tbody>
              <tr><td>Client</td><td>{rn.client_name}</td></tr>
              <tr><td>Vehicle</td><td>{rn.registration_no}</td></tr>
              <tr><td>Insurer</td><td>{rn.insurer_name}</td></tr>
              <tr><td>Sum Insured</td><td className="num">{money(rn.sum_insured)}</td></tr>
              <tr><td>Premium</td><td className="num">{money(rn.premium)}</td></tr>
              <tr><td>Cover Start</td><td>{dateTimeFmt(rn.cover_start_date)}</td></tr>
              <tr><td>Cover End</td><td>{dateTimeFmt(rn.cover_end_date)}</td></tr>
              <tr><td>Accepted On</td><td>{dateTimeFmt(rn.quotation_accepted_at)}</td></tr>
            </tbody>
          </table>

          <div style={{ marginTop: 16 }}>
            <label className="first">Email to</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="client@email.com" />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} aria-busy={busy} onClick={() => sendEmail(false)}>
                Email Risk Note
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy} onClick={() => sendEmail(true)}>
                Email Both Documents
              </button>
            </div>
            {emailStatus && <div className="hint" style={{ marginTop: 6 }}>{emailStatus}</div>}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 13 }}>Status History</h3>
          <table>
            <thead>
              <tr><th>From</th><th>To</th><th>Reason</th><th>When</th></tr>
            </thead>
            <tbody>
              {rn.status_history.map((h, i) => (
                <tr key={i}>
                  <td>{h.previous_status}</td>
                  <td>{h.new_status}</td>
                  <td>{h.reason}</td>
                  <td>{dateTimeFmt(h.changed_at)}</td>
                </tr>
              ))}
              {rn.status_history.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)" }}>No status changes.</td></tr>
              )}
            </tbody>
          </table>

          <h3 style={{ fontSize: 13, marginTop: 18 }}>Audit Trail</h3>
          <table>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td>{a.action}</td>
                  <td>{a.actor_label}</td>
                  <td>{dateTimeFmt(a.timestamp)}</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)" }}>No audit entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
