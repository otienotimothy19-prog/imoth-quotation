import { useState } from "react";
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

function LogoutButton({ style }) {
  const { logout, loggingOut } = useAuth();
  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ width: "100%", color: "#fff", borderColor: "rgba(255,255,255,0.4)", ...style }}
      onClick={logout}
      disabled={loggingOut}
      aria-busy={loggingOut}
    >
      {loggingOut ? <span className="spinner" /> : "Log out"}
    </button>
  );
}

export default function AdminLayout() {
  const { user, ready } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  if (!ready) return null;
  if (!user) return <Navigate to="/admin/login" replace />;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px" }}>
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
              flex: "none",
            }}
          >
            IM
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Imoth Admin</div>
            <div style={{ fontSize: 10.5, opacity: 0.75 }}>Motor Quotation System</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm admin-sidebar-toggle"
            style={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}
            aria-expanded={navOpen}
            aria-controls="admin-nav"
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? "Close" : "Menu"}
          </button>
        </div>

        <nav
          id="admin-nav"
          className={`admin-sidebar-nav ${navOpen ? "open" : ""}`}
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setNavOpen(false)}
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
          <div className="admin-sidebar-footer-mobile" style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 700 }}>{user.full_name}</div>
            <div style={{ opacity: 0.75, marginBottom: 10 }}>{user.role.replace("_", " ")}</div>
            <LogoutButton />
          </div>
        </nav>

        <div className="admin-sidebar-footer" style={{ borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 12, marginTop: 20, fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>{user.full_name}</div>
          <div style={{ opacity: 0.75, marginBottom: 10 }}>{user.role.replace("_", " ")}</div>
          <LogoutButton />
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
