import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../utils/api.js";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const email = params.get("email") || "";
  const [status, setStatus] = useState(token && email ? "verifying" : "missing");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status !== "verifying") return;
    let alive = true;
    verifyEmail({ email, token })
      .then(() => alive && setStatus("done"))
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || "Could not verify email.");
        setStatus("error");
      });
    return () => { alive = false; };
  }, [status, email, token]);

  return (
    <main className="tp-section">
      <div className="tp-card">
        {status === "verifying" && (
          <>
            <h1 className="tp-card-title">Verifying your email…</h1>
            <p className="tp-card-sub">One moment.</p>
          </>
        )}
        {status === "done" && (
          <>
            <h1 className="tp-card-title">Email verified</h1>
            <p className="tp-card-sub">
              Thanks — <b>{email}</b> is confirmed. You can <Link to="/practice/ielts" className="tp-link">start an IELTS mock</Link>{" "}
              or <Link to="/account" className="tp-link">finish your profile</Link>.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="tp-card-title">Verification failed</h1>
            <p className="tp-card-sub" style={{ color: "#c1432d" }}>{error}</p>
            <p className="tp-card-sub">
              The link may have expired or already been used. Sign in and request a fresh verification email from your account page.
            </p>
          </>
        )}
        {status === "missing" && (
          <>
            <h1 className="tp-card-title">Verification link incomplete</h1>
            <p className="tp-card-sub">
              Open the link from your email. If you can't find it, <Link to="/account" className="tp-link">request a new one</Link> from your account.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
