import { Navigate } from "react-router-dom";
import {
  Building2,
  CarFront,
  FilePlus2,
  FileText,
  LayoutDashboard,
  Percent,
  ScrollText,
  Settings as SettingsIcon,
  Users as UsersIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AppShell from "./AppShell";

// Items with `roles` are only shown to those roles -- STAFF users get just
// quote generation, not rate/insurer/user management.
const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/quotations/new", label: "New Quotation", icon: FilePlus2 },
  { to: "/admin/quotations", label: "Quotations", icon: FileText, roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/risk-notes", label: "Risk Notes", icon: ScrollText, roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/insurers", label: "Insurers", icon: Building2, roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/motor-classes", label: "Motor Classes", icon: CarFront, roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/rates", label: "Rates", icon: Percent, roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon, roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/admin/users", label: "Users", icon: UsersIcon, roles: ["SUPER_ADMIN", "ADMIN"] },
];

// Where "/admin" (no sub-path) should land: STAFF only has New Quotation,
// so send them straight there instead of the admin-only Dashboard.
export function AdminIndexRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "STAFF" ? "quotations/new" : "dashboard"} replace />;
}

export default function AdminLayout() {
  const { user, ready } = useAuth();

  if (!ready) return null;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role === "AGENT") return <Navigate to="/agent" replace />;
  if (user.must_change_password) return <Navigate to="/account/password" replace />;

  const navItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));
  const home = user.role === "STAFF" ? "/admin/quotations/new" : "/admin/dashboard";

  return (
    <AppShell
      brandTitle="Imoth Admin"
      brandSub="Motor Quotation System"
      navItems={navItems}
      rootCrumb={{ label: "Admin", to: home }}
    />
  );
}
