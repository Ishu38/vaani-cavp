"""BHOJPURI-SPECIFIC PHONEME TARGETS AND INTERFERENCE PATTERNS

Bhojpuri phonological inventory and common L1→L2 transfer patterns
when Bhojpuri speakers produce English.

Based on:
- Bhojpuri has 6 vowels: /a, i, u, e, o, ə/
- Bhojpuri has aspirated/unaspirated contrast: /p-pʰ, t-tʰ, k-kʰ, b-bʰ, d-dʰ, g-gʰ/
- Bhojpuri has retroflex consonants: /ʈ, ɖ, ʈʰ, ɖʰ/
- Bhojpuri lacks: /θ, ð, ʃ (marginal), ʒ, æ, ɑ, ɔ, ʊ/
- Nasalization is phonemic in Bhojpuri vowels
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ── Bhojpuri vowel formant targets (adult, Hz) ──────────────────────────

BHOJPURI_VOWEL_FORMANTS: dict[str, tuple[float, float]] = {
    "a":  (700, 1200),   # open central
    "i":  (300, 2300),   # close front
    "u":  (320, 800),    # close back
    "e":  (450, 2000),   # mid front
    "o":  (450, 900),    # mid back
    "ə":  (500, 1500),   # schwa
}

# ── English vowel formant targets ────────────────────────────────────────

ENGLISH_VOWEL_FORMANTS: dict[str, tuple[float, float]] = {
    "iː": (270, 2290),   # /i:/ beat
    "ɪ":  (390, 1990),   # /ɪ/ bit
    "e":  (530, 1840),   # /ɛ/ bet
    "æ":  (660, 1720),   # /ae/ bat
    "ɑː": (730, 1090),  # /ɑ:/ father
    "ɒ":  (570, 840),    # /ɒ/ lot
    "ɔː": (570, 840),   # /ɔ:/ bought
    "ʊ":  (440, 1020),   # /ʊ/ book
    "uː": (300, 870),   # /u:/ boot
    "ʌ":  (640, 1190),   # /ʌ/ but
    "ɜː": (490, 1350),  # /ɜ:/ bird
    "ə":  (500, 1500),   # schwa
}


# ── Known Bhojpuri→English substitution patterns ────────────────────────

@dataclass
class SubstitutionPattern:
    english_target: str
    bhojpuri_substitute: str
    ipa_target: str
    ipa_substitute: str
    category: str           # "vowel", "consonant", "cluster", "prosody"
    description: str
    severity: str           # "high", "medium", "low"
    remediation: str


SUBSTITUTION_PATTERNS: list[SubstitutionPattern] = [
    # ── Consonant substitutions ──
    SubstitutionPattern(
        english_target="th (voiceless)", bhojpuri_substitute="t/tʰ",
        ipa_target="θ", ipa_substitute="t̪/t̪ʰ",
        category="consonant",
        description="English /θ/ ('think') replaced by dental /t/ or aspirated /tʰ/",
        severity="high",
        remediation="Practice tongue-between-teeth position. Drill: think, three, bath, math",
    ),
    SubstitutionPattern(
        english_target="th (voiced)", bhojpuri_substitute="d/dʰ",
        ipa_target="ð", ipa_substitute="d̪/d̪ʰ",
        category="consonant",
        description="English /ð/ ('the') replaced by dental /d/ or aspirated /dʰ/",
        severity="high",
        remediation="Practice voiced interdental. Drill: the, this, that, mother, father",
    ),
    SubstitutionPattern(
        english_target="v", bhojpuri_substitute="w/b",
        ipa_target="v", ipa_substitute="w/b",
        category="consonant",
        description="English /v/ replaced by /w/ or /b/ — Bhojpuri lacks labiodental /v/",
        severity="high",
        remediation="Practice upper teeth on lower lip. Drill: very, van, voice, vine vs wine",
    ),
    SubstitutionPattern(
        english_target="f", bhojpuri_substitute="pʰ",
        ipa_target="f", ipa_substitute="pʰ",
        category="consonant",
        description="English /f/ replaced by aspirated /pʰ/ — Bhojpuri lacks labiodental /f/",
        severity="medium",
        remediation="Practice teeth-on-lip friction. Drill: fish, phone, before, off",
    ),
    SubstitutionPattern(
        english_target="z", bhojpuri_substitute="j/dʒ",
        ipa_target="z", ipa_substitute="dʒ",
        category="consonant",
        description="English /z/ replaced by /dʒ/ — Bhojpuri lacks alveolar fricative /z/",
        severity="medium",
        remediation="Practice sustained buzzing. Drill: zoo, zero, buzz, easy",
    ),
    SubstitutionPattern(
        english_target="sh", bhojpuri_substitute="s/ʃ",
        ipa_target="ʃ", ipa_substitute="s",
        category="consonant",
        description="English /ʃ/ may be produced as /s/ — Bhojpuri /ʃ/ is marginal/borrowed",
        severity="medium",
        remediation="Practice tongue retraction. Drill: she, ship, push, fish",
    ),
    SubstitutionPattern(
        english_target="t (alveolar)", bhojpuri_substitute="ʈ (retroflex)",
        ipa_target="t", ipa_substitute="ʈ",
        category="consonant",
        description="English alveolar /t/ replaced by Bhojpuri retroflex /ʈ/ — strong L1 transfer",
        severity="high",
        remediation="Practice tongue tip on alveolar ridge (just behind teeth). Drill: table, time, butter, water",
    ),
    SubstitutionPattern(
        english_target="d (alveolar)", bhojpuri_substitute="ɖ (retroflex)",
        ipa_target="d", ipa_substitute="ɖ",
        category="consonant",
        description="English alveolar /d/ replaced by Bhojpuri retroflex /ɖ/",
        severity="high",
        remediation="Practice tongue tip on alveolar ridge. Drill: dog, day, ladder, add",
    ),
    SubstitutionPattern(
        english_target="w", bhojpuri_substitute="v/w merged",
        ipa_target="w", ipa_substitute="ʋ",
        category="consonant",
        description="English /w/-/v/ distinction collapsed — both produced as labio-dental approximant /ʋ/",
        severity="high",
        remediation="Practice: /w/ = rounded lips (no teeth), /v/ = teeth on lip. Minimal pairs: wine-vine, west-vest, wet-vet",
    ),

    # ── Vowel substitutions ──
    SubstitutionPattern(
        english_target="/æ/ (bat)", bhojpuri_substitute="/a/ or /e/",
        ipa_target="æ", ipa_substitute="a/e",
        category="vowel",
        description="English /ae/ not in Bhojpuri — produced as open /a/ or mid /e/",
        severity="high",
        remediation="Practice jaw lowering with front tongue. Drill: cat, bat, man, bad (not bed/bod)",
    ),
    SubstitutionPattern(
        english_target="/ɒ/ (lot)", bhojpuri_substitute="/a/ or /o/",
        ipa_target="ɒ", ipa_substitute="a/o",
        category="vowel",
        description="English /ɒ/ not in Bhojpuri — produced as /a/ or /o/",
        severity="medium",
        remediation="Practice rounded open back vowel. Drill: hot, lot, what, stop",
    ),
    SubstitutionPattern(
        english_target="/ʌ/ (but)", bhojpuri_substitute="/a/",
        ipa_target="ʌ", ipa_substitute="a",
        category="vowel",
        description="English /ʌ/ merged with Bhojpuri /a/",
        severity="medium",
        remediation="Practice shortened, centralized vowel. Drill: but, cut, up, love",
    ),
    SubstitutionPattern(
        english_target="/ɜː/ (bird)", bhojpuri_substitute="/ar/ or /a/",
        ipa_target="ɜː", ipa_substitute="ar",
        category="vowel",
        description="Rhotic vowel /ɜː/ replaced by /ar/ or open /a/",
        severity="medium",
        remediation="Practice mid-central tongue position. Drill: bird, word, girl, turn",
    ),

    # ── Cluster and prosodic patterns ──
    SubstitutionPattern(
        english_target="initial clusters (str-, spl-)", bhojpuri_substitute="vowel insertion",
        ipa_target="str", ipa_substitute="sətr/istri",
        category="cluster",
        description="Bhojpuri lacks initial consonant clusters — epenthetic vowel inserted (school→iskool, street→istreet)",
        severity="high",
        remediation="Practice blending consonants without vowel insertion. Drill: str, spl, scr words slowly",
    ),
    SubstitutionPattern(
        english_target="final clusters (-nd, -st, -lk)", bhojpuri_substitute="cluster reduction",
        ipa_target="nd", ipa_substitute="n",
        category="cluster",
        description="Final consonant clusters simplified — 'friend'→'frien', 'fast'→'fas'",
        severity="medium",
        remediation="Practice final consonant release. Drill: hand, fast, milk, next",
    ),
    SubstitutionPattern(
        english_target="aspiration timing", bhojpuri_substitute="over-aspiration",
        ipa_target="p t k", ipa_substitute="pʰ tʰ kʰ",
        category="prosody",
        description="Bhojpuri aspirated/unaspirated contrast causes over-aspiration in English voiceless stops",
        severity="low",
        remediation="English aspiration is automatic in initial position — reduce conscious aspiration effort",
    ),
    SubstitutionPattern(
        english_target="stress-timed rhythm", bhojpuri_substitute="syllable-timed",
        ipa_target="stress-timed", ipa_substitute="syllable-timed",
        category="prosody",
        description="Bhojpuri is syllable-timed — transfers to English making speech sound 'flat' and monotonous",
        severity="high",
        remediation="Practice stress patterns: STRONG-weak-weak. Drill: 'beauTIful', 'comPUter', 'underSTAND'",
    ),
    SubstitutionPattern(
        english_target="vowel reduction (schwa)", bhojpuri_substitute="full vowel",
        ipa_target="ə", ipa_substitute="a/i",
        category="prosody",
        description="Unstressed English syllables should reduce to schwa but Bhojpuri speakers use full vowels",
        severity="medium",
        remediation="Practice: 'a-BOUT' (not 'A-bout'), 'to-DAY' (not 'TOO-day')",
    ),
]


# ── Acoustic markers of Bhojpuri interference ───────────────────────────

@dataclass
class InterferenceMarker:
    feature: str
    bhojpuri_range: tuple[float, float]
    english_range: tuple[float, float]
    description: str


ACOUSTIC_INTERFERENCE_MARKERS: list[InterferenceMarker] = [
    InterferenceMarker(
        feature="F3-F2 difference (retroflex)",
        bhojpuri_range=(200, 600),
        english_range=(800, 1500),
        description="Small F3-F2 gap indicates retroflex production (Bhojpuri L1 transfer)",
    ),
    InterferenceMarker(
        feature="VOT for /p,t,k/",
        bhojpuri_range=(60, 120),   # over-aspirated
        english_range=(30, 70),
        description="Extended VOT indicates Bhojpuri aspiration contrast transferring",
    ),
    InterferenceMarker(
        feature="nPVI (rhythm)",
        bhojpuri_range=(25, 40),    # syllable-timed
        english_range=(50, 70),     # stress-timed
        description="Low nPVI indicates syllable-timed rhythm (Bhojpuri L1) instead of stress-timed (English)",
    ),
    InterferenceMarker(
        feature="F1 for /æ/",
        bhojpuri_range=(600, 700),  # produced as /a/
        english_range=(660, 860),
        description="Lower F1 for /æ/ suggests merger with Bhojpuri /a/",
    ),
    InterferenceMarker(
        feature="Nasalization bandwidth",
        bhojpuri_range=(150, 300),  # wider = more nasal
        english_range=(50, 120),
        description="Wide F1 bandwidth indicates nasalization transfer from Bhojpuri",
    ),
]


def detect_bhojpuri_interference(
    formant_data: dict[str, Any],
    pitch_data: dict[str, Any],
    rhythm_data: dict[str, Any],
    phoneme_spans: list[dict[str, Any]],
) -> dict[str, Any]:
    """Detect specific Bhojpuri L1 interference patterns in English L2 production."""
    detected_patterns: list[dict[str, Any]] = []
    interference_score = 0.0
    total_checks = 0

    # 1. Retroflex detection (F3-F2 gap)
    f3 = formant_data.get("f3_mean", 0)
    f2 = formant_data.get("f2_mean", 0)
    f3_f2_gap = abs(f3 - f2)
    total_checks += 1
    if f3_f2_gap < 800:
        interference_score += 15
        detected_patterns.append({
            "pattern": "retroflex_transfer",
            "evidence": f"F3-F2 gap = {f3_f2_gap:.0f} Hz (expected >800 for English alveolar)",
            "severity": "high",
            "remediation": "Child is using retroflex tongue position — practice alveolar placement for /t/, /d/",
        })

    # 2. Rhythm check (nPVI)
    npvi = rhythm_data.get("npvi_v", 0)
    total_checks += 1
    if npvi < 45:
        interference_score += 20
        detected_patterns.append({
            "pattern": "syllable_timed_rhythm",
            "evidence": f"nPVI = {npvi:.1f} (Bhojpuri-like syllable timing, English target >50)",
            "severity": "high",
            "remediation": "Practice stress-timed rhythm: emphasize stressed syllables, reduce unstressed ones",
        })

    # 3. Nasalization check
    bw_f1 = formant_data.get("bandwidth_f1", 0)
    total_checks += 1
    if bw_f1 > 150:
        interference_score += 10
        detected_patterns.append({
            "pattern": "nasalization_transfer",
            "evidence": f"F1 bandwidth = {bw_f1:.0f} Hz (Bhojpuri nasal vowels transferring)",
            "severity": "medium",
            "remediation": "Practice oral vowels — velum should close for non-nasal English vowels",
        })

    # 4. Over-aspiration check (if pitch data shows energy bursts)
    pitch_std = pitch_data.get("std_f0", 0)
    mean_f0 = pitch_data.get("mean_f0", 0)
    total_checks += 1
    if mean_f0 > 0 and pitch_std / mean_f0 < 0.1:
        interference_score += 10
        detected_patterns.append({
            "pattern": "monotone_intonation",
            "evidence": f"Pitch CV = {pitch_std/mean_f0:.3f} (flat intonation, Bhojpuri transfer)",
            "severity": "medium",
            "remediation": "Practice English intonation patterns: rising for questions, falling for statements",
        })

    # 5. Vowel space compression
    vsa = formant_data.get("vowel_space_area", 0)
    total_checks += 1
    if vsa < 150000:
        interference_score += 15
        detected_patterns.append({
            "pattern": "vowel_space_compression",
            "evidence": f"Vowel space area = {vsa:.0f} Hz² (Bhojpuri has 6 vowels, English needs 12+)",
            "severity": "high",
            "remediation": "Practice English vowel contrasts: bit vs beat vs bat vs bet vs but vs bot",
        })

    # 6. Schwa reduction failure
    rhythm_class = rhythm_data.get("rhythm_class", "")
    percent_v = rhythm_data.get("percent_v", 50)
    total_checks += 1
    if percent_v > 55:
        interference_score += 10
        detected_patterns.append({
            "pattern": "no_vowel_reduction",
            "evidence": f"%V = {percent_v:.1f}% (high vocalic proportion — unstressed vowels not being reduced)",
            "severity": "medium",
            "remediation": "Practice schwa in unstressed syllables: 'a-BOUT', 'to-GE-ther', 'ba-NA-na'",
        })

    # Match detected phonemes against known substitution patterns
    matched_substitutions: list[dict[str, str]] = []
    phoneme_set = {p.get("phoneme", "").upper() for p in phoneme_spans}
    for pat in SUBSTITUTION_PATTERNS:
        if pat.category == "consonant":
            matched_substitutions.append({
                "target": pat.english_target,
                "likely_substitute": pat.bhojpuri_substitute,
                "severity": pat.severity,
                "remediation": pat.remediation,
            })

    # Normalize score
    interference_score = min(100, interference_score)

    return {
        "bhojpuri_interference_score": round(interference_score, 2),
        "detected_patterns": detected_patterns,
        "known_substitutions": matched_substitutions,
        "acoustic_markers_checked": total_checks,
        "patterns_found": len(detected_patterns),
        "bhojpuri_vowel_system": BHOJPURI_VOWEL_FORMANTS,
        "english_vowel_targets": ENGLISH_VOWEL_FORMANTS,
        "risk_areas": [p["pattern"] for p in detected_patterns],
    }
