import { Link, Outlet } from "react-router-dom";

export default function ClientLayout() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 60px" }}>
      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 20,
          borderTop: "5px solid var(--imoth-red)",
        }}
      >
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none" }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 8,
              background: "var(--imoth-blue)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              flex: "none",
            }}
          >
            IM
          </div>
          <div>
            <h1 style={{ fontSize: 18, color: "var(--imoth-blue)" }}>Imoth Insurance Brokers</h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>
              Insurance | Health | Pension — Motor Quotation Portal
            </p>
          </div>
        </Link>
      </div>
      <Outlet />
      <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--muted)", marginTop: 30 }}>
        &copy; {new Date().getFullYear()} Imoth Insurance Brokers Limited. All rights reserved.
      </div>
    </div>
  );
}
