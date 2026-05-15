import React from "react";
import { Link, useOutletContext } from "react-router-dom";

/**
 * Pricing tiers. Edit this single array when prices, limits, or copy change —
 * everything else (CTAs, layout, the Landing-page summary) is derived from it.
 *
 * `cta` shapes:
 *   - { kind: "internal", to: "/practice/ielts" }      → React Router link
 *   - { kind: "mailto", subject: "..." }               → opens user's mail client
 *   - { kind: "external", href: "https://rzp.io/..." } → Razorpay Payment Link
 *
 * For the Pro tier, swap the mailto for a Razorpay Payment Link as soon as
 * KYC is approved. No code change anywhere else needed.
 */
export const PRICING_TIERS = [
  {
    id: "free",
    tier: "Free",
    price: "₹0",
    unit: "/ forever",
    desc: "Try Vaani without paying. Enough to see if the band you get matches your real prep.",
    features: [
      "3 IELTS or TOEFL mocks per month",
      "Per-criterion bands + acoustic CIF",
      "Live caption preview",
      "Saved history across devices",
    ],
    cta: { kind: "internal", to: "/practice/ielts", label: "Start free" },
    featured: false,
  },
  {
    id: "test-cycle",
    tier: "Test Cycle Pass",
    price: "₹499",
    unit: "one-time · 8 weeks",
    desc: "Got a test date? Pay once, prep flat-out until you sit. No subscription, no auto-charge.",
    features: [
      "Unlimited IELTS / TOEFL mocks for 8 weeks",
      "Downloadable PDF reports",
      "L1-calibrated CIF attractor analysis",
      "Personalised Clarity Coach answers",
      "Priority email support",
    ],
    cta: { kind: "mailto", subject: "Vaani Test Cycle Pass — request access", label: "Get the pass" },
    featured: true,
  },
  {
    id: "pro",
    tier: "Pro",
    price: "₹199",
    unit: "/ month",
    desc: "Open-ended monthly plan. Pause or cancel anytime; great if your test date keeps shifting.",
    features: [
      "Unlimited IELTS / TOEFL mocks",
      "Downloadable PDF reports",
      "L1-calibrated CIF attractor analysis",
      "Personalised Clarity Coach answers",
      "Priority email support",
    ],
    cta: { kind: "mailto", subject: "Vaani Pro — request access", label: "Get Pro" },
    featured: false,
  },
  {
    id: "centre",
    tier: "Coaching Centre",
    price: "Custom",
    unit: "billed annually",
    desc: "For IELTS / TOEFL coaching businesses with cohorts of students.",
    features: [
      "Cohort dashboard + per-student trends",
      "Branded PDF reports for your centre",
      "Bulk uploads of practice recordings",
      "Calibration tuned for your students' L1 mix",
      "Onboarding + monthly review call",
    ],
    cta: { kind: "mailto", subject: "Vaani for our coaching centre — pilot enquiry", label: "Talk to us" },
    featured: false,
  },
];

function CtaButton({ cta, featured }) {
  const cls = `tp-btn ${featured ? "tp-btn--primary" : "tp-btn--secondary"} tp-price-cta`;
  if (cta.kind === "internal") {
    return <Link to={cta.to} className={cls}>{cta.label}</Link>;
  }
  if (cta.kind === "external") {
    return (
      <a href={cta.href} className={cls} target="_blank" rel="noopener noreferrer">
        {cta.label}
      </a>
    );
  }
  // mailto — encode subject so quotes/spaces survive
  const href = `mailto:neilshankarray@vaaani.in?subject=${encodeURIComponent(cta.subject)}`;
  return <a href={href} className={cls}>{cta.label}</a>;
}

export default function PricingPage() {
  const { user } = useOutletContext() || {};
  return (
    <main className="tp-section">
      <div className="tp-card">
        <div className="tp-card-header">
          <div>
            <h1 className="tp-card-title">Pricing</h1>
            <p className="tp-card-sub">
              Vaani is calibrated for Indian L2 English speakers preparing for IELTS and TOEFL Speaking.
              Start free, upgrade when you're closer to your test date. All prices in INR.
              {user ? null : " Sign in to start; no card required for the free tier."}
            </p>
          </div>
        </div>

        <div className="tp-pricing-grid">
          {PRICING_TIERS.map((t) => (
            <div
              key={t.id}
              className={`tp-price-card${t.featured ? " tp-price-card--featured" : ""}`}
            >
              <div className="tp-price-tier">{t.tier}</div>
              <div className="tp-price-amount">
                {t.price}
                <span className="tp-price-unit"> {t.unit}</span>
              </div>
              <div className="tp-price-desc">{t.desc}</div>
              <ul className="tp-price-list">
                {t.features.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
              <CtaButton cta={t.cta} featured={t.featured} />
            </div>
          ))}
        </div>

        <p className="tp-card-sub" style={{ marginTop: 28 }}>
          Honest disclosure: Pro is currently invoiced manually via UPI / bank transfer while we
          finish payment-gateway setup. You'll get an invoice link within 24 hours of writing in.
          Refunds within 7 days, no questions asked.
        </p>
      </div>
    </main>
  );
}
