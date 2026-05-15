import React from "react";
import { useNavigate } from "react-router-dom";

export default function MethodologyPage() {
  const navigate = useNavigate();
  return (
    <section className="tp-info">
      <button className="tp-btn tp-btn--ghost tp-btn--sm" onClick={() => navigate("/")}>← Back</button>
      <h1 className="tp-info-h1">Contrastive Acoustic Voice Profiling</h1>
      <p className="tp-info-lede">
        Vaani runs an 18-layer <em>acoustic + linguistic</em> pipeline on every submission. Whisper transcribes, Praat
        measures formants and pitch, the rhythm/voice-quality battery is extracted, spaCy parses grammar, and the Contrastive
        Interference Function (CIF) reads those measurements against an L1 attractor calibrated for your
        declared substrate. Every band the user sees traces back to a measurable feature in the recording —
        no LLM justifications, no black-box ratings. All four IELTS criteria are scored: Fluency &amp; Coherence,
        Lexical Resource, Grammatical Range, and Pronunciation.
      </p>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Why this exists</div>
        <p>
          When you're preparing for IELTS or TOEFL Speaking as an Indian L2 English candidate, a generic
          pronunciation score is rarely enough. For a Hindi speaker, retroflex <code>/ʈ/</code> bleeding into
          English <code>/t/</code> is a documented L1 transfer pattern with a specific articulatory fix. For a
          Bengali speaker, <code>/θ/</code> slipping to <code>/t/</code> has a different articulatory cause and
          a different remediation. Generic phoneme scoring sees the deviation but cannot tell you which transfer
          pattern is at play, so it cannot point you at the minimal articulatory adjustment that would close
          the gap.
        </p>
        <p>
          Vaani's approach is to measure your voice with the tooling a phonetician would publish with — Praat
          for formants, two-pass per-speaker pitch, jitter, shimmer, HNR — then read those measurements against
          L1-specific transfer patterns           calibrated (Bengali, Hindi, Tamil, Telugu, Marathi, Gujarati). Your feedback names what the engine heard, which L1 pattern best explains it, and
          which articulatory shift typically neutralises it.
        </p>
        <p>
          We call this <b>Contrastive Acoustic Voice Profiling</b>: contrastive because your profile is read
          against your L1's documented English-transfer space; acoustic because it's grounded in real phonetic
          measurements rather than statistical approximations; and voice-profiling because every report is
          shaped by the specific way you speak.
        </p>
      </div>

      <h2 className="tp-h2" style={{ marginTop: 36 }}>The 18-layer pipeline</h2>

      <div className="tp-info-grid">
        <div className="tp-info-card">
          <div className="tp-info-card-title">Layer 1 · Whisper transcription</div>
          <ul>
            <li>OpenAI Whisper (tiny (CPU) for fast mode, base (GPU) for full mode) transcribes the response.</li>
            <li>Word-level timestamps and per-word confidence scores are retained.</li>
            <li>Language detection with ISO 639-1 code and probability score.</li>
          </ul>
        </div>
        <div className="tp-info-card">
          <div className="tp-info-card-title">Layer 2 · Praat acoustic measurement</div>
          <ul>
            <li>F1–F4 formants per stressed vowel — vowel space area triangulated from /i/, /a/, /u/ corners.</li>
            <li>Two-pass pitch tracking (De Looze &amp; Hirst 2008): pass 1 wide bracket
              (50–600 Hz) to estimate the speaker's F0 distribution; pass 2 with a per-speaker
              floor / ceiling derived from Q15 and Q65 of pass 1. Eliminates the boundary
              octave errors a fixed bracket admits.</li>
            <li>Jitter (local + RAP), shimmer (local + APQ3), HNR, spectral tilt, CPP — voice-quality battery,
              keyed off the same speaker-adapted fundamental as Layer 2's pitch tracker.</li>
            <li>Run as a real Praat session via parselmouth — same measurements a phonetician would publish.</li>
          </ul>
        </div>
        <div className="tp-info-card">
          <div className="tp-info-card-title">Layer 3 · Prosodic profile</div>
          <ul>
            <li>nPVI-V and %V (Grabe &amp; Low 2002, Ramus 1999) — the rhythm metrics that
              distinguish syllable-timed Indian L2 English from stress-timed L1 English.</li>
            <li>Speech rate (syllables/sec), pause-to-speech ratio, ΔC (consonantal interval variability).</li>
            <li>Intonation contour summary stats from the speaker-adapted pitch track.</li>
          </ul>
        </div>
        <div className="tp-info-card">
          <div className="tp-info-card-title">Layer 5 · L1 catalogue match</div>
          <ul>
            <li>Acoustic markers matched against the L1-specific pattern catalogue for your declared L1
              (6 languages calibrated: Bengali, Hindi, Tamil, Telugu, Marathi, Gujarati).</li>
            <li>Each fired pattern carries phoneme-aligned evidence and timestamps.</li>
            <li>Acoustic events that don't match a catalogued pattern are still reported as
              "acoustic substitution event detected, mechanism unlabelled" — never silenced.</li>
          </ul>
        </div>
        <div className="tp-info-card">
          <div className="tp-info-card-title">Layer 6 · Contrastive Interference Function (CIF)</div>
          <ul>
            <li>Combines Layer 2/3/4 features into a state vector and reads it against the L1's
              empirically-fit attractor (centre, σ, weight per dimension).</li>
            <li>Produces an <code>overall_cii</code> in [0, 1] with a severity tag (None / Mild / Moderate / High).</li>
            <li>Calibrated against published L2 phonetics literature
              (AI4Bharat, IIT Madras) on 2026-05-04 / 05. The runtime rejects requests
              for any L1 outside this calibrated set.</li>
          </ul>
        </div>
        <div className="tp-info-card">
          <div className="tp-info-card-title">Final · Pronunciation band mapping</div>
          <ul>
            <li>Pronunciation band 0–9 derived deterministically from CIF composite +
              confidence-weighted phoneme accuracy + prosodic nativeness.</li>
            <li>Same recording produces the same band every time — no stochastic LLM step.</li>
            <li>FC / LR / GRA bands are <b>not</b> produced; they are explicitly marked
              "Not scored — requires human assessment" on every report.</li>
          </ul>
        </div>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Why your profile is voice-unique</div>
        <p>
          We tested two speakers (Bengali, Tamil) from the Svarah corpus through the live engine. Their
          profiles differed meaningfully on every measured dimension:
        </p>
        <ul>
          <li>F1 mean: 597 Hz vs 500 Hz (16% Δ)</li>
          <li>F2 mean: 1630 Hz vs 1851 Hz (12% Δ)</li>
          <li>Mean F0 (2-pass adapted): 225 Hz vs 212 Hz (5.8% Δ)</li>
          <li>HNR: 18.7 dB vs 10.8 dB (42% Δ)</li>
          <li>Jitter local: 0.015 vs 0.031 (53% Δ)</li>
        </ul>
        <p>
          This is not a coincidence — it's the design. Every layer above contributes information that
          differentiates one speaker from another. Your Vaani profile is genuinely yours. (Tamil here was
          run during calibration research; production currently scores Bengali and Hindi only.)
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Calibration — what we have and what we don't</div>
        <p>
          We distinguish carefully between <b>measured</b> features (extracted from your audio with Praat /
          Whisper + Praat — acoustically grounded) and <b>predicted</b> patterns (statistical priors derived
          from the literature on L1 transfer). Every report flags which is which.
        </p>
        <ul>
          <li><b>Bengali, Hindi:</b> CIF attractors calibrated against published acoustic-phonetic studies —
            AI4Bharat's open-access Indian-accented English dataset, hosted at IIT Madras
            (~9.6 hr, 117 speakers, 65 districts) — on 2026-05-04 / 05. Production runtime supports
            these two L1s only.</li>
          <li><b>Bhojpuri, Odia, Tamil, Telugu:</b> calibration in progress. Vaani's policy is that an L1
            appears on the production engine only after its CIF attractor is fit on real Indian speech data;
            until those fits are validated against empirical data, the engine will not score against them. We would
            rather decline a request than produce a band a phonetician would dispute.</li>
          <li><b>Examiner-graded ground truth:</b> the validation cohort (30 Bengali + 30 Hindi clips
            graded by two trained IELTS examiners on the Pronunciation criterion) has not yet been run.
            When Pearson r, MAE in band units, and inter-rater κ are published, they will appear here.
            Until then we describe Vaani as an instrument that measures your voice honestly — not as
            a substitute for an examiner.</li>
        </ul>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Reliability — when Vaani says "trust this less"</div>
        <p>Every report carries reliability flags. We <em>downgrade</em> our own confidence when:</p>
        <ul>
          <li>Sample duration is shorter than 60 seconds — the band is still produced but flagged.</li>
          <li>Forced alignment degraded (phoneme boundaries interpolated) —
            a warning is emitted and the rubric justification adds a higher-variance disclaimer.</li>
          <li>Phoneme accuracy 95% CI is wider than the report's typical envelope — the CI is surfaced
            in the justification line.</li>
          <li>SNR &lt; 15 dB or background voices detected — bands are still returned, but flagged.</li>
        </ul>
        <p>
          A flagged report tells you exactly what to fix in your next recording. We'd rather show "Sample
          too short to score Pronunciation reliably" than fabricate a band.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Depth over speed — by design</div>
        <p>
          A full submission takes <b>~90–150 seconds</b> warm. The pipeline runs serially on a single
          CPU because Whisper and the Praat subprocess hold processing state we cannot safely share.
          That's a deliberate choice: precise per-voice measurement over fake speed. Every layer above
          actually runs at full algorithmic precision — Praat's two-pass pitch isn't approximated,
          phoneme accuracy isn't averaged-over-everyone, the CIF isn't a heuristic stand-in. The trade
          we're making: a couple of minutes of your prep time for a profile that's genuinely unique to
          your voice and L1, instead of a generic phoneme score you've already gotten from three other
          apps.
        </p>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">What Vaani is not</div>
        <ul>
          <li>Not an official IELTS or TOEFL score. We are not affiliated with the British Council, IDP,
            Cambridge, or ETS.</li>
          <li>Not a substitute for a human examiner. Examiners weigh Fluency, Lexical Resource, and
            Grammatical Range — Vaani measures Pronunciation only and explicitly refuses to score the
            other three.</li>
          <li>Not a clinical speech assessment. Use a licensed SLP for medical or developmental concerns.</li>
        </ul>
      </div>

      <div className="tp-info-card tp-info-card--wide">
        <div className="tp-info-card-title">Versioning &amp; changelog</div>
        <p>
          Each score is stamped with the engine version that produced it (e.g. <code>vaani-engine@2026.05</code>).
          Re-scoring with a newer version may yield different bands; we keep the stamped version for your records
          so coaches can compare like-for-like over time.
        </p>
      </div>
    </section>
  );
}
