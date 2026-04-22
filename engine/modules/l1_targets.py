"""MULTI-LANGUAGE L1 INTERFERENCE TARGETS AND PATTERNS

Phonological inventories and common L1->L2 (English) transfer patterns
for Eastern Indian languages: Bhojpuri, Hindi, Bangla, Odia.

Each L1Profile contains vowel formants, substitution patterns,
and acoustic interference markers specific to that language.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ── Shared dataclasses ────────────────────────────────────────────────────

@dataclass
class SubstitutionPattern:
    english_target: str
    l1_substitute: str
    ipa_target: str
    ipa_substitute: str
    category: str           # "vowel", "consonant", "cluster", "prosody"
    description: str
    severity: str           # "high", "medium", "low"
    remediation: str


@dataclass
class InterferenceMarker:
    feature: str
    l1_range: tuple[float, float]
    english_range: tuple[float, float]
    description: str


@dataclass
class L1Profile:
    code: str               # "bho", "hin", "ben", "ori"
    display_name: str       # "Bhojpuri", "Hindi", "Bangla", "Odia"
    iso_639: str            # "bh", "hi", "bn", "or"
    vowel_count: int
    vowel_formants: dict[str, tuple[float, float]]   # vowel -> (F1, F2)
    substitution_patterns: list[SubstitutionPattern]
    acoustic_markers: list[InterferenceMarker]
    rhythm_type: str        # "syllable-timed", "mora-timed"


# ── English L2 targets (shared across all L1s) ──────────────────────────

ENGLISH_VOWEL_FORMANTS: dict[str, tuple[float, float]] = {
    "i:": (270, 2290),   # beat
    "I":  (390, 1990),   # bit
    "e":  (530, 1840),   # bet
    "ae": (660, 1720),   # bat
    "A:": (730, 1090),   # father
    "Q":  (570, 840),    # lot
    "O:": (570, 840),    # bought
    "U":  (440, 1020),   # book
    "u:": (300, 870),    # boot
    "V":  (640, 1190),   # but
    "3:": (490, 1350),   # bird
    "@":  (500, 1500),   # schwa
}


# ═══════════════════════════════════════════════════════════════════════════
#  BHOJPURI
# ═══════════════════════════════════════════════════════════════════════════

_BHOJPURI_VOWELS: dict[str, tuple[float, float]] = {
    "a":  (700, 1200),   # open central
    "i":  (300, 2300),   # close front
    "u":  (320, 800),    # close back
    "e":  (450, 2000),   # mid front
    "o":  (450, 900),    # mid back
    "@":  (500, 1500),   # schwa
}

_BHOJPURI_PATTERNS: list[SubstitutionPattern] = [
    SubstitutionPattern("th (voiceless)", "t/th", "0", "t/th", "consonant",
        "English /0/ ('think') replaced by dental /t/ or aspirated /th/", "high",
        "Practice tongue-between-teeth position. Drill: think, three, bath, math"),
    SubstitutionPattern("th (voiced)", "d/dh", "D", "d/dh", "consonant",
        "English /D/ ('the') replaced by dental /d/ or aspirated /dh/", "high",
        "Practice voiced interdental. Drill: the, this, that, mother, father"),
    SubstitutionPattern("v", "w/b", "v", "w/b", "consonant",
        "English /v/ replaced by /w/ or /b/ -- Bhojpuri lacks labiodental /v/", "high",
        "Practice upper teeth on lower lip. Drill: very, van, voice, vine vs wine"),
    SubstitutionPattern("f", "ph", "f", "ph", "consonant",
        "English /f/ replaced by aspirated /ph/ -- Bhojpuri lacks labiodental /f/", "medium",
        "Practice teeth-on-lip friction. Drill: fish, phone, before, off"),
    SubstitutionPattern("z", "j/dZ", "z", "dZ", "consonant",
        "English /z/ replaced by /dZ/ -- Bhojpuri lacks alveolar fricative /z/", "medium",
        "Practice sustained buzzing. Drill: zoo, zero, buzz, easy"),
    SubstitutionPattern("sh", "s", "S", "s", "consonant",
        "English /S/ may be produced as /s/ -- Bhojpuri /S/ is marginal", "medium",
        "Practice tongue retraction. Drill: she, ship, push, fish"),
    SubstitutionPattern("t (alveolar)", "T (retroflex)", "t", "T", "consonant",
        "English alveolar /t/ replaced by retroflex /T/ -- strong L1 transfer", "high",
        "Practice tongue tip on alveolar ridge. Drill: table, time, butter, water"),
    SubstitutionPattern("d (alveolar)", "D (retroflex)", "d", "D", "consonant",
        "English alveolar /d/ replaced by retroflex /D/", "high",
        "Practice tongue tip on alveolar ridge. Drill: dog, day, ladder, add"),
    SubstitutionPattern("w", "v/w merged", "w", "V", "consonant",
        "English /w/-/v/ distinction collapsed -- both as labio-dental approximant", "high",
        "Practice: /w/ = rounded lips, /v/ = teeth on lip. Minimal pairs: wine-vine, west-vest"),
    SubstitutionPattern("/ae/ (bat)", "/a/ or /e/", "ae", "a/e", "vowel",
        "English /ae/ not in Bhojpuri -- produced as open /a/ or mid /e/", "high",
        "Practice jaw lowering with front tongue. Drill: cat, bat, man, bad"),
    SubstitutionPattern("/Q/ (lot)", "/a/ or /o/", "Q", "a/o", "vowel",
        "English /Q/ not in Bhojpuri -- produced as /a/ or /o/", "medium",
        "Practice rounded open back vowel. Drill: hot, lot, what, stop"),
    SubstitutionPattern("/V/ (but)", "/a/", "V", "a", "vowel",
        "English /V/ merged with Bhojpuri /a/", "medium",
        "Practice shortened centralized vowel. Drill: but, cut, up, love"),
    SubstitutionPattern("/3:/ (bird)", "/ar/ or /a/", "3:", "ar", "vowel",
        "Rhotic vowel /3:/ replaced by /ar/ or open /a/", "medium",
        "Practice mid-central tongue position. Drill: bird, word, girl, turn"),
    SubstitutionPattern("initial clusters (str-, spl-)", "vowel insertion", "str", "istr", "cluster",
        "Bhojpuri lacks initial clusters -- epenthetic vowel (school->iskool)", "high",
        "Practice blending consonants without vowel insertion. Drill: str, spl, scr words slowly"),
    SubstitutionPattern("final clusters (-nd, -st)", "cluster reduction", "nd", "n", "cluster",
        "Final clusters simplified -- 'friend'->'frien', 'fast'->'fas'", "medium",
        "Practice final consonant release. Drill: hand, fast, milk, next"),
    SubstitutionPattern("stress-timed rhythm", "syllable-timed", "stress", "syllable", "prosody",
        "Bhojpuri is syllable-timed -- English sounds flat and monotonous", "high",
        "Practice stress: STRONG-weak-weak. Drill: beauTIful, comPUter, underSTAND"),
    SubstitutionPattern("vowel reduction (schwa)", "full vowel", "@", "a/i", "prosody",
        "Unstressed syllables should reduce to schwa but Bhojpuri speakers use full vowels", "medium",
        "Practice: 'a-BOUT' (not 'A-bout'), 'to-DAY' (not 'TOO-day')"),
]

_BHOJPURI_MARKERS: list[InterferenceMarker] = [
    InterferenceMarker("F3-F2 difference (retroflex)", (200, 600), (800, 1500),
        "Small F3-F2 gap indicates retroflex production (L1 transfer)"),
    InterferenceMarker("VOT for /p,t,k/", (60, 120), (30, 70),
        "Extended VOT indicates aspiration contrast transferring"),
    InterferenceMarker("nPVI (rhythm)", (25, 40), (50, 70),
        "Low nPVI indicates syllable-timed rhythm instead of stress-timed"),
    InterferenceMarker("F1 for /ae/", (600, 700), (660, 860),
        "Lower F1 for /ae/ suggests merger with L1 /a/"),
    InterferenceMarker("Nasalization bandwidth", (150, 300), (50, 120),
        "Wide F1 bandwidth indicates nasalization transfer"),
]


# ═══════════════════════════════════════════════════════════════════════════
#  HINDI
# ═══════════════════════════════════════════════════════════════════════════

_HINDI_VOWELS: dict[str, tuple[float, float]] = {
    "a":  (710, 1240),   # open central
    "a:": (720, 1220),   # long open central
    "i":  (310, 2250),   # close front
    "i:": (280, 2350),   # long close front
    "u":  (330, 850),    # close back
    "u:": (310, 820),    # long close back
    "e":  (440, 2050),   # mid front
    "o":  (460, 920),    # mid back
    "@":  (500, 1500),   # schwa
    "ae": (620, 1700),   # near-open front (marginal/borrowed)
}

_HINDI_PATTERNS: list[SubstitutionPattern] = [
    SubstitutionPattern("th (voiceless)", "t/th", "0", "t/th", "consonant",
        "English /0/ replaced by dental /t/ or aspirated /th/ -- Hindi lacks interdentals", "high",
        "Practice tongue-between-teeth. Drill: think, three, math, bath"),
    SubstitutionPattern("th (voiced)", "d/dh", "D", "d/dh", "consonant",
        "English /D/ replaced by dental /d/ or aspirated /dh/", "high",
        "Practice voiced interdental. Drill: the, this, mother, father"),
    SubstitutionPattern("t (alveolar)", "T (retroflex)", "t", "T", "consonant",
        "English alveolar /t/ replaced by retroflex /T/ -- Hindi retroflex transfer", "high",
        "Practice tongue on alveolar ridge, not curled back. Drill: table, time, water"),
    SubstitutionPattern("d (alveolar)", "D (retroflex)", "d", "D", "consonant",
        "English alveolar /d/ replaced by retroflex /D/", "high",
        "Practice tongue on alveolar ridge. Drill: dog, day, ladder"),
    SubstitutionPattern("z", "j/dZ", "z", "dZ", "consonant",
        "English /z/ often replaced by /dZ/ -- Hindi /z/ exists but mainly in loanwords", "medium",
        "Practice alveolar buzzing. Drill: zoo, zero, buzz, easy"),
    SubstitutionPattern("/ae/ (bat)", "/e/ or /a/", "ae", "e/a", "vowel",
        "English /ae/ produced closer to Hindi /e/ or /a/ -- marginal in Hindi phonology", "medium",
        "Practice jaw lowering. Drill: cat, bat, man, bad vs bed vs bud"),
    SubstitutionPattern("/V/ (but)", "/a/", "V", "a", "vowel",
        "English /V/ often merged with Hindi short /a/", "medium",
        "Practice centralized unrounded vowel. Drill: but, cut, up, love"),
    SubstitutionPattern("/Q/ (lot)", "/O/ or /a/", "Q", "O/a", "vowel",
        "English /Q/ produced as Hindi /O/ or /a/", "medium",
        "Practice open rounded back vowel. Drill: hot, lot, stop"),
    SubstitutionPattern("initial clusters (str-, spl-)", "vowel insertion", "str", "istr", "cluster",
        "Hindi speakers may insert epenthetic vowel in complex onsets", "medium",
        "Practice smooth blending without vowel insertion"),
    SubstitutionPattern("final clusters (-nd, -st)", "cluster simplification", "nd", "n(d)", "cluster",
        "Final clusters may be simplified -- 'and'->'an', 'best'->'bes'", "medium",
        "Practice releasing final consonants. Drill: hand, best, milk"),
    SubstitutionPattern("stress-timed rhythm", "syllable-timed", "stress", "syllable", "prosody",
        "Hindi is syllable-timed -- English rhythm sounds flattened", "high",
        "Practice English stress patterns: BEAUtiful, comPUter, underSTAND"),
    SubstitutionPattern("vowel reduction", "full vowel", "@", "a/i", "prosody",
        "Unstressed syllables retain full vowel quality instead of reducing to schwa", "medium",
        "Practice schwa in unstressed syllables: a-BOUT, to-GE-ther"),
]

_HINDI_MARKERS: list[InterferenceMarker] = [
    InterferenceMarker("F3-F2 difference (retroflex)", (200, 600), (800, 1500),
        "Small F3-F2 gap indicates retroflex transfer from Hindi"),
    InterferenceMarker("VOT for /p,t,k/", (50, 110), (30, 70),
        "Hindi aspirated/unaspirated contrast may cause over-aspiration"),
    InterferenceMarker("nPVI (rhythm)", (28, 42), (50, 70),
        "Low nPVI indicates syllable-timed rhythm from Hindi"),
    InterferenceMarker("F1 for /ae/", (580, 680), (660, 860),
        "Lower F1 for /ae/ indicates Hindi /e/-/a/ substitution"),
    InterferenceMarker("Schwa deletion", (0, 0), (0, 0),
        "Hindi schwa deletion rules may transfer creating unexpected consonant clusters"),
]


# ═══════════════════════════════════════════════════════════════════════════
#  BANGLA
# ═══════════════════════════════════════════════════════════════════════════

_BANGLA_VOWELS: dict[str, tuple[float, float]] = {
    "a":  (680, 1250),   # open central
    "i":  (310, 2280),   # close front
    "u":  (330, 830),    # close back
    "e":  (460, 2000),   # mid front (close-mid)
    "ae": (580, 1780),   # open-mid front
    "o":  (470, 910),    # mid back (close-mid)
    "O":  (600, 850),    # open-mid back
}

_BANGLA_PATTERNS: list[SubstitutionPattern] = [
    SubstitutionPattern("th (voiceless)", "t/th", "0", "t/th", "consonant",
        "English /0/ replaced by dental /t/ or aspirated /th/ -- Bangla lacks interdentals", "high",
        "Practice tongue-between-teeth. Drill: think, three, bath"),
    SubstitutionPattern("th (voiced)", "d/dh", "D", "d/dh", "consonant",
        "English /D/ replaced by dental /d/ or /dh/", "high",
        "Practice voiced interdental. Drill: the, this, mother"),
    SubstitutionPattern("v", "bh", "v", "bh", "consonant",
        "English /v/ replaced by aspirated /bh/ -- Bangla lacks labiodental /v/", "high",
        "Practice upper teeth on lower lip. Drill: very, van, voice, vine"),
    SubstitutionPattern("f", "ph", "f", "ph", "consonant",
        "English /f/ replaced by aspirated /ph/", "medium",
        "Practice labiodental friction. Drill: fish, phone, off"),
    SubstitutionPattern("z", "j/dZ", "z", "dZ", "consonant",
        "English /z/ replaced by affricate /dZ/", "medium",
        "Practice sustained buzzing. Drill: zoo, zero, buzz"),
    SubstitutionPattern("w", "o/u glide", "w", "o", "consonant",
        "English /w/ may be produced as back vowel glide rather than bilabial approximant", "medium",
        "Practice lip rounding with bilabial closure. Drill: water, want, we"),
    SubstitutionPattern("t (alveolar)", "T (retroflex)", "t", "T", "consonant",
        "English alveolar /t/ replaced by retroflex /T/ -- Bangla has retroflexes", "high",
        "Practice tongue on alveolar ridge. Drill: table, time, water"),
    SubstitutionPattern("/ae/ (bat)", "/a/ or /ae/", "ae", "a/ae", "vowel",
        "English /ae/ may be produced as Bangla open /a/ -- inconsistent", "medium",
        "Practice front open vowel. Drill: cat, bat, man"),
    SubstitutionPattern("/V/ (but)", "/a/", "V", "a", "vowel",
        "English /V/ merged with open /a/", "medium",
        "Practice centralized vowel. Drill: but, cut, up"),
    SubstitutionPattern("/3:/ (bird)", "/ar/", "3:", "ar", "vowel",
        "Rhotic vowel replaced by /ar/ sequence", "medium",
        "Practice mid-central position. Drill: bird, word, girl"),
    SubstitutionPattern("initial clusters (str-, spl-)", "vowel insertion", "str", "istr", "cluster",
        "Bangla speakers insert epenthetic vowel -- 'school'->'iskul'", "high",
        "Practice consonant blending without inserted vowel"),
    SubstitutionPattern("final clusters (-nd, -st)", "cluster reduction", "nd", "n", "cluster",
        "Final clusters simplified -- 'friend'->'fren'", "medium",
        "Practice final consonant release. Drill: hand, fast, help"),
    SubstitutionPattern("stress-timed rhythm", "syllable-timed", "stress", "syllable", "prosody",
        "Bangla is syllable-timed -- English rhythm sounds monotonous", "high",
        "Practice English stress: BEAUtiful, comPUter"),
    SubstitutionPattern("vowel nasalization", "oral vowel", "V~", "V", "prosody",
        "Bangla phonemic nasalization may transfer to English vowels near nasals", "low",
        "Practice oral vowels before and after nasal consonants"),
]

_BANGLA_MARKERS: list[InterferenceMarker] = [
    InterferenceMarker("F3-F2 difference (retroflex)", (250, 650), (800, 1500),
        "Small F3-F2 gap indicates retroflex transfer"),
    InterferenceMarker("VOT for /p,t,k/", (55, 115), (30, 70),
        "Aspiration contrast may cause over-aspiration"),
    InterferenceMarker("nPVI (rhythm)", (25, 38), (50, 70),
        "Low nPVI indicates syllable-timed Bangla rhythm"),
    InterferenceMarker("F1 for /ae/", (580, 680), (660, 860),
        "Lower F1 for /ae/ indicates L1 /a/ substitution"),
    InterferenceMarker("Nasalization bandwidth", (140, 280), (50, 120),
        "Wide F1 bandwidth indicates nasalization from Bangla"),
]


# ═══════════════════════════════════════════════════════════════════════════
#  ODIA
# ═══════════════════════════════════════════════════════════════════════════

_ODIA_VOWELS: dict[str, tuple[float, float]] = {
    "a":  (690, 1210),   # open central
    "i":  (310, 2270),   # close front
    "u":  (340, 820),    # close back
    "e":  (440, 1980),   # mid front
    "o":  (460, 880),    # mid back
    "@":  (510, 1480),   # schwa
}

_ODIA_PATTERNS: list[SubstitutionPattern] = [
    SubstitutionPattern("th (voiceless)", "t/th", "0", "t/th", "consonant",
        "English /0/ replaced by dental /t/ or aspirated /th/ -- Odia lacks interdentals", "high",
        "Practice tongue-between-teeth. Drill: think, three, bath"),
    SubstitutionPattern("th (voiced)", "d/dh", "D", "d/dh", "consonant",
        "English /D/ replaced by dental /d/ or /dh/", "high",
        "Practice voiced interdental. Drill: the, this, mother"),
    SubstitutionPattern("v", "b/w", "v", "b/w", "consonant",
        "English /v/ replaced by /b/ or /w/ -- Odia lacks labiodental /v/", "high",
        "Practice upper teeth on lower lip. Drill: very, van, voice"),
    SubstitutionPattern("f", "ph", "f", "ph", "consonant",
        "English /f/ replaced by aspirated /ph/ -- Odia lacks /f/", "medium",
        "Practice labiodental friction. Drill: fish, phone, off"),
    SubstitutionPattern("t (alveolar)", "T (retroflex)", "t", "T", "consonant",
        "English alveolar /t/ replaced by Odia retroflex /T/ -- strong transfer", "high",
        "Practice tongue tip on alveolar ridge. Drill: table, time, water"),
    SubstitutionPattern("d (alveolar)", "D (retroflex)", "d", "D", "consonant",
        "English alveolar /d/ replaced by retroflex /D/", "high",
        "Practice tongue on alveolar ridge. Drill: dog, day, ladder"),
    SubstitutionPattern("z", "j/dZ", "z", "dZ", "consonant",
        "English /z/ replaced by /dZ/ -- Odia lacks /z/", "medium",
        "Practice sustained buzzing. Drill: zoo, zero, buzz"),
    SubstitutionPattern("sh", "s", "S", "s", "consonant",
        "English /S/ produced as /s/ -- Odia /S/ is marginal", "medium",
        "Practice tongue retraction. Drill: she, ship, push"),
    SubstitutionPattern("/ae/ (bat)", "/a/ or /e/", "ae", "a/e", "vowel",
        "English /ae/ not in Odia -- produced as /a/ or /e/", "high",
        "Practice jaw lowering with front tongue. Drill: cat, bat, man"),
    SubstitutionPattern("/Q/ (lot)", "/a/ or /o/", "Q", "a/o", "vowel",
        "English /Q/ produced as /a/ or /o/", "medium",
        "Practice rounded open back vowel. Drill: hot, lot, stop"),
    SubstitutionPattern("/V/ (but)", "/a/", "V", "a", "vowel",
        "English /V/ merged with Odia /a/", "medium",
        "Practice centralized vowel. Drill: but, cut, up, love"),
    SubstitutionPattern("initial clusters (str-, spl-)", "vowel insertion", "str", "istr", "cluster",
        "Odia speakers insert epenthetic vowel in complex onsets", "high",
        "Practice consonant blending. Drill: str, spl, scr words"),
    SubstitutionPattern("final clusters (-nd, -st)", "cluster reduction", "nd", "n", "cluster",
        "Final clusters simplified -- 'best'->'bes'", "medium",
        "Practice final consonant release. Drill: hand, fast, help"),
    SubstitutionPattern("stress-timed rhythm", "syllable-timed", "stress", "syllable", "prosody",
        "Odia is syllable-timed -- English rhythm sounds monotonous", "high",
        "Practice stress: STRONG-weak-weak. Drill: beauTIful, comPUter"),
    SubstitutionPattern("vowel reduction", "full vowel", "@", "a/i", "prosody",
        "Unstressed syllables retain full vowel quality", "medium",
        "Practice schwa reduction: a-BOUT, to-GE-ther, ba-NA-na"),
]

_ODIA_MARKERS: list[InterferenceMarker] = [
    InterferenceMarker("F3-F2 difference (retroflex)", (200, 580), (800, 1500),
        "Small F3-F2 gap indicates strong retroflex transfer from Odia"),
    InterferenceMarker("VOT for /p,t,k/", (55, 115), (30, 70),
        "Aspiration contrast transferring from Odia"),
    InterferenceMarker("nPVI (rhythm)", (25, 40), (50, 70),
        "Low nPVI indicates syllable-timed Odia rhythm"),
    InterferenceMarker("F1 for /ae/", (590, 690), (660, 860),
        "Lower F1 for /ae/ suggests merger with Odia /a/"),
    InterferenceMarker("Nasalization bandwidth", (130, 260), (50, 120),
        "Wide F1 bandwidth indicates nasalization transfer from Odia"),
]


# ═══════════════════════════════════════════════════════════════════════════
#  TAMIL (Dravidian)
# ═══════════════════════════════════════════════════════════════════════════

_TAMIL_VOWELS: dict[str, tuple[float, float]] = {
    "a":  (700, 1210),   # short open central
    "a:": (720, 1200),   # long open central
    "i":  (300, 2300),   # short close front
    "i:": (280, 2360),   # long close front
    "u":  (330, 820),    # short close back
    "u:": (310, 800),    # long close back
    "e":  (450, 2000),   # short mid front
    "e:": (430, 2050),   # long mid front
    "o":  (460, 900),    # short mid back
    "o:": (450, 920),    # long mid back
}

_TAMIL_PATTERNS: list[SubstitutionPattern] = [
    SubstitutionPattern("th (voiceless)", "t", "0", "t", "consonant",
        "English /0/ replaced by dental /t/ -- Tamil lacks interdentals", "high",
        "Practice tongue-between-teeth. Drill: think, three, bath"),
    SubstitutionPattern("th (voiced)", "d", "D", "d", "consonant",
        "English /D/ replaced by dental /d/", "high",
        "Practice voiced interdental. Drill: the, this, mother"),
    SubstitutionPattern("f", "p", "f", "p", "consonant",
        "English /f/ replaced by /p/ -- Tamil lacks /f/", "high",
        "Practice labiodental friction. Drill: fish, phone, off"),
    SubstitutionPattern("v", "V (labio-velar)", "v", "V", "consonant",
        "English /v/ produced as Tamil labio-velar /ʋ/", "medium",
        "Practice teeth on lower lip with voicing. Drill: very, van, voice"),
    SubstitutionPattern("z", "s/dZ", "z", "s", "consonant",
        "English /z/ replaced by /s/ -- Tamil lacks /z/", "medium",
        "Practice sustained voicing. Drill: zoo, zero, easy"),
    SubstitutionPattern("sh", "s", "S", "s", "consonant",
        "English /S/ produced as /s/ -- Tamil /ʃ/ is marginal", "medium",
        "Practice tongue retraction. Drill: she, ship, fish"),
    SubstitutionPattern("t (alveolar)", "T (retroflex)", "t", "T", "consonant",
        "English alveolar /t/ replaced by Tamil retroflex /T/", "high",
        "Practice alveolar placement. Drill: table, time, butter"),
    SubstitutionPattern("d (alveolar)", "D (retroflex)", "d", "D", "consonant",
        "English alveolar /d/ replaced by retroflex /D/", "high",
        "Practice alveolar placement. Drill: dog, day, ladder"),
    SubstitutionPattern("/ae/ (bat)", "/e/ or /a/", "ae", "e/a", "vowel",
        "English /ae/ not in Tamil -- produced as /e/ or /a/", "high",
        "Practice jaw lowering with front tongue. Drill: cat, bat, man"),
    SubstitutionPattern("/Q/ (lot)", "/o/", "Q", "o", "vowel",
        "English /Q/ produced as Tamil /o/", "medium",
        "Practice rounded open back vowel. Drill: hot, lot, stop"),
    SubstitutionPattern("/V/ (but)", "/a/", "V", "a", "vowel",
        "English /V/ merged with short /a/", "medium",
        "Practice centralized vowel. Drill: but, cut, up"),
    SubstitutionPattern("initial clusters (str-, spl-)", "vowel insertion", "str", "istr", "cluster",
        "Tamil lacks initial clusters -- inserts epenthetic vowel (school->iskul)", "high",
        "Practice consonant blending. Drill: str, spl, scr words"),
    SubstitutionPattern("final clusters (-nd, -st)", "epenthetic vowel", "nd", "ndu", "cluster",
        "Tamil inserts vowel after final clusters -- 'bus'->'basu'", "high",
        "Practice final consonant release without added vowel. Drill: bus, last, hand"),
    SubstitutionPattern("stress-timed rhythm", "syllable-timed", "stress", "syllable", "prosody",
        "Tamil is syllable-timed -- English stress patterns flattened", "high",
        "Practice English stress: BEAUtiful, comPUter, underSTAND"),
    SubstitutionPattern("vowel reduction", "full vowel", "@", "a/i", "prosody",
        "Unstressed syllables retain full vowel quality -- no schwa reduction", "medium",
        "Practice schwa: a-BOUT, to-GE-ther, ba-NA-na"),
]

_TAMIL_MARKERS: list[InterferenceMarker] = [
    InterferenceMarker("F3-F2 difference (retroflex)", (250, 650), (800, 1500),
        "Small F3-F2 gap indicates retroflex transfer from Tamil"),
    InterferenceMarker("VOT for /p,t,k/", (20, 60), (30, 70),
        "Tamil lacks aspiration -- VOT shorter than English stops"),
    InterferenceMarker("nPVI (rhythm)", (30, 50), (50, 70),
        "Low nPVI indicates syllable-timed Tamil rhythm"),
    InterferenceMarker("F1 for /ae/", (580, 680), (660, 860),
        "Lower F1 for /ae/ indicates Tamil /e/-/a/ substitution"),
    InterferenceMarker("Vowel space area", (1500000, 2700000), (3000000, 5000000),
        "Compressed VSA reflects 5-vowel Tamil inventory vs 12-vowel English"),
]


# ═══════════════════════════════════════════════════════════════════════════
#  TELUGU (Dravidian)
# ═══════════════════════════════════════════════════════════════════════════

_TELUGU_VOWELS: dict[str, tuple[float, float]] = {
    "a":  (700, 1220),   # short open central
    "a:": (720, 1210),   # long open central
    "i":  (300, 2290),   # short close front
    "i:": (280, 2350),   # long close front
    "u":  (330, 830),    # short close back
    "u:": (310, 810),    # long close back
    "e":  (440, 2020),   # short mid front
    "e:": (420, 2080),   # long mid front
    "o":  (460, 910),    # short mid back
    "o:": (450, 930),    # long mid back
}

_TELUGU_PATTERNS: list[SubstitutionPattern] = [
    SubstitutionPattern("th (voiceless)", "t/th", "0", "t/th", "consonant",
        "English /0/ replaced by dental /t/ or aspirated /th/", "high",
        "Practice tongue-between-teeth. Drill: think, three, bath"),
    SubstitutionPattern("th (voiced)", "d/dh", "D", "d/dh", "consonant",
        "English /D/ replaced by dental /d/ or /dh/", "high",
        "Practice voiced interdental. Drill: the, this, mother"),
    SubstitutionPattern("f", "ph", "f", "ph", "consonant",
        "English /f/ replaced by aspirated /ph/ -- Telugu lacks /f/", "high",
        "Practice labiodental friction. Drill: fish, phone, off"),
    SubstitutionPattern("v", "w/V", "v", "w", "consonant",
        "English /v/ produced as Telugu labio-velar /ʋ/ or /w/", "medium",
        "Practice teeth on lip. Drill: very, van, voice"),
    SubstitutionPattern("z", "j/dZ", "z", "dZ", "consonant",
        "English /z/ replaced by /dZ/ -- Telugu lacks /z/", "medium",
        "Practice sustained voicing. Drill: zoo, zero, easy"),
    SubstitutionPattern("t (alveolar)", "T (retroflex)", "t", "T", "consonant",
        "English alveolar /t/ replaced by Telugu retroflex /T/", "high",
        "Practice alveolar placement. Drill: table, time, butter"),
    SubstitutionPattern("d (alveolar)", "D (retroflex)", "d", "D", "consonant",
        "English alveolar /d/ replaced by retroflex /D/", "high",
        "Practice alveolar placement. Drill: dog, day, ladder"),
    SubstitutionPattern("/ae/ (bat)", "/e/ or /a/", "ae", "e/a", "vowel",
        "English /ae/ not in Telugu -- produced as /e/ or /a/", "high",
        "Practice jaw lowering. Drill: cat, bat, man"),
    SubstitutionPattern("/Q/ (lot)", "/o/", "Q", "o", "vowel",
        "English /Q/ produced as Telugu /o/", "medium",
        "Practice rounded open back vowel. Drill: hot, lot, stop"),
    SubstitutionPattern("/V/ (but)", "/a/", "V", "a", "vowel",
        "English /V/ merged with short /a/", "medium",
        "Practice centralized vowel. Drill: but, cut, up"),
    SubstitutionPattern("/3:/ (bird)", "/ar/", "3:", "ar", "vowel",
        "Rhotic vowel replaced by /ar/ sequence", "medium",
        "Practice mid-central position. Drill: bird, word, girl"),
    SubstitutionPattern("initial clusters (str-, spl-)", "vowel insertion", "str", "istr", "cluster",
        "Telugu inserts epenthetic vowel in complex onsets", "high",
        "Practice consonant blending. Drill: str, spl, scr words"),
    SubstitutionPattern("final clusters (-nd, -st)", "epenthetic vowel", "nd", "ndu", "cluster",
        "Telugu famously vowel-final -- adds /u/ after clusters ('bus'->'basu')", "high",
        "Practice final consonant release. Drill: bus, last, hand"),
    SubstitutionPattern("stress-timed rhythm", "syllable-timed", "stress", "syllable", "prosody",
        "Telugu is syllable-timed -- English rhythm flattened", "high",
        "Practice English stress: BEAUtiful, comPUter"),
    SubstitutionPattern("vowel reduction", "full vowel", "@", "a/i", "prosody",
        "Unstressed syllables retain full vowel quality", "medium",
        "Practice schwa reduction: a-BOUT, to-GE-ther"),
]

_TELUGU_MARKERS: list[InterferenceMarker] = [
    InterferenceMarker("F3-F2 difference (retroflex)", (250, 650), (800, 1500),
        "Small F3-F2 gap indicates retroflex transfer from Telugu"),
    InterferenceMarker("VOT for /p,t,k/", (40, 90), (30, 70),
        "Telugu aspiration contrast may cause variable VOT"),
    InterferenceMarker("nPVI (rhythm)", (30, 50), (50, 70),
        "Low nPVI indicates syllable-timed Telugu rhythm"),
    InterferenceMarker("F1 for /ae/", (580, 680), (660, 860),
        "Lower F1 for /ae/ indicates Telugu /e/-/a/ substitution"),
    InterferenceMarker("Final vowel insertion", (0, 0), (0, 0),
        "Epenthetic /u/ after final consonants is a hallmark Telugu transfer"),
]


# ═══════════════════════════════════════════════════════════════════════════
#  L1 REGISTRY
# ═══════════════════════════════════════════════════════════════════════════

L1_REGISTRY: dict[str, L1Profile] = {
    "bho": L1Profile(
        code="bho", display_name="Bhojpuri", iso_639="bh",
        vowel_count=6, vowel_formants=_BHOJPURI_VOWELS,
        substitution_patterns=_BHOJPURI_PATTERNS,
        acoustic_markers=_BHOJPURI_MARKERS,
        rhythm_type="syllable-timed",
    ),
    "hin": L1Profile(
        code="hin", display_name="Hindi", iso_639="hi",
        vowel_count=10, vowel_formants=_HINDI_VOWELS,
        substitution_patterns=_HINDI_PATTERNS,
        acoustic_markers=_HINDI_MARKERS,
        rhythm_type="syllable-timed",
    ),
    "ben": L1Profile(
        code="ben", display_name="Bangla", iso_639="bn",
        vowel_count=7, vowel_formants=_BANGLA_VOWELS,
        substitution_patterns=_BANGLA_PATTERNS,
        acoustic_markers=_BANGLA_MARKERS,
        rhythm_type="syllable-timed",
    ),
    "ori": L1Profile(
        code="ori", display_name="Odia", iso_639="or",
        vowel_count=6, vowel_formants=_ODIA_VOWELS,
        substitution_patterns=_ODIA_PATTERNS,
        acoustic_markers=_ODIA_MARKERS,
        rhythm_type="syllable-timed",
    ),
    "tam": L1Profile(
        code="tam", display_name="Tamil", iso_639="ta",
        vowel_count=10, vowel_formants=_TAMIL_VOWELS,
        substitution_patterns=_TAMIL_PATTERNS,
        acoustic_markers=_TAMIL_MARKERS,
        rhythm_type="syllable-timed",
    ),
    "tel": L1Profile(
        code="tel", display_name="Telugu", iso_639="te",
        vowel_count=10, vowel_formants=_TELUGU_VOWELS,
        substitution_patterns=_TELUGU_PATTERNS,
        acoustic_markers=_TELUGU_MARKERS,
        rhythm_type="syllable-timed",
    ),
}

# Map from langdetect / ISO 639-1 codes to our internal L1 codes
ISO_TO_L1: dict[str, str] = {
    "bh": "bho",
    "hi": "hin",
    "bn": "ben",
    "or": "ori",
    # Common misdetections / aliases
    "mr": "hin",    # Marathi -> Hindi as closest
    "ne": "hin",    # Nepali -> Hindi as closest
    "as": "ben",    # Assamese -> Bangla as closest
    "ml": "tam",    # Malayalam misdetection -> Tamil as closest Dravidian
    "ta": "tam",    # Tamil
    "te": "tel",    # Telugu
    "kn": "tam",    # Kannada -> Tamil as closest Dravidian (until kan profile added)
    "gu": "hin",    # Gujarati -> Hindi as closest
    "pa": "hin",    # Punjabi -> Hindi as closest
    "ur": "hin",    # Urdu -> Hindi (nearly identical phonology)
}

SUPPORTED_L1_CODES: list[str] = list(L1_REGISTRY.keys())
DEFAULT_L1: str = "bho"


def get_l1_profile(code: str) -> L1Profile:
    """Get an L1 profile by code, falling back to Bhojpuri."""
    return L1_REGISTRY.get(code, L1_REGISTRY[DEFAULT_L1])


def resolve_l1_code(iso_code: str | None, explicit_l1: str | None = None) -> str:
    """Resolve the L1 language code from explicit setting or auto-detection.

    Args:
        iso_code: ISO 639-1 code from langdetect (e.g. "hi")
        explicit_l1: Explicitly set L1 code (e.g. "hin") or "auto"

    Returns:
        Internal L1 code (e.g. "hin")
    """
    if explicit_l1 and explicit_l1 != "auto" and explicit_l1 in L1_REGISTRY:
        return explicit_l1
    if iso_code:
        return ISO_TO_L1.get(iso_code, DEFAULT_L1)
    return DEFAULT_L1


# ═══════════════════════════════════════════════════════════════════════════
#  DETECTION FUNCTION
# ═══════════════════════════════════════════════════════════════════════════

def detect_l1_interference(
    l1_code: str,
    formant_data: dict[str, Any],
    pitch_data: dict[str, Any],
    rhythm_data: dict[str, Any],
    phoneme_spans: list[dict[str, Any]],
    intonation_data: dict[str, Any] | None = None,
    nasality_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Detect L1 interference patterns in English L2 production.

    Args:
        l1_code: Internal L1 code (e.g. "bho", "hin", "ben", "ori")
        formant_data: Parselmouth formant extraction results
        pitch_data: Pitch analysis results
        rhythm_data: Rhythm metrics from prosodic profiling
        phoneme_spans: Wav2Vec phoneme spans
        intonation_data: Optional intonation contour (pattern, declination_rate, ...)
        nasality_data: Optional voice-quality nasality (bw_f1, a1_p0_diff, nasal_segments_detected, ...)

    Returns:
        Dict with interference score, detected patterns, and known substitutions.
    """
    profile = get_l1_profile(l1_code)
    detected_patterns: list[dict[str, Any]] = []
    interference_score = 0.0
    total_checks = 0

    # 1. Retroflex detection (F3-F2 gap)
    # Calibrated 2026-04-21 on 50-clip Svarah set. Real Indian-English reads:
    # Bangla F3-F2 mean 1022 Hz, Hindi 1137, Tamil 1119 (all well above the old
    # 800 Hz threshold which never fired). Lowered F3 due to retroflex tongue
    # curl brings F3-F2 below ~1050 in L1-transfer; RP English sits at 1200-1500.
    f3 = formant_data.get("f3_mean", 0)
    f2 = formant_data.get("f2_mean", 0)
    f3_f2_gap = abs(f3 - f2)
    total_checks += 1
    if 0 < f3_f2_gap < 1050:
        interference_score += 15
        detected_patterns.append({
            "pattern": "retroflex_transfer",
            "evidence": f"F3-F2 gap = {f3_f2_gap:.0f} Hz (English alveolar typically 1100-1500; lower suggests retroflex)",
            "severity": "high",
            "remediation": "Practice alveolar placement for /t/, /d/, /r/ -- tongue tip forward, not curled back",
        })

    # 2. Rhythm check (nPVI + varco)
    # Calibrated 2026-04-21 on 50-clip Svarah set (Bangla/Hindi/Tamil L1).
    # Bangla mean nPVI=56, varco=55; Hindi mean nPVI=71, varco=86. Old threshold
    # (nPVI<45) never fired for real Indian-English reads.
    npvi = rhythm_data.get("npvi_v", 0)
    varco = rhythm_data.get("varco_v", 0)
    total_checks += 1
    if npvi and npvi < 60 and varco and varco < 70:
        interference_score += 20
        detected_patterns.append({
            "pattern": "syllable_timed_rhythm",
            "evidence": f"nPVI={npvi:.1f}, varco_V={varco:.1f} ({profile.display_name}-like syllable timing; English reads typically nPVI>65, varco>75)",
            "severity": "high",
            "remediation": "Practice stress-timed rhythm: emphasize stressed syllables, reduce unstressed ones",
        })

    # 3. Nasalization check — frame-level detector (voice_quality.detect_nasal_segments).
    # Fires when a sustained fraction of voiced frames show both wide F1 bandwidth
    # and elevated nasal-band energy (200-400 Hz) relative to the F1 band, AND
    # at least one contiguous segment of >=30 ms was formed. Threshold is per-
    # frame fraction > 0.20 to avoid firing on occasional nasal consonants; real
    # nasal-vowel transfer sustains across voiced vowel tokens.
    nas = nasality_data or {}
    nasal_frac = float(nas.get("nasal_frame_fraction") or 0.0)
    nasal_segs = int(nas.get("nasal_segments_detected") or 0)
    voiced = int(nas.get("voiced_frames") or 0)
    bw_f1 = nas.get("bandwidth_f1") or formant_data.get("bandwidth_f1", 0)
    total_checks += 1
    if voiced >= 50 and nasal_frac > 0.20 and nasal_segs >= 3:
        interference_score += 10
        detected_patterns.append({
            "pattern": "nasalization_transfer",
            "evidence": f"{nasal_segs} nasal segments, {100*nasal_frac:.0f}% of voiced frames nasalized (mean F1 bw={bw_f1:.0f} Hz)",
            "severity": "medium",
            "remediation": "Practice oral vowels -- velum should close for non-nasal English vowels",
        })

    # 4. Monotone / flat-intonation check
    pitch_std = pitch_data.get("std_f0", 0)
    mean_f0 = pitch_data.get("mean_f0", 0)
    pitch_cv = (pitch_std / mean_f0) if mean_f0 > 0 else None
    intonation_pattern = (intonation_data or {}).get("pattern")
    total_checks += 1
    is_flat_from_cv = pitch_cv is not None and pitch_cv < 0.12
    is_flat_from_pattern = intonation_pattern == "flat"
    if is_flat_from_cv or is_flat_from_pattern:
        interference_score += 15
        ev = []
        if pitch_cv is not None:
            ev.append(f"pitch CV={pitch_cv:.3f}")
        if intonation_pattern:
            ev.append(f"contour={intonation_pattern}")
        detected_patterns.append({
            "pattern": "monotone_intonation",
            "evidence": f"{', '.join(ev)} (flat intonation, {profile.display_name} transfer)",
            "severity": "medium",
            "remediation": "Practice English intonation: rising for questions, falling for statements",
        })

    # 5. Vowel space compression
    # Calibrated 2026-04-21: Parselmouth returns VSA in Hz^2 in the low millions
    # (50-clip Svarah: Bangla 3.55M, Hindi 3.50M, Tamil 2.90M). Old threshold
    # (150_000) was off by 4 orders of magnitude -- it never fired. Indian-
    # English reads below 2.5M indicate genuine compression relative to the
    # 12-vowel English target.
    vsa = formant_data.get("vowel_space_area", 0)
    total_checks += 1
    if 0 < vsa < 2_500_000:
        interference_score += 15
        detected_patterns.append({
            "pattern": "vowel_space_compression",
            "evidence": f"Vowel space area = {vsa:.0f} Hz^2 ({profile.display_name} has {profile.vowel_count} vowels, English needs 12+; compressed <2.5M)",
            "severity": "high",
            "remediation": "Practice English vowel contrasts: bit vs beat vs bat vs bet vs but vs bot",
        })

    # 6. Schwa reduction failure
    percent_v = rhythm_data.get("percent_v", 50)
    total_checks += 1
    if percent_v > 55:
        interference_score += 10
        detected_patterns.append({
            "pattern": "no_vowel_reduction",
            "evidence": f"%V = {percent_v:.1f}% (high vocalic proportion -- unstressed vowels not reduced)",
            "severity": "medium",
            "remediation": "Practice schwa in unstressed syllables: 'a-BOUT', 'to-GE-ther', 'ba-NA-na'",
        })

    # Match known substitution patterns for this L1
    matched_substitutions: list[dict[str, str]] = []
    for pat in profile.substitution_patterns:
        if pat.category == "consonant":
            matched_substitutions.append({
                "target": pat.english_target,
                "likely_substitute": pat.l1_substitute,
                "severity": pat.severity,
                "remediation": pat.remediation,
            })

    interference_score = min(100, interference_score)

    return {
        "l1_language": profile.code,
        "l1_display_name": profile.display_name,
        "l1_interference_score": round(interference_score, 2),
        "detected_patterns": detected_patterns,
        "known_substitutions": matched_substitutions,
        "acoustic_markers_checked": total_checks,
        "patterns_found": len(detected_patterns),
        "l1_vowel_system": profile.vowel_formants,
        "english_vowel_targets": ENGLISH_VOWEL_FORMANTS,
        "risk_areas": [p["pattern"] for p in detected_patterns],
        # Backwards compat
        "bhojpuri_interference_score": round(interference_score, 2) if l1_code == "bho" else None,
    }
