import React, { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import ClarityCoach from "../components/ClarityCoach.jsx";
import SignInModal from "../components/SignInModal.jsx";
import ConsentGate, { hasGivenConsent, clearConsent } from "../components/ConsentGate.jsx";
import { isAuthenticated, getUser, clearAuth, refreshUser, getIeltsConsentStatus, resendVerificationEmail } from "../utils/api.js";

const PAGE_TITLES = {
  "/": "Vaani — IELTS & TOEFL Speaking Diagnostic",
  "/methodology": "How Vaani Scores — Methodology",
  "/about": "About — Vaani",
  "/contact": "Contact — Vaani",
  "/privacy": "Privacy Policy — Vaani",
  "/practice/ielts": "IELTS Speaking Mock — Vaani",
  "/practice/toefl": "TOEFL Speaking Task — Vaani",
};

function Header({ user, onSignIn, onSignOut }) {
  const initials = user?.name
    ? user.name.split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase()
    : "";
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  return (
    <header className="tp-header">
      <Link to="/" className="tp-brand tp-brand--btn" onClick={close}>
        <div className="tp-brand-mark">V</div>
        <div>
          <div className="tp-brand-name">
            Vaani<span className="tp-tm" aria-label="trademark">™</span>
            <span className="tp-brand-bengali" lang="bn" aria-label="Vaani in Bengali">  বাণী</span>
          </div>
          <div className="tp-brand-tag">Speak. Score. Improve.</div>
        </div>
      </Link>
      <button
        type="button"
        className="tp-nav-toggle"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span className={`tp-nav-toggle-bar ${menuOpen ? "tp-nav-toggle-bar--x" : ""}`} aria-hidden="true" />
      </button>
      <nav className={`tp-nav ${menuOpen ? "tp-nav--open" : ""}`}>
        <Link to="/#how" className="tp-nav-link" onClick={close}>How it works</Link>
        <Link to="/#bands" className="tp-nav-link" onClick={close}>Scoring</Link>
        <NavLink to="/methodology" className={({ isActive }) => `tp-nav-link ${isActive ? "tp-nav-link--active" : ""}`} onClick={close}>Methodology</NavLink>
        <NavLink to="/pricing" className={({ isActive }) => `tp-nav-link ${isActive ? "tp-nav-link--active" : ""}`} onClick={close}>Pricing</NavLink>
        <NavLink to="/about" className={({ isActive }) => `tp-nav-link ${isActive ? "tp-nav-link--active" : ""}`} onClick={close}>About</NavLink>
        <NavLink to="/contact" className={({ isActive }) => `tp-nav-link ${isActive ? "tp-nav-link--active" : ""}`} onClick={close}>Contact</NavLink>
        {user ? (
          <div className="tp-user">
            <NavLink to="/history" className={({ isActive }) => `tp-nav-link ${isActive ? "tp-nav-link--active" : ""}`} onClick={close}>History</NavLink>
            <Link to="/account" className="tp-user-avatar tp-user-avatar--link" title={`${user.name || ""} (${user.email}) — open account`} onClick={close}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" />
              ) : (
                <span>{initials || "U"}</span>
              )}
            </Link>
            <div className="tp-user-meta">
              <Link to="/account" className="tp-user-name" onClick={close}>{user.name || "Signed in"}</Link>
              <button type="button" className="tp-user-signout" onClick={() => { onSignOut(); close(); }}>Sign out</button>
            </div>
          </div>
        ) : (
          <button type="button" className="tp-btn tp-btn--secondary tp-btn--sm" onClick={() => { onSignIn(); close(); }}>
            Sign in
          </button>
        )}
      </nav>
    </header>
  );
}

function VerifyEmailBanner({ user }) {
  const [status, setStatus] = useState("idle");
  if (!user || user.emailVerified) return null;
  // Google-signed users always have emailVerified=true via the OAuth payload.
  // This banner is meant for password-signup flows; if for any reason the
  // server returns emailVerified=false on a Google account, it'll still
  // render — that's a non-issue, the resend just no-ops.
  const onResend = async () => {
    setStatus("sending");
    try {
      await resendVerificationEmail();
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };
  return (
    <div className="tp-verify-banner">
      <div>
        <strong>Verify your email.</strong> We sent a link to <code>{user.email}</code>.
        Verifying secures your account and unlocks PDF report downloads.
      </div>
      {status === "sent" ? (
        <span className="tp-verify-banner-sent">Sent. Check your inbox.</span>
      ) : (
        <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm" onClick={onResend} disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Resend link"}
        </button>
      )}
    </div>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="tp-footer-pro">
      <div className="tp-footer-main">
        <div className="tp-footer-brand">
          <div className="tp-brand">
            <div className="tp-brand-mark">V</div>
            <div>
              <div className="tp-brand-name">Vaani<span className="tp-tm" aria-label="trademark">™</span></div>
              <div className="tp-brand-tag">Speak. Score. Improve.</div>
            </div>
          </div>
          <p className="tp-footer-blurb">
            Praat-based acoustic voice profiling — formants, two-pass pitch, voice
            quality, and a Contrastive Interference Function calibrated against the
            published acoustic-phonetic literature for 6 Indian L1s
            preparing for IELTS or TOEFL Speaking.
          </p>
        </div>

        <div className="tp-footer-col">
          <div className="tp-footer-col-title">Product</div>
          <Link to="/#how" className="tp-footer-link">How it works</Link>
          <Link to="/#bands" className="tp-footer-link">Scoring bands</Link>
          <Link to="/methodology" className="tp-footer-link">Methodology</Link>
          <Link to="/pricing" className="tp-footer-link">Pricing</Link>
        </div>

        <div className="tp-footer-col">
          <div className="tp-footer-col-title">Company</div>
          <Link to="/about" className="tp-footer-link">About Us</Link>
          <Link to="/contact" className="tp-footer-link">Contact Us</Link>
        </div>

        <div className="tp-footer-col">
          <div className="tp-footer-col-title">Legal</div>
          <Link to="/privacy" className="tp-footer-link">Privacy Policy</Link>
          <a href="mailto:neilshankarray@vaaani.in" className="tp-footer-link">Terms of Use</a>
        </div>
      </div>

      <div className="tp-footer-bar">
        <div>© {year} Vaani. All rights reserved.</div>
        <div className="tp-footer-credit">
          Designed and Developed by <b>Neil Shankar Ray</b>, IIT Patna.
        </div>
        <div>Automated estimate — not an official IELTS or TOEFL score.</div>
      </div>
      <div className="tp-footer-corpus">
        Calibration data: <b>published literature + AI4Bharat Svarah</b>{" "}
        — <a href="https://ai4bharat.iitm.ac.in/" target="_blank" rel="noopener noreferrer">AI4Bharat</a>,
        IIT Madras. Open-access, peer-reviewed Indian-accented English speech dataset
        (~9.6 hr, 117 speakers, 65 districts). Used with attribution under the corpus's
        research licence.
      </div>
    </footer>
  );
}

export default function PublicLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [user, setUser] = useState(() => (isAuthenticated() ? getUser() : null));

  // On boot, if we have a session cookie, refresh the user from the server
  // so the SPA picks up profile fields (age / IELTS centre / registration
  // number) saved during a previous report. Cached localStorage user from
  // first sign-in only has name+email — newer fields land via this fetch.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    refreshUser().then((fresh) => {
      if (alive && fresh) setUser(fresh);
    });
    // Reconcile consent: if localStorage says we consented but the server has
    // no record (e.g. a previous SPA build wrote local-only), wipe local so
    // the gate reopens on the next /practice/ visit and the new accept flow
    // can write to both sides. Failure to reach the status endpoint is
    // non-fatal — leave local state alone so a transient network blip doesn't
    // strand the user behind the consent gate.
    if (hasGivenConsent()) {
      getIeltsConsentStatus()
        .then((s) => {
          if (alive && s && s.hasConsent === false) {
            clearConsent();
            setConsentGiven(false);
          }
        })
        .catch(() => {});
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInReason, setSignInReason] = useState(null);

  const [consentGiven, setConsentGiven] = useState(() => hasGivenConsent());
  const needsConsent = location.pathname.startsWith("/practice/") && !consentGiven;

  useEffect(() => {
    document.title = PAGE_TITLES[location.pathname] || PAGE_TITLES["/"];
  }, [location.pathname]);

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 80);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const handler = (e) => {
      const target = e.detail?.page;
      if (!target) return;
      const map = { home: "/", about: "/about", contact: "/contact", privacy: "/privacy", methodology: "/methodology" };
      const path = map[target];
      if (path) navigate(path);
    };
    window.addEventListener("vaani:nav", handler);
    return () => window.removeEventListener("vaani:nav", handler);
  }, [navigate]);

  const requireSignIn = (reason) => {
    setSignInReason(reason || null);
    setSignInOpen(true);
  };
  const handleSignInSuccess = (u) => {
    setUser(u);
    setSignInOpen(false);
    setSignInReason(null);
    // First-sign-in onboarding: if the candidate hasn't filled the basics that
    // shape scoring (DoB / L1) and reporting (name / phone / address), drop
    // them on /account with a banner before they record. After save the page
    // routes them onward to /practice/ielts. Returning users with the fields
    // already populated land wherever they were heading.
    const needsOnboarding = !u?.dob || !u?.nativeLanguage;
    if (needsOnboarding) {
      navigate("/account?onboarding=1");
    }
  };
  const handleSignOut = () => {
    clearAuth();
    setUser(null);
  };

  const handleConsentAccept = () => setConsentGiven(true);
  const handleConsentCancel = () => navigate("/");

  return (
    <div className="tp-root landing-2026">
      <Header
        user={user}
        onSignIn={() => requireSignIn(null)}
        onSignOut={handleSignOut}
      />

      <VerifyEmailBanner user={user} />
      <Outlet context={{ user, requireSignIn }} />

      <Footer />
      <ClarityCoach />
      <SignInModal
        open={signInOpen}
        reason={signInReason}
        onClose={() => { setSignInOpen(false); setSignInReason(null); }}
        onSuccess={handleSignInSuccess}
      />
      <ConsentGate
        open={needsConsent}
        onAccept={handleConsentAccept}
        onCancel={handleConsentCancel}
      />
    </div>
  );
}
