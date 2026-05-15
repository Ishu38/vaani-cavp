import React, { useEffect, useRef, useState, useCallback } from "react";
import { signInWithGoogle, login as loginEmail, signup as signupEmail, requestPasswordReset, sendPhoneOtp, verifyPhoneOtp } from "../utils/api.js";

const GSI_SRC = "https://accounts.google.com/gsi/client";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || "";

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

let _gsiLoadingPromise = null;
function loadGsiScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (_gsiLoadingPromise) return _gsiLoadingPromise;
  _gsiLoadingPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => {
      _gsiLoadingPromise = null;
      reject(new Error("Failed to load Google Identity Services"));
    };
    document.head.appendChild(s);
  });
  return _gsiLoadingPromise;
}

export default function SignInModal({ open, reason, onClose, onSuccess }) {
  const btnRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | signing | error
  const [error, setError] = useState(null);
  // Email/password mode: "login" for existing users, "signup" for new ones.
  // Default to "login" because most modal opens come from the header "Sign in"
  // button or a require-sign-in interstitial; new users will usually click
  // Google. Toggle is one click away.
  const [emailMode, setEmailMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  // Phone OTP
  const [phoneMode, setPhoneMode] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState(null);

  const handleGoogleCredential = useCallback(async (credential) => {
    setStatus("signing");
    try {
      const data = await signInWithGoogle(credential);
      setStatus("idle");
      if (onSuccess) onSuccess(data.user);
    } catch (e) {
      setStatus("error");
      if (e?.status === 409) {
        setError("This email already has a Vaani password account. Check your inbox — we've emailed a link to enable Google sign-in for it.");
      } else {
        setError(e.message || "Sign-in failed");
      }
    }
  }, [onSuccess]);

  useEffect(() => {
    // Handle redirect callback (mobile browsers: Google redirects back with
    // credential in URL fragment). Parse it on mount.
    const hash = window.location.hash;
    if (hash && hash.includes("credential=")) {
      try {
        const params = new URLSearchParams(hash.substring(1));
        const cred = params.get("credential");
        if (cred) {
          window.location.hash = ""; // clean URL
          handleGoogleCredential(cred);
          return;
        }
      } catch (_) { /* ignore parse failures */ }
    }
  }, [handleGoogleCredential]);

  useEffect(() => {
    if (!open) return;
    if (!CLIENT_ID) {
      setStatus("pending");
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);

    loadGsiScript()
      .then((google) => {
        if (cancelled) return;

        const onCredential = async (response) => {
          if (response.credential) handleGoogleCredential(response.credential);
        };

        // Mobile: use One Tap prompt (handles redirect natively).
        // Desktop: use popup button (smoother UX without page navigation).
        if (isMobile()) {
          google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: onCredential,
            auto_select: false,
            itp_support: true,
          });
          google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              // Prompt wasn't shown (user dismissed, no sessions, etc.).
              // Fall back to a manual sign-in button.
              if (btnRef.current) {
                btnRef.current.innerHTML = "";
                google.accounts.id.renderButton(btnRef.current, {
                  type: "standard", theme: "outline", size: "large",
                  text: "signin_with", shape: "rectangular",
                  logo_alignment: "left", width: 340,
                });
                // Click triggers prompt again
                btnRef.current.onclick = () => google.accounts.id.prompt();
              }
            }
          });
        } else {
          // Desktop: popup mode
          google.accounts.id.initialize({
            client_id: CLIENT_ID,
            ux_mode: "popup",
            auto_select: false,
            itp_support: true,
            callback: onCredential,
          });
          if (btnRef.current) {
            btnRef.current.innerHTML = "";
            google.accounts.id.renderButton(btnRef.current, {
              type: "standard", theme: "outline", size: "large",
              text: "continue_with", shape: "rectangular",
              logo_alignment: "left", width: 340,
            });
          }
        }
        setStatus("idle");
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("error");
        setError(e.message || "Google Identity Services failed to load");
      });

    return () => {
      cancelled = true;
    };
  }, [open, onSuccess]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setEmailBusy(true);
    setEmailError(null);
    try {
      const data = emailMode === "login"
        ? await loginEmail({ email: email.trim(), password })
        : await signupEmail({ name: name.trim(), email: email.trim(), password });
      if (onSuccess) onSuccess(data.user);
    } catch (err) {
      const msg = err?.message || "Could not complete request";
      // Auth-linking gap: server refuses login when an email already exists
      // under a Google-only account. Surface a useful hint instead of the
      // raw 401.
      if (err?.status === 401) {
        setEmailError(emailMode === "login"
          ? "Email or password incorrect. If you originally signed up with Google, use the Google button above."
          : "Could not create the account.");
      } else if (err?.status === 409) {
        setEmailError("An account with this email already exists. Try signing in instead.");
      } else {
        setEmailError(msg);
      }
    } finally {
      setEmailBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="sim-backdrop" role="dialog" aria-modal="true" aria-label="Sign in to Vaani">
      <div className="sim-card">
        <button type="button" className="sim-close" onClick={onClose} aria-label="Close">×</button>

        <div className="sim-head">
          <div className="sim-brand-mark">V</div>
          <div className="sim-brand-text">
            <div className="sim-brand-name">Sign in to Vaani<span className="tp-tm" aria-label="trademark">™</span></div>
            <div className="sim-brand-sub">To save your progress, download reports, and personalise your coach</div>
          </div>
        </div>

        {reason && <div className="sim-reason">{reason}</div>}

        <div className="sim-providers">
          {CLIENT_ID ? (
            <div ref={btnRef} className="sim-gbtn" />
          ) : (
            <button type="button" className="sim-btn sim-btn--disabled" disabled>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>Continue with Google</span>
              <span className="sim-pill">Coming soon</span>
            </button>
          )}

        </div>

        {status === "signing" && <div className="sim-status">Signing you in…</div>}
        {!CLIENT_ID && status !== "signing" && (
          <div className="sim-notice">
            Google sign-in isn't configured on this build. Please reach out to support so we can enable it for you.
          </div>
        )}
        {error && CLIENT_ID && <div className="sim-error">{error}</div>}

        <div className="sim-divider"><span>or</span></div>

        <form className="sim-email-form" onSubmit={handleEmailSubmit}>
          <div className="sim-email-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={emailMode === "login"}
              className={`sim-email-tab ${emailMode === "login" ? "sim-email-tab--active" : ""}`}
              onClick={() => { setEmailMode("login"); setEmailError(null); }}
            >
              Log in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={emailMode === "signup"}
              className={`sim-email-tab ${emailMode === "signup" ? "sim-email-tab--active" : ""}`}
              onClick={() => { setEmailMode("signup"); setEmailError(null); }}
            >
              Create account
            </button>
          </div>

          {emailMode === "signup" && (
            <label className="sim-field">
              <span>Full name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Neil Shankar Ray"
                autoComplete="name"
                required
              />
            </label>
          )}

          <label className="sim-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="sim-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={emailMode === "signup" ? "At least 8 characters" : "Your password"}
              autoComplete={emailMode === "login" ? "current-password" : "new-password"}
              minLength={emailMode === "signup" ? 8 : undefined}
              required
            />
          </label>

          {emailError && <div className="sim-error">{emailError}</div>}

          <button
            type="submit"
            className="sim-btn sim-btn--email"
            disabled={emailBusy}
          >
            {emailBusy
              ? (emailMode === "login" ? "Logging in…" : "Creating account…")
              : (emailMode === "login" ? "Log in" : "Create account")}
          </button>

          {emailMode === "login" && (
            <div className="sim-forgot-row">
              {resetSent ? (
                <span className="sim-forgot-sent">If an account exists for {email.trim()}, a reset link has been sent.</span>
              ) : (
                <button
                  type="button"
                  className="sim-forgot-link"
                  disabled={resetBusy || !email.trim()}
                  onClick={async () => {
                    if (!email.trim()) return;
                    setResetBusy(true);
                    setEmailError(null);
                    try {
                      await requestPasswordReset(email.trim());
                      setResetSent(true);
                    } catch (err) {
                      setEmailError(err?.message || "Could not request reset");
                    } finally {
                      setResetBusy(false);
                    }
                  }}
                >
                  {resetBusy ? "Sending…" : "Forgot password?"}
                </button>
              )}
            </div>
          )}
        </form>

        <div className="sim-divider"><span>or use phone</span></div>

        {!phoneMode ? (
          <button type="button" className="sim-btn sim-btn--outline" onClick={() => setPhoneMode(true)} style={{ width: "100%", marginBottom: 8 }}>
            📱 Sign in with phone
          </button>
        ) : !otpSent ? (
          <form className="sim-email-form" onSubmit={async (e) => {
            e.preventDefault();
            setPhoneBusy(true); setPhoneError(null);
            try {
              await sendPhoneOtp(phone.replace(/\s/g, ''));
              setOtpSent(true);
            } catch (err) {
              setPhoneError(err?.message || "Could not send OTP");
            } finally { setPhoneBusy(false); }
          }}>
            <input type="tel" className="sim-input" placeholder="10-digit mobile number" value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0,10))} required />
            {phoneError && <div className="sim-error" style={{fontSize:12}}>{phoneError}</div>}
            <button type="submit" className="sim-btn sim-btn--primary" disabled={phoneBusy || phone.length !== 10} style={{width:"100%",marginTop:8}}>
              {phoneBusy ? "Sending OTP…" : "Send OTP"}
            </button>
            <button type="button" className="sim-forgot-link" onClick={() => setPhoneMode(false)} style={{marginTop:4}}>← Back</button>
          </form>
        ) : (
          <form className="sim-email-form" onSubmit={async (e) => {
            e.preventDefault();
            setPhoneBusy(true); setPhoneError(null);
            try {
              const data = await verifyPhoneOtp(phone, otp);
              if (onSuccess) onSuccess(data.user);
            } catch (err) {
              setPhoneError(err?.message || "Invalid OTP");
            } finally { setPhoneBusy(false); }
          }}>
            <p style={{fontSize:13,color:"#666",margin:"0 0 8px"}}>OTP sent to +91 {phone}. Enter the 6-digit code:</p>
            <input type="text" className="sim-input" placeholder="000000" value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0,6))} maxLength={6} required />
            {phoneError && <div className="sim-error" style={{fontSize:12}}>{phoneError}</div>}
            <button type="submit" className="sim-btn sim-btn--primary" disabled={phoneBusy || otp.length !== 6} style={{width:"100%",marginTop:8}}>
              {phoneBusy ? "Verifying…" : "Verify & Sign In"}
            </button>
            <button type="button" className="sim-forgot-link" onClick={() => { setOtpSent(false); setOtp(""); setPhoneError(null); }} style={{marginTop:4}}>← Change number</button>
          </form>
        )}

        <div className="sim-legal">
          By continuing, you agree to Vaani's{" "}
          <a href="#terms" className="tp-link" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("vaani:nav", { detail: { page: "terms" } })); onClose?.(); }}>
            Terms
          </a>{" "}and{" "}
          <a href="#privacy" className="tp-link" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("vaani:nav", { detail: { page: "privacy" } })); onClose?.(); }}>
            Privacy Policy
          </a>. We never share your data.
        </div>

        <div className="sim-trust">
          <span>🔒 Secure</span>
          <span>🛡️ DPDP-aligned</span>
          <span>🚫 No spam</span>
        </div>
      </div>
    </div>
  );
}
