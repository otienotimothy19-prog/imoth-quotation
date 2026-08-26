const STEPS = ["Client", "Vehicle", "Cover", "Compare", "Quotation", "Accept", "Documents"];

export default function StepIndicator({ current }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
      {STEPS.map((label, i) => {
        const step = i + 1;
        const active = step === current;
        const done = step < current;
        return (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              fontWeight: active ? 700 : 500,
              color: active ? "var(--imoth-blue)" : done ? "var(--ok)" : "var(--muted)",
              background: active ? "#e8edfb" : done ? "#e5f6ec" : "var(--panel)",
              border: `1px solid ${active ? "var(--imoth-blue)" : done ? "#a9dcbc" : "var(--line)"}`,
              borderRadius: 20,
              padding: "5px 11px 5px 8px",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: active || done ? (done ? "var(--ok)" : "var(--imoth-blue)") : "#fff",
                color: active || done ? "#fff" : "var(--muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                flex: "none",
              }}
            >
              {done ? "✓" : step}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );
}
