import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, dateFmt, errorMessage, money } from "../../api/client";
import StepIndicator from "../../components/StepIndicator";

const STATUS_BADGE = {
  DRAFT: "badge-gray",
  GENERATED: "badge-blue",
  SENT: "badge-blue",
  ACCEPTED: "badge-green",
  REJECTED: "badge-red",
  EXPIRED: "badge-amber",
  CANCELLED: "badge-gray",
};

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

  async function load() {
    try {
      const res = await api.get(`/api/quotes/${id}`);
      setQuote(res.data);
      setEmailTo(res.data.client_email || "");
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
      await api.post(`/api/quotes/${id}/accept`, {});
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

  const canDecide = ["GENERATED", "SENT"].includes(quote.status);

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <StepIndicator current={quote.status === "ACCEPTED" ? 6 : 5} />
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 18, color: "var(--imoth-blue)" }}>Quotation {quote.quotation_number}</h2>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              {quote.client_name} · {quote.vehicle_registration} · {quote.insurer_name}
            </p>
          </div>
          <span className={`badge ${STATUS_BADGE[quote.status] || "badge-gray"}`}>{quote.status}</span>
        </div>

        <table style={{ marginTop: 18 }}>
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

        <div className="row2" style={{ marginTop: 18 }}>
          <div>
            <h3 style={{ fontSize: 12.5 }}>Limits of Cover</h3>
            <ul style={{ fontSize: 12.5, paddingLeft: 18, margin: 0, color: "#333" }}>
              {(quote.limits.length ? quote.limits : ["Per insurer's standard policy wording"]).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 style={{ fontSize: 12.5 }}>Excess &amp; Benefits</h3>
            <ul style={{ fontSize: 12.5, paddingLeft: 18, margin: 0, color: "#333" }}>
              {(quote.excess.concat(quote.benefits).length ? quote.excess.concat(quote.benefits) : ["Per insurer's standard policy wording"]).map(
                (l, i) => (
                  <li key={i}>{l}</li>
                )
              )}
            </ul>
          </div>
        </div>

        <p className="hint" style={{ marginTop: 16 }}>
          Valid until {dateFmt(quote.expires_at)}. Subject to the insurer's standard policy wording and satisfactory
          underwriting review.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <a className="btn btn-secondary" href={`/api/quotes/${id}/pdf`} target="_blank" rel="noreferrer">
            ⬇ Download PDF
          </a>
          <button className="btn btn-secondary" onClick={() => setEmailBox((v) => !v)}>
            ✉ Email Quotation
          </button>
          {quote.status === "ACCEPTED" && (
            <button className="btn btn-secondary" onClick={() => navigate(`/documents/${id}`)}>
              View Documents →
            </button>
          )}
        </div>

        {emailBox && (
          <div className="alert alert-info" style={{ marginTop: 12 }}>
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

        {canDecide && (
          <div style={{ borderTop: "1px solid var(--panel)", marginTop: 20, paddingTop: 18 }}>
            <h3 style={{ fontSize: 13, marginBottom: 10 }}>Ready to proceed?</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" disabled={busy} onClick={handleAccept}>
                {busy ? <span className="spinner" /> : "✓ Accept Quotation"}
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={() => setRejectBox((v) => !v)}>
                ✕ Reject Quotation
              </button>
            </div>
            {rejectBox && (
              <div style={{ marginTop: 12 }}>
                <label className="first">Reason (optional)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. found a better rate" />
                  <button className="btn btn-danger" disabled={busy} onClick={handleReject}>
                    Confirm Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {quote.status === "REJECTED" && (
          <div className="alert alert-error" style={{ marginTop: 16 }}>
            This quotation was rejected. Start a new quote if you'd like to try different cover options.
          </div>
        )}
      </div>
    </div>
  );
}
