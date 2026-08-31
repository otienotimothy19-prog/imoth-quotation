const STEPS = [
  {
    n: "01",
    title: "Tell us about yourself",
    desc: "Provide basic client and contact details.",
  },
  {
    n: "02",
    title: "Add your vehicle",
    desc: "Enter the vehicle and usage information.",
  },
  {
    n: "03",
    title: "Compare suitable options",
    desc: "Review eligible insurer quotations and premium breakdowns.",
  },
  {
    n: "04",
    title: "Receive your quotation",
    desc: "Review, accept and download available documents.",
  },
];

export default function HowItWorks() {
  return (
    <section className="how-it-works" aria-labelledby="how-it-works-heading">
      <div className="section-heading">
        <h2 id="how-it-works-heading">How it works</h2>
        <p>A short, guided journey from your details to a comparable quotation.</p>
      </div>
      <div className="steps-grid">
        {STEPS.map((step) => (
          <div className="step-card" key={step.n}>
            <div className="step-number" aria-hidden="true">
              {step.n}
            </div>
            <h3>{step.title}</h3>
            <p>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
