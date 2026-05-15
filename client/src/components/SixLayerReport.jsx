import React from "react";

// Plain-English breakdown of the six acoustic layers Vaani actually runs in
// production (acoustic-core mode). Each card shows: what we measured, what
// it means in everyday words, and one concrete thing the speaker can try.
// Only fields that are present on the attempt are surfaced — when a layer's
// data is missing we say so honestly rather than inventing a number.
//
// Copy guidelines (2026-05-08):
//   - No acronyms (HNR / CIF / dB / Hz² / semitones / syl/s).
//   - Sentences ≤ 10 words wherever possible.
//   - Numbers translated to words ("a little breathy" not "70% breathy").
//   - Tips lead with an action verb. One tip per card.
//   - Aim: an upper-primary student (~10 yrs) can read it. An adult test
//     candidate can act on it. A linguist can recognise the underlying
//     measurement from the small subtitle.

function fmt(n, digits = 2) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Number(n).toFixed(digits);
}

function pct(n, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return `${(Number(n) * 100).toFixed(digits)}%`;
}

// Word translations for borderline-numeric metrics. Centralised so the
// thresholds are visible in one place.
function wordSpeed(syl) {
  if (syl == null) return null;
  const r = Number(syl);
  if (r < 2.5) return "very slow";
  if (r < 3.2) return "slow";
  if (r < 4.5) return "comfortable";
  if (r < 5.5) return "quick";
  return "very fast";
}

function wordHnr(hnr) {
  if (hnr == null) return null;
  const v = Number(hnr);
  if (v >= 18) return "very clear";
  if (v >= 13) return "clear";
  if (v >= 9)  return "a little rough";
  return "rough";
}

function wordBreath(idx) {
  if (idx == null) return null;
  const v = Number(idx);
  if (v < 0.25) return "tight";
  if (v < 0.5)  return "normal";
  if (v < 0.75) return "a little breathy";
  return "breathy";
}

function wordNasal(idx) {
  if (idx == null) return null;
  const v = Number(idx);
  if (v < 0.15) return "open and clear";
  if (v < 0.35) return "a little nasal";
  if (v < 0.6)  return "nasal";
  return "very nasal";
}

function wordCif(idx) {
  if (idx == null) return null;
  const v = Number(idx);
  if (v < 0.25) return "barely showing";
  if (v < 0.45) return "a little";
  if (v < 0.65) return "medium";
  return "a lot";
}

function LayerCard({ index, name, sub, measured, meaning, tip, available = true }) {
  return (
    <div className="tp-layer-card">
      <div className="tp-layer-head">
        <span className="tp-layer-num">Step {index}</span>
        <span className="tp-layer-name">{name}</span>
        <span className="tp-layer-sub">{sub}</span>
      </div>
      {available ? (
        <>
          <div className="tp-layer-block">
            <div className="tp-layer-label">What we found</div>
            <ul className="tp-layer-list">
              {measured.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
          <div className="tp-layer-block">
            <div className="tp-layer-label">What this means</div>
            <p className="tp-layer-text">{meaning}</p>
          </div>
          <div className="tp-layer-block tp-layer-tip">
            <div className="tp-layer-label">Try this</div>
            <p className="tp-layer-text">{tip}</p>
          </div>
        </>
      ) : (
        <p className="tp-layer-text tp-layer-muted">
          We couldn't read this part of your voice clearly this time. Try recording
          again in a quiet room.
        </p>
      )}
    </div>
  );
}

// ── Step 1: Whisper (what we heard) ──────────────────────────────────────
function whisperCard(transcript, audioQ) {
  const wordCount = transcript ? transcript.trim().split(/\s+/).filter(Boolean).length : 0;
  const dur = audioQ?.duration_seconds;
  const measured = [];
  if (transcript) {
    measured.push(`We heard you say about ${wordCount} word${wordCount === 1 ? "" : "s"}.`);
  }
  if (dur != null) {
    measured.push(`You spoke for ${fmt(dur, 0)} seconds.`);
  }
  return {
    index: 1,
    name: "What we heard",
    sub: "speech recognition",
    available: !!transcript,
    measured,
    meaning:
      "This is the words the computer heard from you. The rest of the test works from this. So clear words help everything.",
    tip:
      "Open your mouth a little more. Finish the end of each word — say the 't' in 'best' and the 's' in 'months'.",
  };
}

// ── Step 2: Recording cleanliness (proxied by audio quality) ─────────────
function alignmentCard(audioQ) {
  if (!audioQ) {
    return {
      index: 2,
      name: "How clean your recording was",
      sub: "sound quality",
      available: false,
    };
  }
  const measured = [];
  if (audioQ.snr_db != null) {
    const snr = Number(audioQ.snr_db);
    let word = "very clean";
    if (snr < 18) word = "a bit noisy";
    else if (snr < 25) word = "okay";
    else if (snr < 40) word = "clean";
    measured.push(`Your room was ${word}.`);
  }
  if (audioQ.speech_presence_ratio != null) {
    const r = Math.round(Number(audioQ.speech_presence_ratio) * 100);
    measured.push(`We heard your voice in about ${r} out of every 100 moments.`);
  }
  if (audioQ.clipping_ratio != null && audioQ.clipping_ratio > 0.001) {
    measured.push("Some parts were too loud and got cut off.");
  }
  return {
    index: 2,
    name: "How clean your recording was",
    sub: "sound quality",
    available: true,
    measured,
    meaning:
      "The computer needs to hear your voice clearly. A noisy room or a far-away phone makes the test confused.",
    tip:
      "Sit in a quiet room. Hold the phone close to your face, about a hand away from your mouth.",
  };
}

// ── Step 3: Praat (how your voice sounds) ────────────────────────────────
function praatCard(vq) {
  if (!vq) {
    return { index: 3, name: "How your voice sounds", sub: "voice quality", available: false };
  }
  if (vq.tracking_ok === false) {
    return {
      index: 3,
      name: "How your voice sounds",
      sub: "voice quality",
      available: false,
    };
  }
  const measured = [];
  const hnrWord = wordHnr(vq.breathiness?.hnr);
  if (hnrWord) measured.push(`Your voice sounded ${hnrWord}.`);
  const brWord = wordBreath(vq.breathiness?.breathiness_index);
  if (brWord && brWord !== "normal") measured.push(`It was ${brWord}.`);
  const nasalWord = wordNasal(vq.nasality?.nasality_index);
  if (nasalWord) measured.push(`The sound was ${nasalWord}.`);
  if (vq.creakiness?.has_vocal_fry) {
    measured.push("Your voice got a bit creaky at the end of some sentences.");
  }
  if (measured.length === 0 && vq.overall_quality_score != null) {
    measured.push(`Your voice sounded okay overall.`);
  }
  return {
    index: 3,
    name: "How your voice sounds",
    sub: "voice quality",
    available: true,
    measured,
    meaning:
      "This is how your voice feels to the person listening — clear and confident, or tired and squeezed. People notice this even before they notice your words.",
    tip:
      "Drink some water. Take one slow breath through your nose. Speak from your chest, not your throat.",
  };
}

// ── Step 4: librosa (rhythm and pace) ────────────────────────────────────
function librosaCard(pp) {
  if (!pp) {
    return { index: 4, name: "How fast and smooth you spoke", sub: "rhythm and pace", available: false };
  }
  const measured = [];
  const speedWord = wordSpeed(pp.speech_rate_syl_per_sec);
  if (speedWord) measured.push(`You spoke at a ${speedWord} pace.`);
  if (pp.intonation?.pattern) {
    const word = {
      flat: "flat — try more ups and downs",
      rising: "going up at the end",
      falling: "going down at the end",
      "fall-rise": "going down then up",
      "rise-fall": "going up then down",
    }[pp.intonation.pattern] || pp.intonation.pattern;
    measured.push(`Your voice was mostly ${word}.`);
  }
  if (pp.pause_to_speech_ratio != null) {
    const p = Math.round(Number(pp.pause_to_speech_ratio) * 100);
    measured.push(`You stopped to think about ${p} times out of 100.`);
  }
  return {
    index: 4,
    name: "How fast and smooth you spoke",
    sub: "rhythm and pace",
    available: true,
    measured,
    meaning:
      "English has a music to it. Strong words get stretched, small words get squeezed. A flat voice sounds boring even if every word is right.",
    tip:
      "Pick the three most important words in each sentence. Make them a tiny bit longer and louder. Squeeze the small words ('a', 'the', 'of').",
  };
}

// ── Step 5: Sound accuracy (phoneme pairing) ─────────────────────────────
function pairingCard(pa) {
  if (!pa) {
    return { index: 5, name: "Your sounds", sub: "sound accuracy", available: false };
  }
  const measured = [];
  if (pa.overall_accuracy != null) {
    const r = Math.round(Number(pa.overall_accuracy) * 100);
    measured.push(`About ${r} out of every 100 of your sounds matched English.`);
  }
  const missing = Array.isArray(pa.missing_target_phonemes) ? pa.missing_target_phonemes : [];
  if (missing.length > 0 && missing.length < 9) {
    measured.push(`We didn't hear ${missing.length} sound${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  }
  // Substitutions: only render entries that have BOTH a target and a real
  // produced/replacement label (NW-event entries). Formant-deviation
  // entries lack a swap label and would render as "X → ?".
  const subs = (Array.isArray(pa.substitution_patterns) ? pa.substitution_patterns : [])
    .filter((s) => s && String(s.target || "").trim() && String(s.produced || s.replacement || "").trim())
    .slice(0, 3);
  if (subs.length > 0) {
    measured.push(
      `You changed some sounds: ${subs
        .map((s) => `${s.target} sounded like ${s.produced || s.replacement}`)
        .join("; ")}.`
    );
  }
  const hasIssues = missing.length > 0 && missing.length < 9 || subs.length > 0;
  return {
    index: 5,
    name: "Your sounds",
    sub: "sound accuracy",
    available: true,
    measured,
    meaning:
      "Some English sounds are hard for new speakers. We found which ones tripped you up. The good news: each one is fixable with a little practice.",
    tip: hasIssues
      ? "Pick just one sound from the list above. Say it five minutes a day with word pairs like 'ship' and 'sheep'. One sound a week is enough."
      : "Your sounds are in good shape. Move on to Step 4 (rhythm) for your next gain.",
  };
}

// ── Step 6: CIF (mother-tongue fingerprint) ──────────────────────────────
function cifCard(cif, l1Name) {
  if (!cif || (cif.overall_cii == null && cif.composite_score == null)) {
    return { index: 6, name: "Your home-language fingerprint", sub: "L1 interference", available: false };
  }
  const overall = cif.overall_cii != null ? cif.overall_cii : cif.composite_score;
  const word = wordCif(overall);
  const measured = [];
  measured.push(`Your home language is showing ${word}.`);
  if (cif.predicted_ielts_band != null) {
    measured.push(`Your speaking score guess: about band ${cif.predicted_ielts_band}.`);
  }
  return {
    index: 6,
    name: "Your home-language fingerprint",
    sub: "L1 interference",
    available: true,
    measured,
    meaning:
      `Everyone who learned English second keeps a little of their first language in their voice. That is normal — even good. This score tells you how much of ${l1Name || "your first language"} is still in there.`,
    tip:
      "Look at the steps above with the lowest scores. Fix those one at a time. Your fingerprint will shrink on its own.",
  };
}

export default function SixLayerReport({ attempt }) {
  if (!attempt) return null;

  const acoustic = attempt.acoustic || {};
  const transcript = attempt.transcript;
  const audioQ = acoustic.audio_quality;
  const vq = acoustic.voice_quality;
  const pp = acoustic.prosodic_profile;
  const pa = acoustic.phoneme_analysis;
  const cif = acoustic.cif;
  const l1Name = attempt.l1Language || "your first language";

  const cards = [
    whisperCard(transcript, audioQ),
    alignmentCard(audioQ),
    praatCard(vq),
    librosaCard(pp),
    pairingCard(pa),
    cifCard(cif, l1Name),
  ];

  return (
    <section className="tp-detail-section">
      <h2 className="tp-detail-h2">Your voice — six simple steps</h2>
      <p className="tp-layer-intro">
        We listened to you in six small ways. Each card shows what we heard,
        what it means, and one thing you can try next time.
      </p>
      <div className="tp-layer-grid">
        {cards.map((c) => (
          <LayerCard key={c.index} {...c} />
        ))}
      </div>
    </section>
  );
}
