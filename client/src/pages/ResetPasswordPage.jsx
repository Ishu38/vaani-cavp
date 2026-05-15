import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset } from "../utils/api.js";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const email = params.get("email") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | done | error
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setStatus("submitting");
    try {
      await confirmPasswordReset({ email, token, newPassword: password });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err?.message || "Could not reset password.");
    }
  };

  if (!token || !email) {
    return (
      <main className="tp-section">
        <div className="tp-card">
          <h1 className="tp-card-title">Reset link invalid</h1>
          <p className="tp-card-sub">
            This page needs a valid reset link from your email. Open the link from the email we sent
            you, or <Link to="/" className="tp-link">go home</Link> and request a new one.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="tp-section">
      <div className="tp-card">
        <h1 className="tp-card-title">Choose a new password</h1>
        <p className="tp-card-sub">
          Resetting password for <b>{email}</b>. The link expires 1 hour after it was sent.
        </p>

        {status === "done" ? (
          <div style={{ marginTop: 18 }}>
            <div className="tp-alert" style={{ background: "rgba(72, 187, 120, 0.1)", color: "#2f855a", padding: 12, borderRadius: 8 }}>
              Password reset. You can now <Link to="/" className="tp-link">go to the home page</Link> and sign in with your new password.
            </div>
          </div>
        ) : (
          <form className="tp-form-grid" onSubmit={onSubmit} style={{ marginTop: 18 }}>
            <label className="tp-form-field tp-form-field--wide">
              <span>New password</span>
              <input
                className="tp-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
              />
            </label>
            <label className="tp-form-field tp-form-field--wide">
              <span>Confirm new password</span>
              <input
                className="tp-input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {error && <div className="tp-form-field tp-form-field--wide" style={{ color: "#c1432d" }}>{error}</div>}
            <div className="tp-form-field tp-form-field--wide">
              <button className="tp-btn tp-btn--primary" type="submit" disabled={status === "submitting"}>
                {status === "submitting" ? "Saving…" : "Set new password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
