import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// ── Hero ─────────────────────────────────────────────────────────────────
function Hero({ onStartIELTS, onStartTOEFL }) {
  const root = useRef(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        gsap.set([".l26-eyebrow", ".l26-h1", ".l26-lede", ".l26-cta", ".l26-checks li", ".l26-hero-card", ".l26-waveform path"], { opacity: 1, y: 0 });
        return;
      }

      // Header entrance — animate elements OUTSIDE the Landing component
      // (PublicLayout's .tp-header) when the page loads. Because these
      // selectors target nodes outside `useGSAP({ scope: root })`, useGSAP
      // can't auto-kill them on unmount; we capture the timeline + tween
      // and kill them in the cleanup at the bottom of the effect.
      const headerTl = gsap.timeline({ defaults: { ease: "power2.out" } });
      headerTl
        .from(".tp-header", { y: -24, opacity: 0, duration: 0.55 })
        .from(".tp-brand-mark", { scale: 0.4, opacity: 0, duration: 0.55, ease: "back.out(2)" }, "-=0.35")
        .from(".tp-brand-name", { x: -12, opacity: 0, duration: 0.45 }, "-=0.25")
        .from(".tp-brand-tag", { x: -10, opacity: 0, duration: 0.4 }, "-=0.35")
        .from(".tp-brand-bengali", { x: -8, opacity: 0, duration: 0.4 }, "-=0.35")
        .from(".tp-nav .tp-nav-link", { y: -8, opacity: 0, duration: 0.4, stagger: 0.05 }, "-=0.3");

      // The brand mark gets a recurring soft "voice-pulse" — three concentric
      // shadow rings that emanate outwards on a 4s cycle. Echoes the
      // product (acoustic voice profiling) without being noisy.
      const brandPulse = gsap.to(".tp-brand-mark", {
        keyframes: {
          boxShadow: [
            "0 0 0 1px rgba(31,95,91,0.35), 0 6px 18px rgba(31,95,91,0.20)",
            "0 0 0 6px rgba(31,95,91,0.10), 0 0 0 14px rgba(31,95,91,0.05), 0 6px 18px rgba(31,95,91,0.22)",
            "0 0 0 1px rgba(31,95,91,0.35), 0 6px 18px rgba(31,95,91,0.20)",
          ],
        },
        duration: 3.6,
        repeat: -1,
        ease: "sine.inOut",
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".l26-eyebrow", { y: 14, opacity: 0, duration: 0.6 })
        .from(".l26-h1", { y: 36, opacity: 0, duration: 0.9 }, "-=0.35")
        .from(".l26-lede", { y: 24, opacity: 0, duration: 0.7 }, "-=0.5")
        .from(".l26-cta .l26-btn", { y: 14, opacity: 0, duration: 0.5, stagger: 0.08 }, "-=0.4")
        .from(".l26-checks li", { y: 10, opacity: 0, duration: 0.4, stagger: 0.06 }, "-=0.3")
        .from(".l26-hero-card", { y: 40, opacity: 0, scale: 0.96, duration: 0.9, ease: "back.out(1.4)" }, "-=0.85")
        .from(".l26-hero-blob", { scale: 0.7, opacity: 0, duration: 1.2, ease: "power2.out", transformOrigin: "50% 50%" }, "-=1.0")
        .from(".l26-shape", { scale: 0, opacity: 0, duration: 0.6, ease: "back.out(2)", stagger: 0.08 }, "-=0.7");

      // Waveform decoration — a stylised sine envelope behind the hero
      // card. Each path draws in via stroke-dashoffset, then breathes
      // continuously. Visually echoes the product (this IS a tool that
      // looks at waveforms for a living).
      const wf = root.current?.querySelector(".l26-waveform");
      if (wf) {
        const paths = wf.querySelectorAll("path");
        paths.forEach((p) => {
          const len = p.getTotalLength();
          p.style.strokeDasharray = String(len);
          p.style.strokeDashoffset = String(len);
        });
        gsap.to(paths, {
          strokeDashoffset: 0,
          duration: 1.6,
          ease: "power2.inOut",
          stagger: 0.12,
          delay: 0.5,
        });
        // Continuous gentle amplitude breathing — yScale 0.92↔1.08
        gsap.to(paths, {
          scaleY: 1.08,
          transformOrigin: "50% 50%",
          duration: 2.4,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          stagger: 0.15,
        });
      }

      // Idle float on the geometric shapes — gentle, not distracting.
      gsap.to(".l26-shape--lime-1", { y: -10, rotation: 28, duration: 4.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(".l26-shape--lime-2", { y: 8, rotation: -22, duration: 5.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(".l26-shape--ink",    { y: -6, rotation: 42, duration: 6.0, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(".l26-shape--orange", { y: 12, duration: 4.0, ease: "sine.inOut", yoyo: true, repeat: -1 });

      // Subtle parallax on the hero blob as the user starts scrolling.
      gsap.to(".l26-hero-blob", {
        yPercent: -12, ease: "none",
        scrollTrigger: { trigger: ".l26-hero", start: "top top", end: "bottom top", scrub: true },
      });

      // Hero card numerical "tick-up" — uses the actual measured numbers
      // from the post-restart smoke test, so the demo card is grounded
      // in real data not synthetic placeholders.
      const counters = root.current?.querySelectorAll("[data-counter]") || [];
      counters.forEach((el) => {
        const target = parseFloat(el.dataset.counter);
        const decimals = parseInt(el.dataset.decimals || "0", 10);
        const suffix = el.dataset.suffix || "";
        const obj = { v: 0 };
        gsap.to(obj, {
          v: target,
          duration: 1.2,
          delay: 0.6,
          ease: "power2.out",
          onUpdate: () => { el.textContent = obj.v.toFixed(decimals) + suffix; },
        });
      });

      // Cleanup for animations whose targets live OUTSIDE useGSAP's scope.
      // useGSAP only auto-kills tweens whose targets resolve inside `root`;
      // headerTl and the brand-mark pulse animate selectors in PublicLayout,
      // so they would otherwise keep running (and reattach SVG transforms)
      // after the user navigates off the landing page.
      return () => {
        headerTl.kill();
        brandPulse.kill();
        gsap.killTweensOf(".tp-brand-mark");
      };
    },
    { scope: root }
  );

  return (
    <section className="l26-hero" ref={root}>
      <div className="l26-hero-grid">
        <div className="l26-hero-copy">
          <div className="l26-eyebrow">Contrastive Acoustic Voice Profiling</div>
          <h1 className="l26-h1">
            An <em>Acoustic Voice Profile</em> for IELTS &amp; TOEFL Speaking, measured from your audio.
          </h1>
          <p className="l26-lede">
            Vaani measures your formants, pitch, voice quality, and rhythm with the same tools a phonetician
            uses — Praat and Whisper — then reads them against L1 transfer attractors empirically calibrated for
            Bengali and Hindi speakers from the Svarah corpus (AI4Bharat, IIT Madras). Your feedback names what
            the engine actually
            heard — for instance a <code>/θ/</code> slipping to <code>/t/</code> or a retroflex <code>/ʈ/</code>{" "}
            bleeding into English <code>/t/</code> — with timestamps you can replay. Vaani scores the
            Pronunciation criterion only; fluency, lexical resource, and grammatical range require a human
            examiner and we will not pretend otherwise.
          </p>
          <div className="l26-cta">
            <button className="l26-btn l26-btn--primary" onClick={onStartIELTS}>Start IELTS mock</button>
            <button className="l26-btn l26-btn--ghost" onClick={onStartTOEFL}>Start TOEFL task</button>
          </div>
          <ul className="l26-checks">
            <li>Measured Pronunciation band, 0–9</li>
            <li>CIF calibrated against AI4Bharat&apos;s Svarah corpus</li>
            <li>Praat 2-pass per-speaker pitch</li>
            <li>Phoneme accuracy with 95% CI</li>
          </ul>
        </div>

        <div className="l26-hero-visual" aria-hidden="true">
          <div className="l26-hero-blob" />
          {/* Stylised sine envelope drawn behind the card. Three phase-
              shifted sine waves at decreasing opacity — pure decoration
              but visually anchored to the product (acoustic profiling).
              Each path is animated by GSAP: stroke-draw on entry, then
              continuous amplitude breathing. */}
          <svg className="l26-waveform" viewBox="0 0 360 120" preserveAspectRatio="none" fill="none" aria-hidden="true">
            <path
              d="M0,60 C30,30 60,90 90,60 S150,30 180,60 S240,90 270,60 S330,30 360,60"
              stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55"
            />
            <path
              d="M0,60 C20,40 50,80 80,60 S140,40 170,60 S230,80 260,60 S320,40 360,60"
              stroke="currentColor" strokeWidth="1.0" strokeLinecap="round" opacity="0.40"
            />
            <path
              d="M0,60 C40,50 70,70 100,60 S160,50 190,60 S250,70 280,60 S340,50 360,60"
              stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.25"
            />
          </svg>
          <div className="l26-shape l26-shape--ink" />
          <div className="l26-shape l26-shape--lime-1" />
          <div className="l26-shape l26-shape--lime-2" />
          <div className="l26-shape l26-shape--orange" />

          <div className="l26-hero-card">
            <div className="l26-hero-card-head">
              <span>Sample · Hindi L1 · 28s</span>
              <span className="l26-hero-card-chip" />
            </div>
            <div className="l26-hero-card-band" data-counter="6.0" data-decimals="1">0.0</div>
            <div className="l26-hero-card-band-sub">
              <b>Pronunciation Band</b> · CIF Moderate
            </div>
            <div className="l26-hero-card-rows">
              <div className="l26-hero-card-row">
                <span>CIF overall index</span>
                <span><span data-counter="0.56" data-decimals="2">0.00</span></span>
              </div>
              <div className="l26-hero-card-row">
                <span>F1 / F2 mean (Hz)</span>
                <span><span data-counter="644" data-decimals="0">0</span> / <span data-counter="2044" data-decimals="0">0</span></span>
              </div>
              <div className="l26-hero-card-row">
                <span>F0 mean (2-pass)</span>
                <span><span data-counter="163" data-decimals="0">0</span> Hz</span>
              </div>
              <div className="l26-hero-card-row">
                <span>HNR</span>
                <span><span data-counter="13.9" data-decimals="1">0.0</span> dB</span>
              </div>
              <div className="l26-hero-card-row">
                <span>Phoneme accuracy</span>
                <span><span data-counter="56" data-decimals="0">0</span>%</span>
              </div>
            </div>
            <div className="l26-hero-card-foot">
              <span>FC / LR / Grammar</span>
              <span>Human-graded</span>
            </div>
          </div>

          {/* Persistent academic attribution — Svarah / AI4Bharat / IIT Madras.
              Sits directly under the sample card so anyone reading the demo
              numbers sees the calibration provenance in the same glance. */}
          <div className="l26-hero-corpus" aria-label="Calibration data attribution">
            <div className="l26-hero-corpus-mark" aria-hidden="true">स्व</div>
            <div>
              Calibration data: <b>Svarah corpus</b> —{" "}
              <a href="https://ai4bharat.iitm.ac.in/" target="_blank" rel="noopener noreferrer">AI4Bharat</a>,
              IIT Madras. Peer-reviewed, open-access Indian-accented English speech
              dataset (~9.6 hr, 117 speakers, 65 districts).
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── How it works ─────────────────────────────────────────────────────────
function HowItWorks() {
  const root = useRef(null);
  useGSAP(
    () => {
      gsap.from(".l26-step", {
        y: 32, opacity: 0, duration: 0.6, ease: "power2.out", stagger: 0.1,
        scrollTrigger: { trigger: root.current, start: "top 80%" },
      });
    },
    { scope: root }
  );

  const steps = [
    { n: 1, t: "Pick a task", d: "Choose an IELTS Part 2 cue card or a TOEFL speaking task." },
    { n: 2, t: "Record your response", d: "Prep timer runs automatically; live captions appear as you speak." },
    { n: 3, t: "Get a measured profile", d: "Vaani returns a Pronunciation band plus the measured acoustic features that produced it — F1/F2, F0, voice quality, rhythm, CIF, top phoneme substitutions with timestamps." },
    { n: 4, t: "Act on it", d: "Each feedback line points to a specific articulatory adjustment for the L1 transfer pattern the engine heard." },
  ];

  return (
    <section className="l26-section" id="how" ref={root}>
      <div className="l26-section-eyebrow">How it works</div>
      <h2 className="l26-h2">Four steps, one measured profile.</h2>
      <p className="l26-section-sub">
        Recording flow on the left; what the engine returns on the right. Every output traces back to a
        feature in the audio.
      </p>
      <div className="l26-steps">
        {steps.map((s) => (
          <div key={s.n} className="l26-step">
            <div className="l26-step-num">{String(s.n).padStart(2, "0")}</div>
            <div className="l26-step-title">{s.t}</div>
            <div className="l26-step-desc">{s.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Six-layer pipeline ───────────────────────────────────────────────────
function Pipeline() {
  const root = useRef(null);
  useGSAP(
    () => {
      gsap.from(".l26-pipe-card", {
        y: 36, opacity: 0, duration: 0.65, ease: "power2.out", stagger: 0.08,
        scrollTrigger: { trigger: root.current, start: "top 80%" },
      });
    },
    { scope: root }
  );

  const layers = [
    { tag: "Layer 1", t: "Whisper transcription", li: ["Word-level timestamps + per-word confidence.", "Phoneme confidence < 0.6 dropped, never guessed."] },
    { tag: "Layer 1b", t: "Forced phoneme alignment", li: ["MFA → WebMAUS → Whisper-g2p fallback chain.", "Quality flag stamped on every report (high/low/unavailable)."] },
    { tag: "Layer 2", t: "Praat acoustic measurement", li: ["F1–F4 formants + vowel-space area.", "Two-pass per-speaker pitch (De Looze & Hirst 2008).", "HNR, jitter, shimmer, spectral tilt, CPP."] },
    { tag: "Layer 3", t: "Acoustic substitution events", li: ["wav2vec2 phoneme CTC + Needleman–Wunsch alignment.", "Timestamped /θ/→/t/-style evidence you can replay.", "Confidence-weighted accuracy with 95% CI."] },
    { tag: "Layer 4", t: "Prosodic profile", li: ["nPVI-V, %V, ΔC (Grabe & Low 2002).", "Speech rate, pause-to-speech ratio.", "Intonation summary on the speaker-adapted pitch track."] },
    { tag: "Layer 5+6", t: "L1 catalogue match · CIF", li: ["Substitution events matched against your L1 catalogue.", "Contrastive Interference Function against the empirically-fit attractor.", "Bengali + Hindi only — calibrated against the Svarah corpus (AI4Bharat, IIT Madras)."] },
  ];

  return (
    <section className="l26-section--alt">
      <div className="l26-section-inner l26-section" ref={root} style={{ padding: "96px 0" }}>
        <div className="l26-section-eyebrow">Six-layer acoustic pipeline</div>
        <h2 className="l26-h2">Every band traces back to a measurement.</h2>
        <p className="l26-section-sub">
          Each layer below is a signal extracted from your audio with peer-reviewed phonetic
          tooling — Praat (Boersma 2001+), Whisper, wav2vec2, and a CIF model calibrated on the
          AI4Bharat Svarah corpus. The Pronunciation band is computed deterministically from these
          measurements: same audio, same band, every time. There is no LLM in the band-mapping
          loop, nothing is approximated, and the report shows you which measurements drove the score.
        </p>
        <div className="l26-pipeline">
          {layers.map((L) => (
            <div key={L.tag} className="l26-pipe-card">
              <div className="l26-pipe-tag">{L.tag}</div>
              <div className="l26-pipe-title">{L.t}</div>
              <ul>{L.li.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pronunciation band table ─────────────────────────────────────────────
function BandsSection() {
  const root = useRef(null);
  useGSAP(
    () => {
      gsap.from(".l26-bands-row", {
        x: -16, opacity: 0, duration: 0.5, ease: "power2.out", stagger: 0.05,
        scrollTrigger: { trigger: root.current, start: "top 80%" },
      });
    },
    { scope: root }
  );

  const rows = [
    ["9.0", "Near-native pronunciation; phoneme realisation, prosodic timing, and voice quality all consistent with educated native L2-English."],
    ["7.5 – 8.5", "Strong pronunciation; occasional L1-substrate features audible but never disrupt intelligibility."],
    ["6.5 – 7.0", "Competent pronunciation; noticeable L1 transfer (formant deviation, rhythm shifts, prosodic carry-over) without affecting comprehension."],
    ["5.0 – 6.0", "L1 transfer regularly affects pronunciation; some phoneme substitutions and rhythm shifts require listener effort."],
    ["≤ 4.5", "Pronunciation patterns interfere with intelligibility on most utterances."],
  ];

  return (
    <section className="l26-section" id="bands" ref={root}>
      <div className="l26-section-eyebrow">Pronunciation band</div>
      <h2 className="l26-h2">What the band actually means.</h2>
      <p className="l26-section-sub">
        Vaani scores the IELTS Speaking <b>Pronunciation</b> criterion only — the descriptor most tightly
        grounded in measurable acoustic properties. Fluency &amp; Coherence, Lexical Resource, and Grammatical
        Range are not produced by Vaani; they require a human examiner. The descriptors below are interpretive
        guides for the Pronunciation band.
      </p>
      <div className="l26-bands">
        {rows.map(([b, d]) => (
          <div key={b} className="l26-bands-row">
            <div className="l26-bands-band">{b}</div>
            <div className="l26-bands-desc">{d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────
function FAQSection() {
  const root = useRef(null);
  useGSAP(
    () => {
      gsap.from(".l26-faq-item", {
        y: 16, opacity: 0, duration: 0.5, ease: "power2.out", stagger: 0.05,
        scrollTrigger: { trigger: root.current, start: "top 82%" },
      });
    },
    { scope: root }
  );

  const faqs = [
    { q: "What does Vaani actually score, and what does it not score?", a: "Vaani scores the IELTS Speaking Pronunciation criterion (or the TOEFL Delivery criterion) — the descriptor that maps directly to measurable acoustic properties. Fluency & Coherence, Lexical Resource, and Grammatical Range are NOT scored by Vaani; they require a human examiner to assess discourse coherence, vocabulary range in context, and grammatical accuracy in production. We refuse to emit bands for those criteria because honest framing matters more than feature parity." },
    { q: "Why L1-aware Pronunciation scoring matters for an Indian candidate", a: "Generic pronunciation scorers mark phoneme deviations as errors without telling you why they happened. For a Hindi speaker, retroflex /ʈ/ bleeding into English /t/ is a documented L1 transfer pattern with a specific articulatory fix. For a Bengali speaker, /θ/ slipping to /t/ has a different articulatory cause. Vaani measures your voice with Praat (formants F1–F4, pitch with two-pass per-speaker tracking, jitter, shimmer, HNR) and reads those measurements against L1 transfer attractors calibrated for your declared L1, so the feedback names the substitution AND points at the articulatory adjustment that closes it." },
    { q: "Is the Vaani band an official IELTS or TOEFL score?", a: "No. Vaani is an automated diagnostic estimate to help you prepare. Only an examined IELTS or TOEFL sitting yields an official score. We are not affiliated with the British Council, IDP, Cambridge, or ETS." },
    { q: "Which L1s are supported, and how were the attractors calibrated?", a: "Bengali and Hindi. Both substrates are empirically calibrated against the Svarah corpus — AI4Bharat's peer-reviewed, open-access Indian-accented English dataset, hosted at IIT Madras (~9.6 hr, 117 speakers, 65 districts). Vaani's policy is simple: an L1 appears on the production engine only after its CIF attractor is fit on real Indian speech data. Bhojpuri, Odia, Tamil, and Telugu calibration is the next milestone on the roadmap; until those fits are validated against Svarah, the engine will not score against them. We would rather decline a request than produce a band a phonetician would dispute." },
    { q: "How confident is the Pronunciation band on any given clip?", a: "Every report carries explicit reliability flags. Phoneme accuracy is computed as a confidence-weighted aggregate from wav2vec posteriors and reported with a 95% CI rather than a single false-precision number. Forced alignment is tagged high (MFA / WebMAUS) or low (Whisper-g2p coarse fallback) and the report flags when alignment ran on the fallback. Sample duration below 60s emits a warning. We do not produce a band without these caveats." },
    { q: "How accurate is the Pronunciation band against examiner ground truth?", a: "We have not yet published an examiner-agreement number and will not put one on this page until the validation cohort is graded. The plan: 30 Bengali + 30 Hindi clips from Svarah, scored independently by two trained IELTS examiners on the Pronunciation criterion only; we will publish Pearson r, MAE in band units, and inter-rater κ. Until then we describe Vaani as an instrument that measures your voice honestly — not as a substitute for examiner judgement on the Pronunciation criterion." },
    { q: "Why does an analysis take ~55–90 seconds?", a: "Vaani runs an 18-layer acoustic pipeline on every submission: Whisper transcription with word-level timestamps, Praat-based formant + pitch + voice-quality extraction, rhythm metrics, prosodic profiling, connected-speech detection, syntactic L1 transfer analysis, and the Contrastive Interference Function combining all of the above against your L1's calibrated attractor. Most of the time goes into Praat formant extraction (the same software used in phonetics labs worldwide). The engine processes one submission at a time so concurrent submissions queue." },
    { q: "Where does my recording go?", a: "Audio is captured in your browser and uploaded only when you submit. The engine analyses it on disk in a worker queue, generates the report, and the audio file is deleted in the same queue handler immediately after the report is produced. We do not retain audio long-term and do not train models on user submissions without separate explicit consent." },
    { q: "Do I need a signup to try Vaani?", a: "Yes — sign in with Google before recording. We tie every attempt to your account so you can see your Pronunciation-band history, compare mocks over time, and download PDF reports. Sign-in is one click; no separate password." },
    { q: "Can coaching institutes deploy Vaani for their students?", a: "Yes — we are open to coaching-centre pilots. The clean way to think about Vaani in your workflow: it produces a measured Pronunciation band and a voice profile your trainers can use as one input alongside their own examiner judgement on Fluency, Lexical Resource, and Grammatical Range. Reach out via the contact page if that division of labour makes sense for your cohort." },
  ];

  return (
    <section className="l26-section--alt">
      <div className="l26-section-inner l26-section" ref={root} style={{ padding: "96px 0" }}>
        <div className="l26-section-eyebrow">FAQ</div>
        <h2 className="l26-h2">Questions worth asking before you trust a number.</h2>
        <div className="l26-faq">
          {faqs.map((f, i) => (
            <details key={i} className="l26-faq-item">
              <summary className="l26-faq-q">{f.q}</summary>
              <p className="l26-faq-a">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ────────────────────────────────────────────────────────────
function CTAStrip({ onStartIELTS }) {
  const root = useRef(null);
  useGSAP(
    () => {
      gsap.from(".l26-cta-strip", {
        y: 30, opacity: 0, duration: 0.7, ease: "power2.out",
        scrollTrigger: { trigger: root.current, start: "top 85%" },
      });
    },
    { scope: root }
  );
  return (
    <section className="l26-section" ref={root}>
      <div className="l26-cta-strip">
        <div className="l26-cta-strip-text">
          <h3>Record a 60-second IELTS Part 2 response and see your measured Pronunciation band.</h3>
          <p>One clip. Real Praat measurements. Honest disclosure of what the engine knows and what it doesn't.</p>
        </div>
        <button className="l26-btn l26-btn--primary" onClick={onStartIELTS}>Start IELTS mock</button>
      </div>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  // The .landing-2026 theme is now applied permanently from PublicLayout
  // so the cream + teal + saffron palette spans every public surface
  // (footer, sign-in modal, Pricing, Contact, About) — no per-page
  // mount/unmount needed here.

  return (
    <div ref={wrapRef}>
      <Hero
        onStartIELTS={() => navigate("/practice/ielts")}
        onStartTOEFL={() => navigate("/practice/toefl")}
      />
      <HowItWorks />
      <Pipeline />
      <BandsSection />
      <FAQSection />
      <CTAStrip onStartIELTS={() => navigate("/practice/ielts")} />
    </div>
  );
}
