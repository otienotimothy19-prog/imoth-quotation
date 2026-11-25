import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight, KeyRound, LogOut, Menu, MonitorSmartphone, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Avatar, ConfirmDialog, Dropdown, humanize } from "../components/ui";
import { ToastProvider, useToast } from "../components/ui/toast";

const COLLAPSE_KEY = "imoth_sidebar_collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function isMobile() {
  return typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches;
}

// Breadcrumb trail for the current path: [{ label, to? }]
function crumbsFor(pathname, navItems, root) {
  const exact = navItems.find((n) => n.to === pathname);
  if (exact) return [root, { label: exact.label }];
  const parent = [...navItems].sort((a, b) => b.to.length - a.to.length).find((n) => pathname.startsWith(`${n.to}/`));
  if (parent) return [root, { label: parent.label, to: parent.to }, { label: "Details" }];
  if (pathname.startsWith("/account/password")) return [root, { label: "Change password" }];
  return [root];
}

function Shell({ brandTitle, brandSub, navItems, rootCrumb, sidebarExtra }) {
  const { user, logout, logoutAll, loggingOut } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [navOpen, setNavOpen] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => setNavOpen(false), [location.pathname]);

  function toggleSidebar() {
    if (isMobile()) {
      setNavOpen((v) => !v);
      return;
    }
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* preference only */
      }
      return !v;
    });
  }

  async function signOutEverywhere() {
    setSigningOutAll(true);
    try {
      await logoutAll();
    } catch {
      toast.error("Could not sign out other devices. Please try again.");
      setSigningOutAll(false);
      setConfirmAll(false);
    }
  }

  const crumbs = crumbsFor(location.pathname, navItems, rootCrumb);
  // Only the single best match is highlighted (so "New Quotation" doesn't
  // also light up "Quotations").
  const activeTo = [...navItems]
    .map((n) => n.to)
    .filter((to) => location.pathname === to || location.pathname.startsWith(`${to}/`))
    .sort((a, b) => b.length - a.length)[0];
  const roleLabel = humanize(user.role);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""} ${navOpen ? "nav-open" : ""}`}>
      <aside className="app-sidebar" aria-label="Main navigation">
        <Link to={rootCrumb.to} className="app-brand">
          <img src="/icon-192.png" alt="" />
          <span className="app-brand-text">
            <div className="app-brand-title">{brandTitle}</div>
            <div className="app-brand-sub">{brandSub}</div>
          </span>
        </Link>
        <nav className="app-nav">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`app-nav-link ${to === activeTo ? "active" : ""}`}
              aria-current={to === activeTo ? "page" : undefined}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="app-nav-label">{label}</span>
            </Link>
          ))}
        </nav>
        {sidebarExtra && <div className="app-sidebar-extra app-user-actions" style={{ marginTop: 0 }}>{sidebarExtra}</div>}
        <div className="app-user">
          <div className="app-user-row">
            <Avatar name={user.full_name} size={34} />
            <div className="app-user-text">
              <div className="app-user-name" title={user.full_name}>{user.full_name}</div>
              <div className="app-user-role">{roleLabel}</div>
            </div>
          </div>
          <div className="app-user-actions">
            <Link to="/account/password"><KeyRound size={14} /> Password</Link>
            <button type="button" onClick={logout} disabled={loggingOut}><LogOut size={14} /> Log out</button>
          </div>
        </div>
      </aside>
      {navOpen && <div className="app-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <div className="app-main">
        <header className="app-topbar">
          <button type="button" className="app-icon-btn" onClick={toggleSidebar} aria-label={navOpen ? "Close menu" : "Toggle sidebar"}>
            <span className="desktop-only" style={{ display: "inline-flex" }}><ToggleIcon size={18} /></span>
            <span className="mobile-only"><Menu size={18} /></span>
          </button>
          <nav className="app-crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
                {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span className="current">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className="app-topbar-right">
            <Dropdown
              trigger={({ open, toggle }) => (
                <button type="button" className="menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                  <Avatar name={user.full_name} size={30} />
                  <span className="menu-user-text" style={{ textAlign: "left", lineHeight: 1.2 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{user.full_name}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--c-text-2)" }}>{roleLabel}</span>
                  </span>
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
              )}
            >
              <div className="menu-head">
                <div style={{ fontWeight: 600, fontSize: 13 }}>{user.full_name}</div>
                <div style={{ fontSize: 12, color: "var(--c-text-2)" }}>{user.email}</div>
              </div>
              <Link to="/account/password" className="menu-item" role="menuitem"><KeyRound size={15} /> Change password</Link>
              <button type="button" className="menu-item" role="menuitem" onClick={() => setConfirmAll(true)}><MonitorSmartphone size={15} /> Sign out all devices</button>
              <button type="button" className="menu-item danger" role="menuitem" onClick={logout} disabled={loggingOut}><LogOut size={15} /> Log out</button>
            </Dropdown>
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>

      <ConfirmDialog
        open={confirmAll}
        title="Sign out on all devices?"
        message="This ends your session everywhere, including this browser. You'll need your password and an emailed login code to sign back in."
        confirmLabel="Sign out everywhere"
        danger
        busy={signingOutAll}
        onConfirm={signOutEverywhere}
        onCancel={() => setConfirmAll(false)}
      />
    </div>
  );
}

// The admin/agent application frame: collapsible navy sidebar, white top
// bar with breadcrumb and profile menu, and toast notifications.
export default function AppShell(props) {
  return (
    <ToastProvider>
      <Shell {...props} />
    </ToastProvider>
  );
}
