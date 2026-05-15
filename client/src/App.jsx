import React, { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import PublicLayout from "./layouts/PublicLayout.jsx";
import Landing from "./pages/Landing.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import ContactPage from "./pages/ContactPage.jsx";
import PrivacyPage from "./pages/PrivacyPage.jsx";
import TermsPage from "./pages/TermsPage.jsx";
import MethodologyPage from "./pages/MethodologyPage.jsx";
import PracticePage from "./pages/PracticePage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import PricingPage from "./pages/PricingPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import AttemptDetailPage from "./pages/AttemptDetailPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx";
import LinkGooglePage from "./pages/LinkGooglePage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import "./styles/testprep.css";

const LegacyApp = lazy(() => import("./_legacy/App.jsx"));

function LegacyRoute() {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<div className="tp-loading">Loading legacy console…</div>}>
      <LegacyApp onSwitchPublic={() => navigate("/")} />
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Landing />} />
            <Route path="practice" element={<Navigate to="/practice/ielts" replace />} />
            <Route path="practice/:testType" element={<PracticePage />} />
            <Route path="methodology" element={<MethodologyPage />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="contact" element={<ContactPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="history/:id" element={<AttemptDetailPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route path="verify-email" element={<VerifyEmailPage />} />
            <Route path="link-google" element={<LinkGooglePage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="terms" element={<TermsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="/legacy/*" element={<LegacyRoute />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
