import React from "react";
import { Link } from "react-router-dom";

/**
 * Lightweight pill rendered above the recorder. Shows free-tier users how many
 * mocks they have left this month so the 402 wall doesn't surprise them. For
 * paid users it confirms their tier silently. Hidden entirely while the quota
 * is still loading (avoids flash-of-wrong-state on first render).
 *
 * Quota shape (from GET /api/testprep/quota):
 *   { plan, monthly: { used, limit, remaining, unlimited, resetsAt }, ... }
 */
export default function QuotaPill({ quota }) {
  if (!quota || !quota.monthly) return null;

  if (quota.monthly.unlimited) {
    const planLabel = ({
      pro: "Pro",
      test_cycle: "Test Cycle Pass",
      centre: "Coaching Centre",
    })[quota.plan] || "Paid";
    return (
      <div className="tp-quota-pill tp-quota-pill--paid" role="status">
        <span className="tp-quota-pill-icon" aria-hidden>✓</span>
        <span><strong>{planLabel}</strong> — unlimited mocks + PDF reports</span>
      </div>
    );
  }

  const { used, limit, remaining } = quota.monthly;
  const isOut = remaining === 0;
  const isLow = remaining > 0 && remaining <= 1;

  return (
    <div
      className={`tp-quota-pill tp-quota-pill--free${
        isOut ? " tp-quota-pill--out" : isLow ? " tp-quota-pill--low" : ""
      }`}
      role="status"
    >
      <span>
        {isOut
          ? `You've used all ${limit} free mocks this month.`
          : `${remaining} of ${limit} free mock${remaining === 1 ? "" : "s"} left this month`}
      </span>
      {(isOut || isLow) && (
        <Link to="/pricing" className="tp-quota-pill-cta">
          Upgrade
        </Link>
      )}
    </div>
  );
}
