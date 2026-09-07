import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import HowItWorks from "../../components/HowItWorks";
import TrustStrip from "../../components/TrustStrip";
import { api, errorMessage, quoteMoney } from '../../api/client';

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 11 6.5 6.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
      <rect x="2.5" y="11" width="19" height="6.5" rx="2" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </svg>
  );
}

function scrollToRetrieve() {
  document.getElementById("retrieve")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [lookupId, setLookupId] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [retrieving, setRetrieving] = useState(false);
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    if (location.hash === "#retrieve") {
      scrollToRetrieve();
    }
  }, [location.hash]);

  async function handleLookup() {
    const trimmed = lookupId.trim();
    if (!trimmed) {
      setLookupError("Please enter your vehicle number plate to continue.");
      return;
    }
    setLookupError("");
    if (retrieving) return;
    setRetrieving(true); setOffers([]);
    try {
      const { data } = await api.post('/api/quote-offers/retrieve', { registration_no: trimmed });
      setOffers(data.offers);
      if (!data.offers.length) setLookupError('No valid unaccepted quotations found for this number plate. Start a new comparison, or use your secure link to continue an acceptance already started.');
    } catch (err) { setLookupError(errorMessage(err, 'Could not retrieve quotations. Please try again.')); }
    finally { setRetrieving(false); }
  }

  return (
    <div>
      <section className="hero-section">
        <div className="hero-grid">
          <div>
            <span className="hero-badge">Fast &bull; Secure &bull; No account required</span>
            <h1 className="hero-heading">
              Compare Motor Insurance.
              <br />
              Choose with Confidence.
            </h1>
            <p className="hero-sub">
              Get suitable motor insurance options from trusted Kenyan insurers through one simple and secure
              quotation journey.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary" style={{ fontSize: 18, padding: "14px 30px" }} onClick={() => navigate("/quote")}>
                Get My Quote
              </button>
              <button className="btn btn-secondary" style={{ padding: "14px 26px" }} onClick={scrollToRetrieve}>
                Retrieve Existing Quote
              </button>
            </div>
            <ul className="hero-reassurance">
              <li>
                <CheckIcon /> Multiple insurer options
              </li>
              <li>
                <CheckIcon /> Transparent premium breakdown
              </li>
              <li>
                <CheckIcon /> Advisor support available
              </li>
            </ul>
          </div>

          <div className="hero-visual">
            <div className="quote-summary-card">
              <div className="qsc-icon">
                <CarIcon />
              </div>
              <h3>Motor Insurance Quote</h3>
              <div className="qsc-row">
                <span className="qsc-label">Vehicle</span>
                <span className="qsc-value">Add your vehicle</span>
              </div>
              <div className="qsc-row">
                <span className="qsc-label">Cover</span>
                <span className="qsc-value">Choose your cover</span>
              </div>
              <div className="qsc-row">
                <span className="qsc-label">Estimated time</span>
                <span className="qsc-value">A few minutes</span>
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => navigate("/quote")}>
                Start quotation
              </button>
            </div>
          </div>
        </div>
      </section>

      <HowItWorks />

      <section className="retrieve-section" id="retrieve">
        <div className="card retrieve-card">
          <h2>Continue an Existing Quote</h2>
          <p>Enter your vehicle number plate to find your unaccepted quotations.</p>
          <div className="retrieve-form">
            <div className="retrieve-input-wrap">
              <SearchIcon />
              <input
                type="text"
                placeholder="e.g. KAA 123A"
                value={lookupId}
                onChange={(e) => {
                  setLookupId(e.target.value);
                  if (lookupError) setLookupError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                aria-label="Vehicle number plate"
              />
            </div>
            <button className="btn btn-primary" disabled={retrieving} onClick={handleLookup}>
              {retrieving ? 'Finding quotations…' : 'Find My Quote'}
            </button>
          </div>
          {lookupError && <p className="error-text">{lookupError}</p>}
          {offers.map(offer => <div className="card" key={offer.selection_id} style={{ marginTop: 12 }}>
            <strong>{offer.insurer_name}</strong>
            <p>{offer.vehicle_class_label} · {quoteMoney(offer.total_premium)}</p>
            <button className="btn btn-secondary" onClick={() => navigate(`/quote/offer/${offer.selection_id}#token=${encodeURIComponent(offer.access_token)}`)}>View Quotation</button>
          </div>)}
        </div>
      </section>

      <TrustStrip />
    </div>
  );
}
