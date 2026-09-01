import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, dateFmt, errorMessage, money } from "../../api/client";
import QuoteShell from "../../components/wizard/QuoteShell";

export default function QuoteAccept() {
  const { id } = useParams();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/api/quotes/${id}`)
      .then((res) => setQuote(res.data))
      .catch((err) => setError(errorMessage(err, "Could not load your quotation.")));
  }, [id]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!quote) return <div className="card">Loading…</div>;

  if (quote.status !== "ACCEPTED") {
    return (
      <div className="card">
        <p>This quotation has not been accepted yet.</p>
        <Link className="btn btn-primary" to={`/quote/${id}`}>
          Back to Quotation
        </Link>
      </div>
    );
  }

  return (
    <QuoteShell currentIndex={3} heading="Confirm and Accept Your Quotation" subtitle="Your quotation has been accepted.">
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
          Quotation accepted and documents submitted successfully. Our team will review your documents and advise you
          on the next step.
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
            <div className="hint">Total Premium</div>
            <div className="quote-summary-value">{money(quote.total_premium)}</div>
          </div>
          <div className="quote-summary-item">
            <div className="hint">Accepted On</div>
            <div className="quote-summary-value">{dateFmt(quote.accepted_at)}</div>
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" to={`/documents/${id}`} style={{ padding: "13px 28px" }}>
            View My Documents →
          </Link>
        </div>
      </div>
    </QuoteShell>
  );
}
