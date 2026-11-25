import { Navigate, Route, Routes } from "react-router-dom";
import ClientLayout from "./layouts/ClientLayout";
import AdminLayout, { AdminIndexRedirect } from "./layouts/AdminLayout";
import AgentLayout from "./layouts/AgentLayout";

import Landing from "./pages/client/Landing";
import QuoteWizard from "./pages/client/QuoteWizard";
import QuoteDetail from "./pages/client/QuoteDetail";
import CompleteAcceptance from "./pages/client/CompleteAcceptance";
import QuoteOffer from "./pages/client/QuoteOffer";
import QuoteAccept from "./pages/client/QuoteAccept";
import Documents from "./pages/client/Documents";

import AdminLogin from "./pages/admin/Login";
import Dashboard from "./pages/admin/Dashboard";
import Quotations from "./pages/admin/Quotations";
import NewQuotation from "./pages/admin/NewQuotation";
import QuotationDetail from "./pages/admin/QuotationDetail";
import RiskNotes from "./pages/admin/RiskNotes";
import RiskNoteDetail from "./pages/admin/RiskNoteDetail";
import Insurers from "./pages/admin/Insurers";
import MotorClasses from "./pages/admin/MotorClasses";
import Rates from "./pages/admin/Rates";
import Settings from "./pages/admin/Settings";
import Users from "./pages/admin/Users";

import ChangePassword from "./pages/ChangePassword";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AgentLogin from "./pages/agent/AgentLogin";
import AgentSignup from "./pages/agent/AgentSignup";
import MyQuotations from "./pages/agent/MyQuotations";

export default function App() {
  return (
    <Routes>
      <Route element={<ClientLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/quote/offer/:offerId" element={<QuoteOffer />} />
        <Route path="/quote" element={<QuoteWizard />} />
        <Route path="/quote/select/:selectionId" element={<CompleteAcceptance />} />
        <Route path="/quote/:id" element={<QuoteDetail />} />
        <Route path="/quote/:id/accept" element={<QuoteAccept />} />
        <Route path="/documents/:id" element={<Documents />} />
      </Route>

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminIndexRedirect />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="quotations" element={<Quotations />} />
        <Route path="quotations/new" element={<NewQuotation />} />
        <Route path="quotations/:id" element={<QuotationDetail />} />
        <Route path="risk-notes" element={<RiskNotes />} />
        <Route path="risk-notes/:id" element={<RiskNoteDetail />} />
        <Route path="insurers" element={<Insurers />} />
        <Route path="motor-classes" element={<MotorClasses />} />
        <Route path="rates" element={<Rates />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<Users />} />
      </Route>

      <Route path="/account/password" element={<ChangePassword />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/agent/login" element={<AgentLogin />} />
      <Route path="/agent/signup" element={<AgentSignup />} />
      <Route path="/agent" element={<AgentLayout />}>
        <Route index element={<Navigate to="new" replace />} />
        <Route path="new" element={<NewQuotation />} />
        <Route path="quotations" element={<MyQuotations />} />
      </Route>

      <Route path="*" element={<div style={{ padding: 40, textAlign: "center" }}>Page not found.</div>} />
    </Routes>
  );
}
