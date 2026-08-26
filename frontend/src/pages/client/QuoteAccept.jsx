import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, dateFmt, errorMessage, money } from "../../api/client";
import StepIndicator from "../../components/StepIndicator";

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
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <StepIndicator current={7} />
      </div>
      <div className="card" style={{ textAlign: "center", padding: "36px 24px" }}>
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
        <h2 style={{ fontSize: 20, color: "var(--imoth-blue)" }}>Quotation Accepted</h2>
        <p className="hint" style={{ marginTop: 6 }}>
          Cover confirmed with {quote.insurer_name} for {quote.vehicle_registration}.
        </p>

        <div className="row2" style={{ textAlign: "left", marginTop: 24 }}>
          <div>
            <div className="hint">Quotation Number</div>
            <div style={{ fontWeight: 700 }}>{quote.quotation_number}</div>
          </div>
          <div>
            <div className="hint">Total Premium</div>
            <div style={{ fontWeight: 700 }}>{money(quote.total_premium)}</div>
          </div>
          <div>
            <div className="hint">Accepted On</div>
            <div style={{ fontWeight: 700 }}>{dateFmt(quote.accepted_at)}</div>
          </div>
          <div>
            <div className="hint">Status</div>
            <div style={{ fontWeight: 700 }}>Risk Note Issued</div>
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" to={`/documents/${id}`} style={{ padding: "13px 28px" }}>
            View My Documents →
          </Link>
        </div>
      </div>
    </div>
  );
}
