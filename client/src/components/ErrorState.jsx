import React from "react";

const COPY = {
  mic_denied: {
    title: "Microphone access was blocked",
    body: "Vaani needs microphone permission to record your speaking response. Click the lock icon in your address bar, allow microphone access, then try again.",
    primary: "Try again",
  },
  mic_missing: {
    title: "No microphone detected",
    body: "Plug in or enable a microphone, then refresh the page. On laptops, ensure the lid mic isn't muted at the OS level.",
    primary: "Refresh",
  },
  engine_down: {
    title: "Vaani's scoring engine is unavailable",
    body: "The analysis service didn't respond. This is usually a temporary outage — give it a minute and try again. If it persists, the engine may be redeploying.",
    primary: "Try again",
  },
  engine_failed: {
    title: "Analysis failed mid-flight",
    body: "The engine accepted your audio but couldn't finish scoring it. This often means the recording was clipped, silent, or has heavy background noise. Try a fresh recording in a quieter room.",
    primary: "Re-record",
  },
  timeout: {
    title: "Analysis is taking too long",
    body: "Your scoring run exceeded the 5-minute limit. Try a shorter sample, or wait a moment and resubmit — the engine may be under unusual load.",
    primary: "Try again",
  },
  network: {
    title: "Couldn't reach Vaani",
    body: "Your browser couldn't connect to the service. Check your network and retry.",
    primary: "Retry",
  },
  offline: {
    title: "You're offline",
    body: "Vaani needs an internet connection to score your response. Reconnect and try again.",
    primary: "Retry",
  },
  rate_limited: {
    title: "Too many requests",
    body: "You're scoring faster than our rate limit allows. Wait 30 seconds, then try again.",
    primary: "Try again",
  },
  auth_expired: {
    title: "Session expired",
    body: "Your sign-in session has expired. Sign in again to continue.",
    primary: "Sign in",
  },
  not_found: {
    title: "Not found",
    body: "We couldn't find what you're looking for.",
    primary: "Take me home",
  },
  forbidden: {
    title: "Not allowed",
    body: "Your account doesn't have permission to do this. If this seems wrong, contact neilshankarray@vaaani.in.",
    primary: "Take me home",
  },
  unknown: {
    title: "Something went wrong",
    body: "An unexpected error occurred. Try again, or email neilshankarray@vaaani.in if it keeps happening.",
    primary: "Try again",
  },
};

export default function ErrorState({ code = "unknown", detail, onRetry, onSecondary, secondaryLabel, compact }) {
  const c = COPY[code] || COPY.unknown;
  return (
    <div className={`tp-errstate ${compact ? "tp-errstate--compact" : ""}`} role="alert">
      <div className="tp-errstate-mark" aria-hidden="true">!</div>
      <div className="tp-errstate-body">
        <div className="tp-errstate-title">{c.title}</div>
        <div className="tp-errstate-text">{c.body}</div>
        {detail && <div className="tp-errstate-detail">{detail}</div>}
        <div className="tp-errstate-actions">
          {onRetry && (
            <button type="button" className="tp-btn tp-btn--primary tp-btn--sm" onClick={onRetry}>
              {c.primary}
            </button>
          )}
          {onSecondary && (
            <button type="button" className="tp-btn tp-btn--ghost tp-btn--sm" onClick={onSecondary}>
              {secondaryLabel || "Cancel"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
