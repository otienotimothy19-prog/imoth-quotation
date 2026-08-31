import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/quotations", label: "Quotations" },
  { to: "/admin/risk-notes", label: "Risk Notes" },
  { to: "/admin/insurers", label: "Insurers" },
  { to: "/admin/motor-classes", label: "Motor Classes" },
  { to: "/admin/rates", label: "Rates" },
  { to: "/admin/settings", label: "Settings" },
  { to: "/admin/users", label: "Users" },
];

export default function AdminLayout() {
  const { user, ready, logout } = useAuth();

  if (!ready) return null;
  if (!user) return <Navigate to="/admin/login" replace />;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 230,
          flex: "none",
          background: "var(--imoth-blue)",
          color: "#fff",
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26, padding: "0 6px" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 7,
              background: "var(--imoth-red)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            IM
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Imoth Admin</div>
            <div style={{ fontSize: 10.5, opacity: 0.75 }}>Motor Quotation System</div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                padding: "10px 12px",
                borderRadius: 7,
                color: "#fff",
                textDecoration: "none",
                fontSize: 13.5,
                fontWeight: isActive ? 700 : 500,
                background: isActive ? "rgba(255,255,255,0.16)" : "transparent",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>{user.full_name}</div>
          <div style={{ opacity: 0.75, marginBottom: 10 }}>{user.role.replace("_", " ")}</div>
          <button className="btn btn-ghost btn-sm" style={{ width: "100%", color: "#fff", borderColor: "rgba(255,255,255,0.4)" }} onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: "24px 28px", background: "var(--panel)", overflowX: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
