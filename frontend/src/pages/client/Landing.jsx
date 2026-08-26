import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();
  const [lookupId, setLookupId] = useState("");

  return (
    <div>
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 26, color: "var(--imoth-blue)", marginBottom: 8 }}>
          Get your motor insurance quotation in minutes
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14.5, maxWidth: 520, margin: "0 auto 24px" }}>
          Tell us about your vehicle, compare quotes from Kenya's leading insurers, and download your
          quotation and Risk Note instantly — all in one simple, secure flow.
        </p>
        <button className="btn btn-primary" style={{ padding: "14px 32px", fontSize: 15 }} onClick={() => navigate("/quote")}>
          Start a Quote →
        </button>
      </div>

      <div className="row2" style={{ marginTop: 18 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>1–2 Client &amp; Vehicle</h3>
          <p className="hint" style={{ margin: 0 }}>Quick details about you and your vehicle — no account needed.</p>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>3–4 Cover &amp; Compare</h3>
          <p className="hint" style={{ margin: 0 }}>We calculate premiums across eligible insurers and show you a clear comparison.</p>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>5–6 Quotation &amp; Accept</h3>
          <p className="hint" style={{ margin: 0 }}>Review your quotation, then accept or reject it — your choice, no pressure.</p>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>7 Documents</h3>
          <p className="hint" style={{ margin: 0 }}>Download or email your Quotation and Risk Note at any time.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ fontSize: 13, marginBottom: 10 }}>Already have a quotation?</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Paste your quotation link or reference ID"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
          />
          <button
            className="btn btn-secondary"
            style={{ flex: "none" }}
            onClick={() => {
              const trimmed = lookupId.trim();
              if (!trimmed) return;
              const idMatch = trimmed.match(/[0-9a-fA-F-]{20,}/);
              navigate(`/quote/${idMatch ? idMatch[0] : trimmed}`);
            }}
          >
            View
          </button>
        </div>
      </div>
    </div>
  );
}
