const STEPS = [
  {
    n: "01",
    title: "Your Details",
    desc: "Client and vehicle information.",
  },
  {
    n: "02",
    title: "Choose Cover",
    desc: "Cover details, comparison and selection.",
  },
  {
    n: "03",
    title: "Review & Upload",
    desc: "Quotation review and required documents.",
  },
  {
    n: "04",
    title: "Confirm",
    desc: "Declaration and quotation acceptance.",
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
