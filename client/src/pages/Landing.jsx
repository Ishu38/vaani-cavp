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
            six Indian L1 profiles: Bengali, Hindi, Tamil, Telugu, Marathi, Gujarati. Your feedback names what
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
            <li>CIF calibrated against published L2 phonetics literature</li>
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

