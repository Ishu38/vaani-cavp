import React from "react";
import { useNavigate } from "react-router-dom";

// TODO:LEGAL_REVIEW — Draft Terms of Service. Reviewed for Indian law
// context (DPDP Act 2023, IT Act 2000, Consumer Protection Act 2019) but
// NOT yet legally vetted. A licensed Indian lawyer must review before any
// paid pilot or B2C launch — particularly the liability cap, refund
// language, and arbitration clause. PrivacyPage.jsx carries the same blocker.

const TERMS_LAST_UPDATED = "2026-05-08";

export default function TermsPage() {
  const navigate = useNavigate();
  const updated = new Date(TERMS_LAST_UPDATED).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <section className="tp-info">
      <button className="tp-btn tp-btn--ghost tp-btn--sm" onClick={() => navigate("/")}>← Back</button>
      <h1 className="tp-info-h1">Terms of Service</h1>
      <p className="tp-info-muted">Last updated: {updated}</p>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Who we are</div>
        <p>
          Vaani™ is a voice-based diagnostic tool for IELTS and TOEFL Speaking preparation, operated by Neil Shankar
          Ray from Kolkata, India. Contact: <a href="mailto:neilshankarray@vaaani.in" className="tp-link">neilshankarray@vaaani.in</a>.
          By creating an account or submitting a recording, you agree to these Terms.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">What Vaani is — and what it is not</div>
        <p>
          Vaani provides an automated acoustic diagnostic of English speaking performance, modelled on the public
          IELTS and TOEFL Speaking band descriptors. The output is a <strong>diagnostic estimate</strong>, not an
          official IELTS or TOEFL score. Vaani is not affiliated with the British Council, IDP, Cambridge English,
          or ETS. Candidates must sit an examined IELTS or TOEFL session for any certified score.
        </p>
        <p>
          Bands produced by Vaani are intended as preparation feedback. We make no guarantee that your eventual
          examined band will match Vaani's estimate; differences of ±0.5 to ±1.0 band are common between automated
          systems and human examiners.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Acceptable use</div>
        <ul>
          <li>You will only upload recordings of your own voice, or recordings you have explicit permission to submit.</li>
          <li>You will not upload content that is unlawful, defamatory, hateful, or that infringes another person's rights.</li>
          <li>You will not attempt to circumvent rate limits, the audio quality gate, the language gate, or the consent flow.</li>
          <li>You will not scrape, redistribute, or commercially resell Vaani's outputs (band reports, drills, transcripts) without a written licence.</li>
          <li>One account per person. Sharing credentials is grounds for termination without refund.</li>
        </ul>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Account, consent, and your data</div>
        <p>
          You authenticate via Google Sign-In. Before any audio analysis, you must affirmatively grant consent for
          audio recording, voice analysis, and short-term data storage as described in our{" "}
          <a className="tp-link" href="#privacy" onClick={(e) => { e.preventDefault(); navigate("/privacy"); }}>
            Privacy Policy
          </a>. You may revoke consent and request deletion of your data at any time from your account, in line with
          India's Digital Personal Data Protection Act, 2023.
        </p>
        <p>
          We retain audio only for the duration of a single request and never train production models on your
          recordings without a separate, explicit research consent.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Pricing, payments, and refunds</div>
        <p>
          Practice tests are offered at a flat per-test fee (currently INR 299 per IELTS Speaking diagnostic; final
          price is shown at checkout). All fees are inclusive of applicable Indian taxes. Payments are processed by
          a third-party payment gateway; their terms also apply.
        </p>
        <p>
          <strong>Refund policy.</strong> Because the service is consumed at the moment a band is generated, refunds
          are limited to the following cases: (1) a successful payment with no band returned due to a Vaani-side
          error, (2) duplicate charges. Requests must be made within 7 days to{" "}
          <a href="mailto:neilshankarray@vaaani.in" className="tp-link">neilshankarray@vaaani.in</a> with the order ID. We do
          not refund tests where a band was successfully returned, even if you disagree with the band.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Service availability</div>
        <p>
          Vaani is offered "as is" without uptime guarantees while in pilot. We may pause, throttle, or modify the
          service for maintenance, abuse mitigation, or compute capacity reasons. We will give reasonable notice for
          planned maintenance where practical.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Intellectual property</div>
        <p>
          The Vaani name, the Contrastive Acoustic Voice Profiling (CAVP) engine, the band rubric mappings, the
          Ask Vaani knowledge graph, and the underlying source code remain our property. You retain all rights
          in your own voice recordings and may use Vaani's reports for personal preparation, including sharing with
          your tutor or coaching centre.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Limitation of liability</div>
        <p>
          To the maximum extent permitted by Indian law, our aggregate liability to you for any claim arising from
          or related to your use of Vaani is limited to the fees you paid us in the three months preceding the
          claim. We are not liable for indirect, incidental, or consequential losses (including loss of an exam
          opportunity, lost earnings, or coaching fees paid to third parties).
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Termination</div>
        <p>
          You may delete your account at any time via the account settings page. We may suspend or terminate
          accounts for breach of these Terms, suspected fraud, or abusive use. Termination does not entitle you to
          a refund of fees already consumed.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Governing law and disputes</div>
        <p>
          These Terms are governed by the laws of India. Any dispute will first be addressed by good-faith
          discussion. If unresolved within 30 days, the courts of Kolkata, West Bengal, will have exclusive
          jurisdiction, subject to any consumer-protection rights you have under the Consumer Protection Act, 2019.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Changes to these Terms</div>
        <p>
          We may update these Terms as the product matures. Material changes will be announced on the site and via
          email at least 14 days before they take effect. Continued use after the effective date constitutes
          acceptance.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Contact</div>
        <p>
          Questions, refund requests, deletion requests, or legal notices:{" "}
          <a href="mailto:neilshankarray@vaaani.in" className="tp-link">neilshankarray@vaaani.in</a>.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Disclaimer</div>
        <p className="tp-info-muted">
          Vaani is an automated diagnostic estimate and is not an official IELTS or TOEFL score. It is provided as a
          preparation aid. Candidates must still sit an examined IELTS or TOEFL session for any certified score.
        </p>
      </div>
    </section>
  );
}
