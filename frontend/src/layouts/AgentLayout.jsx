import { useState } from "react";
import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import InstallAppButton from "../components/InstallAppButton";

const NAV_ITEMS = [
  { to: "/agent/new", label: "New Quotation" },
  { to: "/agent/quotations", label: "My Quotations" },
];

function AgentFooter() {
  const { user, logout, loggingOut } = useAuth();
  function handleLogout() {
    if (window.confirm("Log out of the agent app? You'll need your email and password to log back in.")) logout();
  }
  return (
    <>
      <div style={{ fontWeight: 700 }}>{user.full_name}</div>
      <div style={{ opacity: 0.75, marginBottom: 10 }}>Agent</div>
      <Link to="/account/password" style={{ color: "#fff", display: "block", marginBottom: 8, fontSize: 12 }}>Change password</Link>
      <InstallAppButton
        block
        className="btn btn-sm"
        style={{ background: "#fff", color: "var(--imoth-blue)", marginBottom: 8 }}
      />
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: "100%", color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}
        onClick={handleLogout}
        disabled={loggingOut}
        aria-busy={loggingOut}
      >
        {loggingOut ? <span className="spinner" /> : "Log out"}
      </button>
    </>
  );
}

export default function AgentLayout() {
  const { user, ready } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  if (!ready) return null;
  if (!user) return <Navigate to="/agent/login" replace />;
  if (user.role !== "AGENT") return <Navigate to="/admin" replace />;
  if (user.must_change_password) return <Navigate to="/account/password" replace />;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px" }}>
          <img src="/icon-192.png" alt="" width="36" height="36" style={{ borderRadius: 7, background: "#fff", flex: "none" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Imoth Agent</div>
            <div style={{ fontSize: 10.5, opacity: 0.75 }}>Motor Quotations</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm admin-sidebar-toggle"
            style={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}
            aria-expanded={navOpen}
            aria-controls="agent-nav"
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? "Close" : "Menu"}
          </button>
        </div>

        <nav id="agent-nav" className={`admin-sidebar-nav ${navOpen ? "open" : ""}`}>
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
            <AgentFooter />
          </div>
        </nav>

        <div className="admin-sidebar-footer" style={{ borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 12, marginTop: 20, fontSize: 12 }}>
          <AgentFooter />
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
