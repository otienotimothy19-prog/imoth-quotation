import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, dateFmt, errorMessage, money } from "../../api/client";
import DocumentUploadSection from "../../components/DocumentUploadSection";
import QuoteShell from "../../components/wizard/QuoteShell";

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailBox, setEmailBox] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [rejectBox, setRejectBox] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [phase, setPhase] = useState("review"); // "review" (step 3) | "confirm" (step 4)
  const [docsAllUploaded, setDocsAllUploaded] = useState(false);
  const [acceptanceConfirmed, setAcceptanceConfirmed] = useState(false);

  async function load() {
    try {
      const res = await api.get(`/api/quotes/${id}`);
      setQuote(res.data);
      setEmailTo(res.data.client_email || "");
      if (res.data.status === "ACCEPTED") {
        navigate(`/quote/${id}/accept`, { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err, "Quotation not found."));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAccept() {
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/quotes/${id}/accept`, { acceptance_confirmed: acceptanceConfirmed });
      navigate(`/quote/${id}/accept`);
    } catch (err) {
      setError(errorMessage(err, "Could not accept this quotation."));
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/quotes/${id}/reject`, { reason: rejectReason || null });
      setRejectBox(false);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not reject this quotation."));
    } finally {
      setBusy(false);
    }
  }

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
  if (!quote) return <div className="card">Loading quotation…</div>;

  const summary = (
    <div className="quote-summary-grid">
      <div className="quote-summary-item">
        <div className="hint">Customer</div>
        <div className="quote-summary-value">{quote.client_name}</div>
      </div>
      <div className="quote-summary-item">
        <div className="hint">Vehicle Registration</div>
        <div className="quote-summary-value">{quote.vehicle_registration}</div>
      </div>
      <div className="quote-summary-item">
        <div className="hint">Vehicle Class</div>
        <div className="quote-summary-value">{quote.vehicle_class_label}</div>
      </div>
      <div className="quote-summary-item">
        <div className="hint">Insurer</div>
        <div className="quote-summary-value">{quote.insurer_name}</div>
      </div>
      <div className="quote-summary-item">
        <div className="hint">Cover Type</div>
        <div className="quote-summary-value">{quote.cover_type === "comprehensive" ? "Comprehensive" : "Third Party Only"}</div>
      </div>
      <div className="quote-summary-item">
        <div className="hint">Total Premium</div>
        <div className="quote-summary-value">{money(quote.total_premium)}</div>
      </div>
    </div>
  );

  const breakdown = (
    <table style={{ marginBottom: 20 }}>
      <thead>
        <tr>
          <th>Item</th>
          <th className="num">Amount (Kshs)</th>
        </tr>
      </thead>
      <tbody>
        {quote.items.map((it, i) => (
          <tr key={i}>
            <td>{it.label}</td>
            <td className="num">{money(it.amount)}</td>
          </tr>
        ))}
        <tr>
          <td>Sub-total</td>
          <td className="num">{money(quote.subtotal)}</td>
        </tr>
        <tr>
          <td>Levies</td>
          <td className="num">{money(quote.levies)}</td>
        </tr>
        <tr>
          <td>Stamp Duty</td>
          <td className="num">{money(quote.stamp_duty)}</td>
        </tr>
        <tr style={{ fontWeight: 800 }}>
          <td>TOTAL PREMIUM</td>
          <td className="num">{money(quote.total_premium)}</td>
        </tr>
      </tbody>
    </table>
  );

  if (phase === "review") {
    return (
      <QuoteShellForQuote quote={quote} currentIndex={2}>
        {error && <div className="alert alert-error">{error}</div>}
        {summary}
        {breakdown}

        <p className="hint" style={{ marginTop: -8, marginBottom: 20 }}>
          Valid until {dateFmt(quote.expires_at)}. Subject to the insurer's standard policy wording and satisfactory
          underwriting review.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          <a className="btn btn-secondary" href={`/api/quotes/${id}/pdf`} target="_blank" rel="noreferrer">
            ⬇ Download PDF
          </a>
          <button className="btn btn-secondary" onClick={() => setEmailBox((v) => !v)}>
            ✉ Email Quotation
          </button>
        </div>

        {emailBox && (
          <div className="alert alert-info" style={{ marginBottom: 24 }}>
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

        <DocumentUploadSection quotationId={id} disabled={busy} onStatusChange={(s) => setDocsAllUploaded(s.all_uploaded)} />

        <div className="quote-footer-nav">
          <button className="btn btn-secondary" onClick={() => navigate("/quote")}>
            ← Back
          </button>
          <button className="btn btn-primary" disabled={!docsAllUploaded} onClick={() => setPhase("confirm")}>
            Save &amp; Continue →
          </button>
        </div>
        {!docsAllUploaded && (
          <p className="hint" style={{ marginTop: 10, textAlign: "right" }}>
            Upload the vehicle logbook, ID copy and KRA PIN certificate to continue.
          </p>
        )}

        {rejectBox && (
          <div style={{ marginTop: 20, borderTop: "1px solid var(--panel)", paddingTop: 16 }}>
            <label className="first">Reason for rejecting (optional)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. found a better rate" />
              <button className="btn btn-danger" disabled={busy} onClick={handleReject}>
                Confirm Reject
              </button>
            </div>
          </div>
        )}
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setRejectBox((v) => !v)}>
            Not interested in this quote?
          </button>
        </div>
      </QuoteShellForQuote>
    );
  }

  // phase === "confirm"
  return (
    <QuoteShellForQuote quote={quote} currentIndex={3} onBackToReview={() => setPhase("review")}>
      {error && <div className="alert alert-error">{error}</div>}
      {summary}
      {breakdown}

      <p className="hint" style={{ marginTop: -8, marginBottom: 20 }}>Required documents: all 3 of 3 uploaded.</p>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={acceptanceConfirmed}
          onChange={(e) => setAcceptanceConfirmed(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          I confirm that the information and documents provided are accurate and that I am authorised to request this
          insurance cover.
        </span>
      </label>

      <div className="quote-footer-nav">
        <button className="btn btn-secondary" onClick={() => setPhase("review")}>
          ← Back
        </button>
        <button className="btn btn-primary" disabled={busy || !acceptanceConfirmed} onClick={handleAccept}>
          {busy ? <span className="spinner" /> : "Accept Quotation"}
        </button>
      </div>
      {!acceptanceConfirmed && (
        <p className="hint" style={{ marginTop: 10, textAlign: "right" }}>
          Please confirm the declaration above to accept your quotation.
        </p>
      )}
    </QuoteShellForQuote>
  );
}

// Small wrapper so both phases share the exact same heading/step wiring
// without duplicating the QuoteShell import and prop plumbing above.
function QuoteShellForQuote({ quote, currentIndex, children, onBackToReview }) {
  const heading = currentIndex === 2 ? "Review Your Quote and Upload Documents" : "Confirm and Accept Your Quotation";
  const subtitle =
    currentIndex === 2
      ? `Quotation ${quote.quotation_number} — check the details below and upload your documents.`
      : "One last check before we submit your acceptance.";
  return (
    <QuoteShell
      currentIndex={currentIndex}
      heading={heading}
      subtitle={subtitle}
      onNavigate={onBackToReview ? (i) => i === 2 && onBackToReview() : undefined}
      canNavigateTo={(i) => i === 2}
    >
      {children}
    </QuoteShell>
  );
}
