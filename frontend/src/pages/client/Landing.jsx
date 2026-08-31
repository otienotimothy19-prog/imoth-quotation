import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LandingSteps from "../../components/LandingSteps";
import TrustRow from "../../components/TrustRow";

export default function Landing() {
  const navigate = useNavigate();
  const [lookupId, setLookupId] = useState("");

  return (
    <div>
      <div className="card hero">
        <h1>Motor Insurance Made Simple</h1>
        <p className="hero-sub">
          Compare suitable motor insurance options from trusted Kenyan insurers in minutes.
        </p>
        <button
          className="btn btn-primary"
          style={{ padding: "14px 34px", fontSize: 15.5 }}
          onClick={() => navigate("/quote")}
        >
          Get My Quote
        </button>
        <p className="hero-reassurance">No account required &bull; Secure information &bull; Human assistance available</p>
      </div>

      <div style={{ marginTop: 18 }}>
        <LandingSteps />
      </div>

      <div style={{ marginTop: 18 }}>
        <TrustRow />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 13, marginBottom: 10, color: "var(--imoth-blue)" }}>Already have a quotation?</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Paste your quotation link or reference ID"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            aria-label="Quotation link or reference ID"
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
            View Quotation
          </button>
        </div>
      </div>
    </div>
  );
}
