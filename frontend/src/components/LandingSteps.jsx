const STEPS = ["Your Details", "Vehicle", "Cover", "Compare", "Quotation"];

export default function LandingSteps() {
  return (
    <div className="card steps-teaser" aria-label="How it works">
      <ol className="steps-row" style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {STEPS.map((label, i) => (
          <li key={label} className="step-item">
            <span className="step-circle" aria-hidden="true">
              {i + 1}
            </span>
            <span className="step-label">{label}</span>
          </li>
        ))}
      </ol>
      <p className="steps-caption">
        Answer a few questions, compare eligible options and download your quotation.
      </p>
    </div>
  );
}
