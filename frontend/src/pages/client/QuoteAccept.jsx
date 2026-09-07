import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, dateFmt, dateTimeFmt, errorMessage, money } from "../../api/client";
import QuoteShell, { WHATSAPP_URL } from "../../components/wizard/QuoteShell";

export default function QuoteAccept() {
  const { id } = useParams();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [docStatus, setDocStatus] = useState(null);
  const [emailBox, setEmailBox] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/api/quotes/${id}`)
      .then((res) => {
        setQuote(res.data);
        return api.get(`/api/quotes/${id}/documents/status`);
      })
      .then((res) => setDocStatus(res.data))
      .catch((err) => setError(errorMessage(err, "Could not load your quotation.")));
  }, [id]);

  async function handleEmail() {
    setBusy(true);
    setEmailStatus("");
    try {
      const res = await api.post(`/api/documents/${id}/email`, {
        to_email: emailTo || null,
        include_quotation: true,
        include_risk_note: false,
      });
      setEmailStatus(res.data.status === "SENT" ? "Sent!" : `Failed: ${res.data.error}`);
    } catch (err) {
      setEmailStatus(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!quote) return <div className="card">Loading…</div>;

  if (quote.status !== "ACCEPTED") {
    return (
      <div className="card">
        <p>This quotation has not been accepted yet.</p>
        <Link className="btn btn-primary" to="/quote">
          Back to Vehicle &amp; Cover
        </Link>
      </div>
    );
  }

  return (
    <QuoteShell currentIndex={3} heading="Quotation Accepted" subtitle="Your quotation has been accepted and submitted for review.">
      <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#e5f6ec",
            color: "var(--ok)",
            fontSize: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          ✓
        </div>
        <p className="hint" style={{ maxWidth: "48ch", margin: "0 auto" }}>
          Quotation accepted and documents submitted successfully. Underwriting review and policy issuance are still
          required before cover becomes active — our team will contact you with the next step.
        </p>

        <div className="quote-summary-grid" style={{ textAlign: "left", marginTop: 24 }}>
          <div className="quote-summary-item">
            <div className="hint">Quotation Number</div>
            <div className="quote-summary-value">{quote.quotation_number}</div>
          </div>
          <div className="quote-summary-item">
            <div className="hint">Insurer</div>
            <div className="quote-summary-value">{quote.insurer_name}</div>
          </div>
          <div className="quote-summary-item">
            <div className="hint">Vehicle</div>
            <div className="quote-summary-value">{quote.vehicle_registration}</div>
          </div>
          <div className="quote-summary-item">
            <div className="hint">Cover Type</div>
            <div className="quote-summary-value">{quote.cover_type === "comprehensive" ? "Comprehensive" : "Third Party Only"}</div>
          </div>
          <div className="quote-summary-item">
            <div className="hint">Total Premium</div>
            <div className="quote-summary-value">{money(quote.total_premium)}</div>
          </div>
          <div className="quote-summary-item">
            <div className="hint">Accepted On</div>
            <div className="quote-summary-value">{dateTimeFmt(quote.accepted_at)}</div>
          </div>
          <div className="quote-summary-item">
            <div className="hint">Document Status</div>
            <div className="quote-summary-value">
              {docStatus ? `${docStatus.uploaded_count} of ${docStatus.required_count} uploaded` : "—"}
            </div>
          </div>
          <div className="quote-summary-item">
            <div className="hint">Valid Until</div>
            <div className="quote-summary-value">{dateFmt(quote.expires_at)}</div>
          </div>
        </div>

        <div className="alert alert-info" style={{ textAlign: "left", marginTop: 24 }}>
          <strong>Next step:</strong> Our underwriting team will review your documents and confirm cover. This
          confirmation is not itself a policy — you'll be notified once underwriting and issuance are complete.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 24 }}>
          <a className="btn btn-secondary" href={`/api/quotes/${id}/pdf`} target="_blank" rel="noreferrer">
            ⬇ Download Quotation
          </a>
          <button className="btn btn-secondary" onClick={() => setEmailBox((v) => !v)}>
            ✉ Email Quotation
          </button>
          <a
            className="btn btn-secondary"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp Assistance
          </a>
        </div>

        {emailBox && (
          <div className="alert alert-info" style={{ marginTop: 16, textAlign: "left" }}>
            <label className="first">Send to</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="client@email.com" />
              <button className="btn btn-primary" disabled={busy} onClick={handleEmail}>
                Send
              </button>
            </div>
            {emailStatus && <div className="hint" style={{ marginTop: 6 }}>{emailStatus}</div>}
          </div>
        )}

        <div style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" to={`/documents/${id}`} style={{ padding: "13px 28px" }}>
            View My Documents →
          </Link>
        </div>
      </div>
    </QuoteShell>
  );
}
