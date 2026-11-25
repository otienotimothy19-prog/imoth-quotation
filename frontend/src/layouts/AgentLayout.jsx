import { Navigate } from "react-router-dom";
import { FilePlus2, FileText } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import InstallAppButton from "../components/InstallAppButton";
import AppShell from "./AppShell";

const NAV_ITEMS = [
  { to: "/agent/new", label: "New Quotation", icon: FilePlus2 },
  { to: "/agent/quotations", label: "My Quotations", icon: FileText },
];

export default function AgentLayout() {
  const { user, ready } = useAuth();

  if (!ready) return null;
  if (!user) return <Navigate to="/agent/login" replace />;
  if (user.role !== "AGENT") return <Navigate to="/admin" replace />;
  if (user.must_change_password) return <Navigate to="/account/password" replace />;

  return (
    <AppShell
      brandTitle="Imoth Agent"
      brandSub="Motor Quotations"
      navItems={NAV_ITEMS}
      rootCrumb={{ label: "Agent", to: "/agent/new" }}
      sidebarExtra={<InstallAppButton block className="" />}
    />
  );
}
