import { useState } from "react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Items with `roles` are only shown to those roles -- STAFF ("agent") users
// get just quote generation for now, not rate/insurer/user management.
const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard", roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/quotations/new", label: "New Quotation" },
  { to: "/admin/quotations", label: "Quotations", roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/risk-notes", label: "Risk Notes", roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/insurers", label: "Insurers", roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/motor-classes", label: "Motor Classes", roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/rates", label: "Rates", roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/settings", label: "Settings", roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/users", label: "Users", roles: ["SUPER_ADMIN", "ADMIN"] },
];

// Where "/admin" (no sub-path) should land: STAFF only has New Quotation,
// so send them straight there instead of the admin-only Dashboard.
export function AdminIndexRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "STAFF" ? "quotations/new" : "dashboard"} replace />;
}

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

  const navItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));

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
          {navItems.map((item) => (
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
