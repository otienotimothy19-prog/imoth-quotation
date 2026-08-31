const ITEMS = [
  {
    label: "Secure information",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "Transparent comparisons",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M9 3v18M4 3h13a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H4M4 15h13a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H4" />
      </svg>
    ),
  },
  {
    label: "Professional broker support",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </svg>
    ),
  },
  {
    label: "Easy document access",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" />
      </svg>
    ),
  },
];

export default function TrustStrip() {
  return (
    <section className="trust-strip" aria-label="Why clients trust Imoth">
      <div className="trust-strip-inner">
        {ITEMS.map((item) => (
          <div className="trust-chip" key={item.label}>
            <span className="trust-icon">{item.icon}</span>
            <p>{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
