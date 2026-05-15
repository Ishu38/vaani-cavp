import React from "react";
import { Link } from "react-router-dom";

/**
 * Surfaced when the gateway returns 402 (quota_exceeded or feature_blocked).
 * The error body comes back on `ApiError.details` and includes:
 *   - code: "quota_exceeded" | "feature_blocked"
 *   - feature: "mock_analyze" | "pdf_report"
 *   - used / limit / resetsAt (only on quota_exceeded)
 *   - message (server-authored, can be shown verbatim)
 *   - upgradeUrl ("/pricing")
 *
 * Two visual states map to the two error codes — quota wall vs. paid-feature
 * block — but both push the same /pricing CTA.
 */
export default function UpgradeModal({ details, onClose }) {
  if (!details) return null;
  const isQuota = details.code === "quota_exceeded";
  const isFeature = details.code === "feature_blocked";
  const title = isQuota
    ? "You've reached this month's free limit"
    : isFeature
    ? "Upgrade to download PDF reports"
    : "Upgrade required";
  const resetsAt = details.resetsAt ? new Date(details.resetsAt) : null;
  const resetLabel = resetsAt
    ? resetsAt.toLocaleDateString(undefined, { day: "numeric", month: "long" })
    : null;

  return (
    <div
      className="tp-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      onClick={onClose}
    >
      <div className="tp-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="upgrade-modal-title" className="tp-modal-title">{title}</h2>

        {isQuota && (
          <p className="tp-modal-body">
            You've used all <strong>{details.limit}</strong> free mocks this month.
            {resetLabel ? ` Your free mocks reset on ${resetLabel}.` : ""}
          </p>
        )}

        {isFeature && (
          <p className="tp-modal-body">
            Downloadable PDF reports are part of paid plans. Your band score and
            full acoustic breakdown are still free — only the PDF download is gated.
          </p>
        )}

        <ul className="tp-modal-list">
          <li><strong>Test Cycle Pass</strong> — ₹499 for 8 weeks unlimited</li>
          <li><strong>Pro</strong> — ₹199/month, cancel anytime</li>
          <li>Both unlock PDF reports, Clarity Coach answers, and unlimited mocks</li>
        </ul>

        <div className="tp-modal-actions">
          <Link
            to={details.upgradeUrl || "/pricing"}
            className="tp-btn tp-btn--primary"
            onClick={onClose}
          >
            See plans
          </Link>
          <button type="button" className="tp-btn tp-btn--ghost" onClick={onClose}>
            Not now
          </button>
        </div>

        <p className="tp-modal-foot">
          Manual UPI invoice + 7-day no-questions refund. Razorpay self-serve checkout
          coming once KYC clears.
        </p>
      </div>
    </div>
  );
}
