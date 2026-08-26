import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, errorMessage } from "../../api/client";
import StepIndicator from "../../components/StepIndicator";

const STATUS_BADGE = {
  GENERATED: "badge-blue",
  SENT: "badge-blue",
  ACCEPTED: "badge-green",
  ACTIVE: "badge-green",
  REJECTED: "badge-red",
  VOID: "badge-gray",
  CANCELLED: "badge-gray",
};

export default function Documents() {
  const { id } = useParams();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState("");

  async function load() {
    try {
      const res = await api.get(`/api/documents/${id}`);
      setDocs(res.data);
      setEmailTo(res.data.client_email || "");
    } catch (err) {
      setError(errorMessage(err, "Could not load documents."));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function sendEmail(kind) {
    setBusy(kind);
    setStatus("");
    try {
      const res = await api.post(`/api/documents/${id}/email`, {
        to_email: emailTo || null,
        include_quotation: kind !== "risk_note",
        include_risk_note: kind !== "quotation",
      });
      setStatus(res.data.status === "SENT" ? `${kind === "both" ? "Both documents" : "Document"} sent!` : `Failed: ${res.data.error}`);
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!docs) return <div className="card">Loading documents…</div>;

  const rows = [docs.quotation, docs.risk_note].filter(Boolean);

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <StepIndicator current={7} />
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16 }}>Your Documents</h2>
        <p className="hint" style={{ marginBottom: 16 }}>
          Download or email your quotation and Risk Note at any time.
        </p>

        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.type}>
                <td>
                  {d.type === "QUOTATION" ? "Quotation" : "Risk Note"} {d.reference_number}
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[d.status] || "badge-gray"}`}>{d.status}</span>
                </td>
                <td>
                  <a className="btn btn-secondary btn-sm" href={d.download_url} target="_blank" rel="noreferrer">
                    Download
                  </a>{" "}
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busy !== null}
                    onClick={() => sendEmail(d.type === "QUOTATION" ? "quotation" : "risk_note")}
                  >
                    Email
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 20 }}>
          <label className="first">Email address</label>
          <div style={{ display: "flex", gap: 8, maxWidth: 420 }}>
            <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="client@email.com" />
          </div>

          {docs.risk_note && (
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-primary" disabled={busy !== null} onClick={() => sendEmail("both")}>
                {busy === "both" ? <span className="spinner" /> : "✉ Email Both Documents"}
              </button>
            </div>
          )}
          {status && <div className="hint" style={{ marginTop: 10 }}>{status}</div>}
        </div>
      </div>
    </div>
  );
}
