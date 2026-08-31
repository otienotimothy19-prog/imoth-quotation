const ITEMS = [
  {
    label: "Multiple insurer options",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: "Secure handling of customer information",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "Transparent premium breakdown",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M9 3v18M4 3h13a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H4M4 15h13a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3H4" />
      </svg>
    ),
  },
  {
    label: "Support from an insurance advisor",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </svg>
    ),
  },
];

export default function TrustRow() {
  return (
    <div className="card">
      <div className="trust-row">
        {ITEMS.map((item) => (
          <div className="trust-item" key={item.label}>
            <span className="trust-icon">{item.icon}</span>
            <p>{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
