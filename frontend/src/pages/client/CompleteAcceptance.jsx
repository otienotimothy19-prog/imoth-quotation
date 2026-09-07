import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, clearQuoteFlow, dateTimeFmt, errorMessage, fieldErrors, loadQuoteFlow, quoteMoney as money, saveQuoteFlow } from "../../api/client";
import DocumentUploadSection from "../../components/DocumentUploadSection";
import QuoteShell from "../../components/wizard/QuoteShell";

const emptyCustomer = { full_name: "", phone: "", email: "", id_or_passport: "", kra_pin: "" };

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function CompleteAcceptance() {
  const { selectionId } = useParams();
  const navigate = useNavigate();
  const [flow, setFlow] = useState(() => loadQuoteFlow());
  const [customer, setCustomer] = useState(emptyCustomer);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quotation, setQuotation] = useState(null);
  const [loadingQuotation, setLoadingQuotation] = useState(false);
  const [docsAllUploaded, setDocsAllUploaded] = useState(false);
  const [acceptanceConfirmed, setAcceptanceConfirmed] = useState(false);

  const validFlow = flow && flow.selectionId === selectionId;

  useEffect(() => {
    if (validFlow && flow.quotationId) {
      setLoadingQuotation(true);
      api
        .get(`/api/quotes/${flow.quotationId}`)
        .then((res) => setQuotation(res.data))
        .catch((err) => setError(errorMessage(err, "Could not load your quotation.")))
        .finally(() => setLoadingQuotation(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!validFlow) {
    return (
      <div className="card">
        <p>This quotation link is no longer valid or has expired. Please compare quotes again.</p>
        <button className="btn btn-primary" onClick={() => navigate("/quote")}>
          Back to Vehicle &amp; Cover
        </button>
      </div>
    );
  }

  const summary = flow.selectionSummary;

  async function handleSaveDetails() {
    setError("");
    const errs = {};
    if (!customer.full_name.trim() || customer.full_name.trim().length < 2) {
      errs.full_name = "Please enter your full name.";
    }
    if (!customer.phone.trim()) {
      errs.phone = "Please enter your phone number.";
    }
    if (customer.email.trim() && !isValidEmail(customer.email.trim())) {
      errs.email = "Enter a valid email address.";
    }
    if (!customer.id_or_passport.trim()) {
      errs.id_or_passport = "ID or passport number is required.";
    }
    if (!customer.kra_pin.trim()) {
      errs.kra_pin = "KRA PIN is required.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError("Please fix the highlighted fields to continue.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.patch(`/api/quotes/selections/${selectionId}/customer`, {
        full_name: customer.full_name.trim(),
        phone: customer.phone.trim(),
        email: customer.email.trim() || null,
        id_or_passport: customer.id_or_passport.trim(),
        kra_pin: customer.kra_pin.trim(),
      });
      const nextFlow = { ...flow, quotationId: res.data.quotation_id, token: res.data.access_token };
      saveQuoteFlow(nextFlow);
      setFlow(nextFlow);
      setLoadingQuotation(true);
      const q = await api.get(`/api/quotes/${res.data.quotation_id}`);
      setQuotation(q.data);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err, "Could not save your details."));
    } finally {
      setBusy(false);
      setLoadingQuotation(false);
    }
  }

  async function handleCompleteAcceptance() {
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/quotes/${flow.quotationId}/complete-acceptance`, {
        acceptance_confirmed: acceptanceConfirmed,
      });
      const quotationId = flow.quotationId;
      clearQuoteFlow();
      navigate(`/quote/${quotationId}/accept`);
    } catch (err) {
      setError(errorMessage(err, "Could not complete your acceptance."));
    } finally {
      setBusy(false);
    }
  }

  const summaryBlock = (
    <div className="quote-summary-grid" style={{ marginBottom: 20 }}>
      <div className="quote-summary-item">
        <div className="hint">Selected Insurer</div>
        <div className="quote-summary-value">{summary.insurer_name}</div>
      </div>
      <div className="quote-summary-item">
        <div className="hint">Vehicle Class</div>
        <div className="quote-summary-value">{summary.vehicle_class_label}</div>
      </div>
      <div className="quote-summary-item">
        <div className="hint">Cover Type</div>
        <div className="quote-summary-value">{summary.cover_type === "comprehensive" ? "Comprehensive" : "Third Party Only"}</div>
      </div>
      <div className="quote-summary-item">
        <div className="hint">Total Premium</div>
        <div className="quote-summary-value">{money(summary.total_premium)}</div>
      </div>
      <div className="quote-summary-item">
        <div className="hint">Quotation Validity</div>
        <div className="quote-summary-value">{dateTimeFmt(quotation?.expires_at || summary.expires_at)}</div>
      </div>
    </div>
  );

  if (!flow.quotationId) {
    // "About You" -- collected for the first time here, only after a
    // quote has already been selected.
    return (
      <QuoteShell
        currentIndex={2}
        heading="Complete Your Acceptance"
        subtitle="Provide your details and documents to finalise your quotation."
      >
        <div className="wizard-form">
          {error && <div className="alert alert-error">{error}</div>}
          {summaryBlock}

          <section className="wizard-section">
            <h2 className="wizard-section-title">About You</h2>

            <div className="field-group">
              <label className="first">Full Name</label>
              <input
                type="text"
                value={customer.full_name}
                onChange={(e) => setCustomer({ ...customer, full_name: e.target.value })}
                placeholder="e.g. John Mwangi"
                aria-invalid={!!errors.full_name}
              />
              {errors.full_name && <div className="error-text">{errors.full_name}</div>}
            </div>

            <div className="row2">
              <div className="field-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  placeholder="07XX XXX XXX"
                  aria-invalid={!!errors.phone}
                />
                {errors.phone && <div className="error-text">{errors.phone}</div>}
              </div>
              <div className="field-group">
                <div className="field-label-row">
                  <label>Email Address</label>
                  <span className="optional-badge">Optional</span>
                </div>
                <input
                  type="email"
                  value={customer.email}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                />
                {errors.email && <div className="error-text">{errors.email}</div>}
              </div>
            </div>

            <div className="row2">
              <div className="field-group">
                <label>ID / Passport Number</label>
                <input
                  type="text"
                  value={customer.id_or_passport}
                  onChange={(e) => setCustomer({ ...customer, id_or_passport: e.target.value })}
                  aria-invalid={!!errors.id_or_passport}
                />
                {errors.id_or_passport && <div className="error-text">{errors.id_or_passport}</div>}
              </div>
              <div className="field-group">
                <label>KRA PIN</label>
                <input
                  type="text"
                  value={customer.kra_pin}
                  onChange={(e) => setCustomer({ ...customer, kra_pin: e.target.value.toUpperCase() })}
                  placeholder="e.g. A123456789B"
                  aria-invalid={!!errors.kra_pin}
                />
                {errors.kra_pin && <div className="error-text">{errors.kra_pin}</div>}
              </div>
            </div>
          </section>

          <div className="quote-footer-nav">
            <button className="btn btn-secondary" onClick={() => navigate("/quote")}>
              ← Back
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={handleSaveDetails}>
              {busy ? <span className="spinner" /> : "Save & Continue →"}
            </button>
          </div>
        </div>
      </QuoteShell>
    );
  }

  // Quotation created -- now collect the required documents and the final
  // acceptance confirmation.
  return (
    <QuoteShell
      currentIndex={2}
      heading="Complete Your Acceptance"
      subtitle="Upload the required documents and confirm your acceptance."
    >
      <div className="wizard-form">
        {error && <div className="alert alert-error">{error}</div>}
        {summaryBlock}

        {loadingQuotation || !quotation ? (
          <div className="card">Loading your quotation…</div>
        ) : (
          <>
            <DocumentUploadSection
              quotationId={flow.quotationId}
              disabled={busy}
              onStatusChange={(s) => setDocsAllUploaded(s.all_uploaded)}
            />

            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, margin: "20px 0 14px" }}>
              <input
                type="checkbox"
                checked={acceptanceConfirmed}
                onChange={(e) => setAcceptanceConfirmed(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>I confirm that the information provided is correct and that I accept this quotation.</span>
            </label>

            <div className="quote-footer-nav quote-footer-nav-end">
              <button
                className="btn btn-primary"
                disabled={busy || !docsAllUploaded || !acceptanceConfirmed}
                onClick={handleCompleteAcceptance}
              >
                {busy ? <span className="spinner" /> : "Complete Acceptance"}
              </button>
            </div>
            {!docsAllUploaded && (
              <p className="hint" style={{ marginTop: 10, textAlign: "right" }}>
                Upload the vehicle logbook, ID copy and KRA PIN certificate to continue.
              </p>
            )}
            {docsAllUploaded && !acceptanceConfirmed && (
              <p className="hint" style={{ marginTop: 10, textAlign: "right" }}>
                Please confirm the declaration above to complete your acceptance.
              </p>
            )}
          </>
        )}
      </div>
    </QuoteShell>
  );
}
