import React from "react";

function BandRing({ value, max = 9, size = 120, label }) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const pct = Math.max(0, Math.min(1, safe / max));
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const stroke = pct >= 0.78 ? "#0f9d58" : pct >= 0.56 ? "#1a73e8" : pct >= 0.33 ? "#f4b400" : "#d93025";
  const display = Number.isFinite(numeric) ? numeric.toFixed(1) : "—";
  return (
    <div className="tp-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e8ef" strokeWidth="8" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="48%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize={size * 0.30}
          fontWeight="700"
          fill="#1f2328"
        >
          {display}
        </text>
        <text
          x="50%"
          y="72%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize={size * 0.11}
          fill="#57606a"
        >
          / {max}
        </text>
      </svg>
      {label && <div className="tp-ring-label">{label}</div>}
    </div>
  );
}

function CriterionRow({ title, band, justification, features }) {
  const numeric = Number(band);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const display = Number.isFinite(numeric) ? numeric.toFixed(1) : "—";
  return (
    <div className="tp-criterion">
      <div className="tp-criterion-head">
        <span className="tp-criterion-title">{title}</span>
        <span className="tp-criterion-band">Band {display}</span>
      </div>
      <div className="tp-criterion-bar">
        <div className="tp-criterion-bar-fill" style={{ width: `${(safe / 9) * 100}%` }} />
      </div>
      {justification && justification.length > 0 && (
        <ul className="tp-criterion-list">
          {justification.map((j, i) => <li key={i}>{j}</li>)}
        </ul>
      )}
    </div>
  );
}

function phonemeAccCI(pa) {
  const acc = Number(pa.overall_accuracy || 0);
  const lo = pa.overall_accuracy_lower;
  const hi = pa.overall_accuracy_upper;
  if (lo == null || hi == null) return `${(acc * 100).toFixed(0)}%`;
  const loF = Number(lo);
  const hiF = Number(hi);
  if (hiF - loF < 0.005) return `${(acc * 100).toFixed(0)}%`;
  return `${(acc * 100).toFixed(0)}% (95% CI ${(loF * 100).toFixed(0)}–${(hiF * 100).toFixed(0)}%)`;
}

function MeasuredFeaturesPanel({ profile }) {
  if (!profile) return null;
  // Read paths verified against the engine response shape — see
  // engine/main.py: feature_extraction.parselmouth.{formants,pitch,voice_quality},
  // prosodic_profile.rhythm, phoneme_analysis, cif_analysis.overall_cii.
  const parselmouth = (profile.feature_extraction || {}).parselmouth || {};
  const formants = parselmouth.formants || {};
  const pitch = parselmouth.pitch || {};
  const vq = parselmouth.voice_quality || {};
  const pp = profile.prosodic_profile || {};
  const rhythm = pp.rhythm || {};
  const pa = profile.phoneme_analysis || {};
  const cif = profile.cif_analysis || {};
  const fmt = (v, digits = 1, suffix = "") =>
    (v === null || v === undefined || Number.isNaN(Number(v))) ? "—" : `${Number(v).toFixed(digits)}${suffix}`;
  const rows = [
    ["Vowel acoustics — F1 mean (Hz)", fmt(formants.f1_mean, 0)],
    ["Vowel acoustics — F2 mean (Hz)", fmt(formants.f2_mean, 0)],
    ["Vowel space area (Hz²)",          fmt(pa.vowel_space_area || formants.vowel_space_area, 0)],
    ["Pitch — F0 mean (Hz)",            fmt(pitch.mean_f0, 1)],
    ["Pitch — F0 range (Hz)",           fmt(pitch.pitch_range, 1)],
    ["Voice quality — HNR (dB)",        fmt(vq.hnr, 1)],
    ["Voice quality — jitter (local)",  fmt(vq.jitter_local, 4)],
    ["Rhythm — nPVI-V",                 fmt(rhythm.npvi_v, 1)],
    ["Rhythm — %V (vocalic proportion)", fmt(rhythm.percent_v, 1)],
    ["Speech rate (syllables/sec)",     fmt(pp.speech_rate_syl_per_sec, 2)],
    ["Pause-to-speech ratio",           fmt(pp.pause_to_speech_ratio, 2)],
    ["Phoneme-level accuracy",          phonemeAccCI(pa)],
    ["L1 interference (CIF overall index)", fmt(cif.overall_cii, 2)],
  ];
  // Alignment quality flag — when MFA + WebMAUS both fell through to
  // whisper_g2p, phoneme-aligned features carry higher variance. Surface
  // it next to the table so the reader knows.
  const fa = profile.forced_alignment || {};
  const faQuality = fa.quality;
  const faNote =
    faQuality === "low"
      ? `Forced alignment ran on the ${fa.source || "g2p"} fallback (${fa.num_phones || 0} coarse phones). Phoneme-aligned features below carry higher variance.`
      : faQuality === "unavailable"
      ? "Forced alignment unavailable on this clip — phoneme-aligned features omitted."
      : null;
  return (
    <div className="tp-acoustic-features">
      <div className="tp-acoustic-features-head">Measured Acoustic Features</div>
      <div className="tp-acoustic-features-sub">
        Every value is computed from the audio signal. No predicted or population-average numbers are mixed in.
      </div>
      {faNote && <div className="tp-acoustic-features-note">{faNote}</div>}
      <table className="tp-acoustic-features-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IELTSBandCard({ result }) {
  if (!result || !result.ielts) return null;
  const ielts = result.ielts;
  // Detect acoustic-core release from either the explicit alias key or the
  // rubric's test_type marker. Both come from engine main.py — the alias is
  // a top-level field; test_type is set by ielts_rubric.compute_ielts_band.
  const isAcousticCore =
    !!result.acoustic_voice_profile ||
    ielts.test_type === "acoustic_voice_profile";

  if (isAcousticCore) {
    const pron = ielts.pronunciation || {};
    const pronBand = Number(pron.band || ielts.overall_band || 0);
    return (
      <div className="tp-card tp-card--report">
        <div className="tp-card-header">
          <div>
            <div className="tp-kicker">Acoustic Voice Profile</div>
            <div className="tp-card-title">Pronunciation Band {pronBand.toFixed(1)}</div>
            <div className="tp-card-sub">
              Measured pronunciation feedback from the audio signal — derived from formants, pitch, voice
              quality, rhythm, and phoneme-aligned acoustic events. Fluency, lexical resource, and grammatical
              range are not scored in this release; they require human assessment.
            </div>
          </div>
          <BandRing value={pronBand} max={9} />
        </div>

        <div className="tp-criteria-grid">
          <CriterionRow
            title="Pronunciation"
            band={pronBand}
            justification={pron.justification}
          />
        </div>

        <MeasuredFeaturesPanel profile={result.profile} />

        {ielts.notes && ielts.notes.length > 0 && (
          <div className="tp-notes">
            <div className="tp-notes-title">Notes on reliability</div>
            <ul>{ielts.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        )}
      </div>
    );
  }

  // Full mode (calibration / research path) — preserved for back-compat.
  return (
    <div className="tp-card tp-card--report">
      <div className="tp-card-header">
        <div>
          <div className="tp-kicker">IELTS Speaking — Automated Band Estimate</div>
          <div className="tp-card-title">Overall Band {ielts.overall_band.toFixed(1)}</div>
          <div className="tp-card-sub">
            Estimated from fluency, lexical, grammatical, and pronunciation features. Calibrated against public
            IELTS band descriptors. Not an official score.
          </div>
        </div>
        <BandRing value={ielts.overall_band} max={9} />
      </div>

      <div className="tp-criteria-grid">
        <CriterionRow
          title="Fluency and Coherence"
          band={ielts.fluency_coherence.band}
          justification={ielts.fluency_coherence.justification}
        />
        <CriterionRow
          title="Lexical Resource"
          band={ielts.lexical_resource.band}
          justification={ielts.lexical_resource.justification}
        />
        <CriterionRow
          title="Grammatical Range & Accuracy"
          band={ielts.grammatical_range.band}
          justification={ielts.grammatical_range.justification}
        />
        <CriterionRow
          title="Pronunciation"
          band={ielts.pronunciation.band}
          justification={ielts.pronunciation.justification}
        />
      </div>

      {ielts.notes && ielts.notes.length > 0 && (
        <div className="tp-notes">
          <div className="tp-notes-title">Notes on reliability</div>
          <ul>{ielts.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function TOEFLTaskCard({ result }) {
  if (!result || !result.toefl) return null;
  const t = result.toefl;
  const criteria = [
    { title: "Delivery", data: t.delivery },
    { title: "Language Use", data: t.language_use },
    { title: "Topic Development", data: t.topic_development },
  ];
  return (
    <div className="tp-card tp-card--report">
      <div className="tp-card-header">
        <div>
          <div className="tp-kicker">TOEFL iBT Speaking — Task {t.task_number}</div>
          <div className="tp-card-title">Task score {t.task_score.toFixed(1)} / 4</div>
          <div className="tp-card-sub">
            Repeat for all four tasks to estimate the 0–30 scaled section score.
          </div>
        </div>
        <BandRing value={t.task_score} max={4} />
      </div>

      <div className="tp-criteria-grid">
        {criteria.map((c) => (
          <div key={c.title} className="tp-criterion">
            <div className="tp-criterion-head">
              <span className="tp-criterion-title">{c.title}</span>
              <span className="tp-criterion-band">{c.data.score.toFixed(1)} / 4</span>
            </div>
            <div className="tp-criterion-bar">
              <div className="tp-criterion-bar-fill" style={{ width: `${(c.data.score / 4) * 100}%` }} />
            </div>
            {c.data.justification && c.data.justification.length > 0 && (
              <ul className="tp-criterion-list">
                {c.data.justification.map((j, i) => <li key={i}>{j}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>

      {t.notes && t.notes.length > 0 && (
        <div className="tp-notes">
          <div className="tp-notes-title">Notes on reliability</div>
          <ul>{t.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export default IELTSBandCard;
