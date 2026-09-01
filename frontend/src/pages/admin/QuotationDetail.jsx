import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, dateTimeFmt, errorMessage, money } from "../../api/client";

export default function QuotationDetail() {
  const { id } = useParams();
  const [q, setQ] = useState(null);
  const [emails, setEmails] = useState([]);
  const [audit, setAudit] = useState([]);
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("details");
  const [emailTo, setEmailTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function load() {
    try {
      const [d, e, a, docs] = await Promise.all([
        api.get(`/api/admin/quotations/${id}`),
        api.get(`/api/admin/quotations/${id}/emails`),
        api.get(`/api/admin/quotations/${id}/audit`),
        api.get(`/api/admin/quotations/${id}/documents`),
      ]);
      setQ(d.data);
      setEmailTo(d.data.client.email || "");
      setEmails(e.data);
      setAudit(a.data);
      setDocuments(docs.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function verifyDocument(uploadId, verification_status) {
    await api.post(`/api/admin/quotations/${id}/documents/${uploadId}/verify`, { verification_status });
    load();
  }

  async function downloadDocument(uploadId, filename) {
    const res = await api.get(`/api/admin/quotations/${id}/documents/${uploadId}/download`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function sendEmail() {
    setBusy(true);
    setStatus("");
    try {
      const res = await api.post(`/api/admin/quotations/${id}/email`, { to_email: emailTo || null, include_quotation: true, include_risk_note: false });
      setStatus(res.data.status === "SENT" ? "Sent!" : `Failed: ${res.data.error}`);
      load();
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function retryEmail(logId) {
    await api.post(`/api/admin/quotations/emails/${logId}/retry`);
    load();
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!q) return <div className="card">Loading…</div>;

  return (
    <div>
      <Link to="/admin/quotations" className="hint">
        ← Back to Quotations
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 18px" }}>
        <h1 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>{q.quotation_number}</h1>
        <span className="badge badge-blue">{q.status}</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["details", "documents", "emails", "audit"].map((t) => (
          <button key={t} className={tab === t ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <a className="btn btn-secondary btn-sm" href={`/api/admin/quotations/${id}/pdf`} target="_blank" rel="noreferrer">
          ⬇ Download PDF
        </a>
        {q.risk_note && (
          <Link className="btn btn-secondary btn-sm" to={`/admin/risk-notes/${q.risk_note.id}`}>
            View Risk Note ({q.risk_note.risk_note_number})
          </Link>
        )}
      </div>

      {tab === "details" && (
        <div className="row2">
          <div className="card">
            <h3 style={{ fontSize: 13 }}>Client</h3>
            <p>{q.client.full_name}<br />{q.client.phone}<br />{q.client.email || "—"}<br />{q.client.id_or_passport || "—"}</p>
            <h3 style={{ fontSize: 13 }}>Vehicle</h3>
            <p>
              {q.vehicle.registration_no}<br />
              {q.vehicle.make} {q.vehicle.model}<br />
              Age: {q.vehicle.age_years ?? "—"} yrs
            </p>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 13 }}>Premium Breakdown</h3>
            <table>
              <tbody>
                {q.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.label}</td>
                    <td className="num">{money(it.amount)}</td>
                  </tr>
                ))}
                <tr><td>Levies</td><td className="num">{money(q.levies)}</td></tr>
                <tr><td>Stamp Duty</td><td className="num">{money(q.stamp_duty)}</td></tr>
                <tr style={{ fontWeight: 800 }}><td>Total</td><td className="num">{money(q.total_premium)}</td></tr>
              </tbody>
            </table>

            <div style={{ marginTop: 16 }}>
              <label className="first">Email quotation to</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
                <button className="btn btn-primary" disabled={busy} onClick={sendEmail}>
                  Send
                </button>
              </div>
              {status && <div className="hint" style={{ marginTop: 6 }}>{status}</div>}
            </div>
          </div>
        </div>
      )}

      {tab === "documents" && documents && (
        <div className="card">
          <p className="hint" style={{ marginBottom: 12 }}>
            {documents.uploaded_count} of {documents.required_count} required documents uploaded
            {documents.all_uploaded ? " — complete." : "."}
          </p>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Filename</th>
                <th>Status</th>
                <th>Verification</th>
                <th>Uploaded At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.documents.map((d) => (
                <tr key={d.id} style={d.status !== "ACTIVE" ? { opacity: 0.55 } : undefined}>
                  <td>{d.label}</td>
                  <td>{d.original_filename}</td>
                  <td>
                    <span className={`badge ${d.status === "ACTIVE" ? "badge-green" : "badge-gray"}`}>{d.status}</span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        d.verification_status === "VERIFIED"
                          ? "badge-green"
                          : d.verification_status === "REJECTED"
                          ? "badge-red"
                          : "badge-amber"
                      }`}
                    >
                      {d.verification_status}
                    </span>
                  </td>
                  <td>{dateTimeFmt(d.uploaded_at)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => downloadDocument(d.id, d.original_filename)}>
                        Download
                      </button>
                      {d.status === "ACTIVE" && d.verification_status !== "VERIFIED" && (
                        <button className="btn btn-secondary btn-sm" onClick={() => verifyDocument(d.id, "VERIFIED")}>
                          Verify
                        </button>
                      )}
                      {d.status === "ACTIVE" && d.verification_status !== "REJECTED" && (
                        <button className="btn btn-danger btn-sm" onClick={() => verifyDocument(d.id, "REJECTED")}>
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {documents.documents.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)" }}>
                    No documents uploaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "emails" && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Sent At</th>
                <th>Initiated By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {emails.map((e) => (
                <tr key={e.id}>
                  <td>{e.recipient}</td>
                  <td>{e.subject}</td>
                  <td>
                    <span className={`badge ${e.status === "SENT" ? "badge-green" : e.status === "FAILED" ? "badge-red" : "badge-gray"}`}>{e.status}</span>
                  </td>
                  <td>{dateTimeFmt(e.sent_at)}</td>
                  <td>{e.initiated_by}</td>
                  <td>
                    {e.status === "FAILED" && (
                      <button className="btn btn-secondary btn-sm" onClick={() => retryEmail(e.id)}>
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {emails.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)" }}>
                    No emails sent yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Timestamp</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i}>
                  <td>{a.action}</td>
                  <td>{a.actor_label} ({a.actor_type})</td>
                  <td>{dateTimeFmt(a.timestamp)}</td>
                  <td style={{ fontSize: 11, color: "var(--muted)" }}>{JSON.stringify(a.new_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
