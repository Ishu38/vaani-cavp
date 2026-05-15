import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmGoogleLink } from "../utils/api.js";

export default function LinkGooglePage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const email = params.get("email") || "";
  const [status, setStatus] = useState(token && email ? "linking" : "missing");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status !== "linking") return;
    let alive = true;
    confirmGoogleLink({ email, token })
      .then(() => alive && setStatus("done"))
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || "Could not link Google sign-in.");
        setStatus("error");
      });
    return () => { alive = false; };
  }, [status, email, token]);

  return (
    <main className="tp-section">
      <div className="tp-card">
        {status === "linking" && <h1 className="tp-card-title">Linking Google sign-in…</h1>}
        {status === "done" && (
          <>
            <h1 className="tp-card-title">Google linked</h1>
            <p className="tp-card-sub">
              Google sign-in is now enabled for <b>{email}</b>. <Link to="/" className="tp-link">Go home</Link> and try the Google button again.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="tp-card-title">Could not link</h1>
            <p className="tp-card-sub" style={{ color: "#c1432d" }}>{error}</p>
            <p className="tp-card-sub">
              The link may have expired (1 hour limit). Try Google sign-in again — we'll email a fresh link.
            </p>
          </>
        )}
        {status === "missing" && (
          <>
            <h1 className="tp-card-title">Link incomplete</h1>
            <p className="tp-card-sub">Open the confirmation link from your email.</p>
          </>
        )}
      </div>
    </main>
  );
}
