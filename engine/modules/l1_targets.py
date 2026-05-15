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
#  MARATHI (Indo-Aryan — Western)
# ═══════════════════════════════════════════════════════════════════════════

_MARATHI_VOWELS: dict[str, tuple[float, float]] = {
    "a":  (700, 1240),   # short open central
    "a:": (720, 1230),   # long open central
    "i":  (300, 2310),   # short close front
    "i:": (280, 2370),   # long close front
    "u":  (310, 830),    # short close back
    "u:": (300, 810),    # long close back
    "e":  (440, 2040),   # mid front
    "o":  (460, 920),    # mid back
}

_MARATHI_PATTERNS: list[SubstitutionPattern] = [
    SubstitutionPattern("th (voiceless)", "t/th", "0", "t/th", "consonant",
        "English /0/ ('think') replaced by dental /t/ or aspirated /th/", "high",
        "Practice tongue-between-teeth position. Drill: think, three, bath"),
    SubstitutionPattern("th (voiced)", "d/dh", "D", "d/dh", "consonant",
        "English /D/ ('the') replaced by dental /d/ or /dh/", "high",
        "Practice voiced interdental. Drill: the, this, mother"),
    SubstitutionPattern("f", "ph", "f", "ph", "consonant",
        "English /f/ replaced by aspirated /ph/ — Marathi lacks /f/", "high",
        "Practice labiodental friction. Drill: fish, phone, off"),
    SubstitutionPattern("v", "w/V", "v", "w", "consonant",
        "English /v/ merged with Marathi labio-velar /ʋ/", "medium",
        "Practice teeth on lip. Drill: very, van, voice vs wine"),
    SubstitutionPattern("z", "jh/dZ", "z", "dZ", "consonant",
        "English /z/ replaced by /dZ/ or /jh/", "medium",
        "Practice sustained buzzing. Drill: zoo, zero, easy"),
    SubstitutionPattern("t (alveolar)", "T (retroflex)", "t", "T", "consonant",
        "English alveolar /t/ replaced by Marathi retroflex /T/ — pervasive transfer", "high",
        "Practice alveolar placement. Drill: table, time, butter"),
    SubstitutionPattern("d (alveolar)", "D (retroflex)", "d", "D", "consonant",
        "English alveolar /d/ replaced by retroflex /D/", "high",
        "Practice alveolar placement. Drill: dog, day, ladder"),
    SubstitutionPattern("n (alveolar)", "N (retroflex)", "n", "N", "consonant",
        "English alveolar /n/ may become retroflex /ɳ/ in Marathi-dominant speakers", "medium",
        "Practice tongue tip on alveolar ridge. Drill: no, name, can"),
    SubstitutionPattern("/ae/ (bat)", "/e/ or /a/", "ae", "e/a", "vowel",
        "English /ae/ not in Marathi — produced as /e/ or open /a/", "high",
        "Practice jaw lowering with front tongue. Drill: cat, bat, man"),
    SubstitutionPattern("/Q/ (lot)", "/o/ or /a/", "Q", "o", "vowel",
        "English /Q/ produced as Marathi /o/ or /a/", "medium",
        "Practice rounded open back vowel. Drill: hot, lot, stop"),
    SubstitutionPattern("/V/ (but)", "/a/", "V", "a", "vowel",
        "English /V/ merged with Marathi short /a/", "medium",
        "Practice centralized vowel. Drill: but, cut, up"),
    SubstitutionPattern("initial clusters (sC-)", "vowel insertion", "sC", "isC", "cluster",
        "Marathi resists initial /s/+consonant clusters (school→iskul)", "high",
        "Practice consonant blending. Drill: school, start, speak"),
    SubstitutionPattern("vowel reduction", "full vowel", "@", "a/i", "prosody",
        "Unstressed syllables retain full vowel — no schwa reduction", "medium",
        "Practice schwa: a-BOUT, to-GE-ther, ba-NA-na"),
]

_MARATHI_MARKERS: list[InterferenceMarker] = [
    InterferenceMarker("F3-F2 difference (retroflex)", (250, 650), (800, 1500),
        "Small F3-F2 gap indicates retroflex transfer from Marathi"),
    InterferenceMarker("VOT for /p,t,k/", (40, 90), (30, 70),
        "Marathi has breathy-voiced stops — VOT variability in voiceless stops"),
    InterferenceMarker("nPVI (rhythm)", (30, 50), (50, 70),
        "Low nPVI indicates syllable-timed Marathi rhythm"),
    InterferenceMarker("F1 for /ae/", (580, 680), (660, 860),
        "Lower F1 for /ae/ indicates Marathi /e/-/a/ substitution"),
    InterferenceMarker("Vowel space area", (1700000, 2900000), (3000000, 5000000),
        "Compressed VSA reflects 8-vowel Marathi inventory vs 12-vowel English"),
]


# ═══════════════════════════════════════════════════════════════════════════
#  GUJARATI (Indo-Aryan — Western)
# ═══════════════════════════════════════════════════════════════════════════

_GUJARATI_VOWELS: dict[str, tuple[float, float]] = {
    "a":  (700, 1250),   # short open central
    "a:": (720, 1240),   # long open central
    "i":  (290, 2320),   # short close front
    "i:": (270, 2380),   # long close front
    "u":  (310, 840),    # short close back
    "u:": (300, 820),    # long close back
    "e":  (430, 2050),   # mid front
    "o":  (450, 930),    # mid back
}

_GUJARATI_PATTERNS: list[SubstitutionPattern] = [
    SubstitutionPattern("th (voiceless)", "t", "0", "t", "consonant",
        "English /0/ replaced by unaspirated dental /t/ — Gujarati lacks aspiration contrast", "high",
        "Practice tongue-between-teeth. Drill: think, three, bath"),
    SubstitutionPattern("th (voiced)", "d", "D", "d", "consonant",
        "English /D/ replaced by dental /d/ without breathiness", "high",
        "Practice voiced interdental. Drill: the, this, mother"),
    SubstitutionPattern("f", "p/ph", "f", "p/ph", "consonant",
        "English /f/ replaced by /p/ or aspirated /ph/", "high",
        "Practice labiodental friction. Drill: fish, phone, off"),
    SubstitutionPattern("v", "w", "v", "w", "consonant",
        "English /v/-/w/ distinction collapsed — both as /w/", "high",
        "Practice teeth on lip for /v/. Minimal pairs: vine-wine, vest-west"),
    SubstitutionPattern("z", "j/dZ", "z", "dZ", "consonant",
        "English /z/ replaced by /dZ/ — Gujarati lacks /z/", "medium",
        "Practice sustained buzzing. Drill: zoo, zero, easy"),
    SubstitutionPattern("w", "v/w merged", "w", "V", "consonant",
        "English /w/ and /v/ merged into Gujarati labio-velar approximant", "high",
        "Practice rounded lips for /w/, teeth on lip for /v/. Minimal pairs: west-vest"),
    SubstitutionPattern("t (alveolar)", "T (retroflex)", "t", "T", "consonant",
        "English alveolar /t/ replaced by retroflex /T/", "high",
        "Practice alveolar placement. Drill: table, time, butter"),
    SubstitutionPattern("d (alveolar)", "D (retroflex)", "d", "D", "consonant",
        "English alveolar /d/ replaced by retroflex /D/", "high",
        "Practice alveolar placement. Drill: dog, day, ladder"),
    SubstitutionPattern("/ae/ (bat)", "/e/ or /a/", "ae", "e/a", "vowel",
        "English /ae/ not in Gujarati — produced as /e/ or /a/", "high",
        "Practice jaw lowering. Drill: cat, bat, man"),
    SubstitutionPattern("/Q/ (lot)", "/o/", "Q", "o", "vowel",
        "English /Q/ produced as Gujarati /o/", "medium",
        "Practice rounded open back vowel. Drill: hot, lot, stop"),
    SubstitutionPattern("/V/ (but)", "/a/", "V", "a", "vowel",
        "English /V/ merged with short /a/", "medium",
        "Practice centralized vowel. Drill: but, cut, up"),
    SubstitutionPattern("final clusters (-nd, -st)", "epenthetic vowel", "nd", "ndu", "cluster",
        "Gujarati resists complex codas — adds vowel after clusters", "medium",
        "Practice final consonant release. Drill: land, last, hand"),
    SubstitutionPattern("vowel reduction", "full vowel", "@", "a/i", "prosody",
        "Unstressed syllables retain full vowel quality", "medium",
        "Practice schwa: a-BOUT, to-GE-ther"),
]

_GUJARATI_MARKERS: list[InterferenceMarker] = [
    InterferenceMarker("F3-F2 difference (retroflex)", (250, 650), (800, 1500),
        "Small F3-F2 gap indicates retroflex transfer from Gujarati"),
    InterferenceMarker("VOT for /p,t,k/", (10, 40), (30, 70),
        "Gujarati lacks aspiration — VOT shorter than English for voiceless stops"),
    InterferenceMarker("nPVI (rhythm)", (30, 50), (50, 70),
        "Low nPVI indicates syllable-timed Gujarati rhythm"),
    InterferenceMarker("F1 for /ae/", (580, 680), (660, 860),
        "Lower F1 for /ae/ indicates Gujarati /e/-/a/ substitution"),
    InterferenceMarker("/w/-/v/ merger", (0, 0), (0, 0),
        "Labio-velar approximant merges English /w/ and /v/ into a single phone"),
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
    "mar": L1Profile(
        code="mar", display_name="Marathi", iso_639="mr",
        vowel_count=8, vowel_formants=_MARATHI_VOWELS,
        substitution_patterns=_MARATHI_PATTERNS,
        acoustic_markers=_MARATHI_MARKERS,
        rhythm_type="syllable-timed",
    ),
    "guj": L1Profile(
        code="guj", display_name="Gujarati", iso_639="gu",
        vowel_count=8, vowel_formants=_GUJARATI_VOWELS,
        substitution_patterns=_GUJARATI_PATTERNS,
        acoustic_markers=_GUJARATI_MARKERS,
        rhythm_type="syllable-timed",
    ),
}

# Map from langdetect / ISO 639-1 codes to our internal L1 codes
ISO_TO_L1: dict[str, str] = {
    "bh": "bho",
    "hi": "hin",
    "bn": "ben",
    "or": "ori",
    "ta": "tam",
    "te": "tel",
    "mr": "mar",    # Marathi
    "gu": "guj",    # Gujarati
    # Common misdetections / aliases
    "ne": "hin",    # Nepali -> Hindi as closest
    "as": "ben",    # Assamese -> Bangla as closest
    "ml": "tam",    # Malayalam -> Tamil as closest Dravidian
    "kn": "tam",    # Kannada -> Tamil as closest Dravidian
    "pa": "hin",    # Punjabi -> Hindi as closest
    "ur": "hin",    # Urdu -> Hindi (nearly identical phonology)
}

SUPPORTED_L1_CODES: list[str] = list(L1_REGISTRY.keys())

# Calibrated L1 codes — profiles whose attractor values, vowel formants,
# and substitution catalogs have been populated with literature-anchored
# data. "ben" and "hin" are backed by empirical Svarah corpus calibration;
# "tam", "tel", "mar", "guj" use published acoustic-phonetic literature
# (F1/F2 vowel charts, VOT studies, rhythm-class typology) and are flagged
# as "literature-anchored" in the profile. Bhojpuri ("bho") and Odia ("ori")
# are present in L1_REGISTRY but NOT calibrated because their attractor
# values are still skeleton defaults — they remain gated.
CALIBRATED_L1_CODES: tuple[str, ...] = ("ben", "hin", "tam", "tel", "mar", "guj")
DEFAULT_L1: str = "hin"


def is_calibrated_l1(code: str) -> bool:
    return code in CALIBRATED_L1_CODES


class UnsupportedL1Error(ValueError):
    """Raised when a request asks the engine to score against an L1 whose
    attractors are not yet empirically calibrated. The gateway should map
    this to a 422 with a user-friendly message."""

    def __init__(self, code: str) -> None:
        super().__init__(
            f"L1 '{code}' is not yet supported in this release. "
            f"Calibrated L1s: {', '.join(CALIBRATED_L1_CODES)}."
        )
        self.code = code


def get_l1_profile(code: str) -> L1Profile:
    """Get an L1 profile by code, falling back to the calibrated default (Hindi)."""
    return L1_REGISTRY.get(code, L1_REGISTRY[DEFAULT_L1])


def resolve_l1_code(iso_code: str | None, explicit_l1: str | None = None) -> str:
    """Resolve the L1 language code from explicit setting or auto-detection.

    Args:
        iso_code: ISO 639-1 code from langdetect (e.g. "hi")
        explicit_l1: Explicitly set L1 code (e.g. "hin") or "auto"

    Returns:
        Internal L1 code (e.g. "hin"). Always one of CALIBRATED_L1_CODES.

    Raises:
        UnsupportedL1Error: when ``explicit_l1`` is set to a non-"auto" code
            that is not in CALIBRATED_L1_CODES. Auto-detected ISO codes that
            don't map to a calibrated substrate are quietly downgraded to
            DEFAULT_L1 instead — explicit user input must surface as a 422
            so the gateway can show "L1 'xx' is not supported", which is
            handled globally by the FastAPI handler in main.py.
    """
    if explicit_l1 and explicit_l1 != "auto":
        if explicit_l1 in CALIBRATED_L1_CODES:
            return explicit_l1
        # Explicit but uncalibrated — surface it; do not silently mislabel.
        raise UnsupportedL1Error(explicit_l1)
    if iso_code:
        candidate = ISO_TO_L1.get(iso_code, DEFAULT_L1)
        return candidate if candidate in CALIBRATED_L1_CODES else DEFAULT_L1
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
    pattern_evidence: dict[str, dict[str, Any]] | None = None,
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
        pattern_evidence: Optional dict from phoneme_pairing.match_events_to_patterns —
                          {pattern_english_target: {"pattern": SubstitutionPattern,
                                                    "events": [event_dicts]}}.
                          When present, fired_substitutions become evidence-based
                          with timestamps and confidence=high regardless of the
                          coarse heuristic outcome.

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

    # ── Fire substitution patterns based on acoustic evidence ───────────
    # Build a set of evidence tags from detected_patterns so we can route
    # which substitution categories should fire.
    fired_tags: set[str] = {p["pattern"] for p in detected_patterns}

    # Recognized phoneme inventory from wav2vec spans. The current wav2vec
    # model is character-level (CTC over letters), so this is a coarse
    # inventory check — case-insensitive char overlap with IPA targets.
    recognized_chars: set[str] = set()
    for sp in phoneme_spans or []:
        ph = (sp.get("phoneme") or "").strip().lower()
        if ph and ph != " ":
            recognized_chars.add(ph)

    pattern_evidence = pattern_evidence or {}

    fired_substitutions: list[dict[str, Any]] = []
    for pat in profile.substitution_patterns:
        evidence: list[str] = []
        confidence: str = "low"
        events_for_pat: list[dict[str, Any]] = []

        # ── Layer 2: phoneme-pair evidence (if available) ──
        # When the wav2vec2 phoneme head + forced alignment produced a real
        # substitution event matching this pattern, lock confidence=high and
        # attach the timestamps. This trumps the heuristic layer.
        bundle = pattern_evidence.get(pat.english_target)
        if bundle:
            events_for_pat = list(bundle.get("events") or [])
            if events_for_pat:
                ev_count = len(events_for_pat)
                mean_conf = sum(e.get("confidence", 0.0) for e in events_for_pat) / ev_count
                evidence.append(
                    f"{ev_count} phoneme-aligned event(s) (mean wav2vec conf={mean_conf:.2f})"
                )
                confidence = "high"

        # ── Layer 1: acoustic-marker heuristics (always evaluated) ──
        if pat.category == "vowel":
            if "vowel_space_compression" in fired_tags:
                evidence.append("vowel space compressed below English target")
                confidence = "high"
            if "nasalization_transfer" in fired_tags:
                evidence.append("nasalization on English vowels")
                if confidence == "low":
                    confidence = "medium"

        elif pat.category == "consonant":
            target_ipa = pat.ipa_target.lower().strip()
            # Retroflex transfer fires alveolar /t/ and /d/ patterns
            if target_ipa in {"t", "d"} and "retroflex_transfer" in fired_tags:
                evidence.append("F3-F2 gap suggests retroflex tongue posture")
                if confidence == "low":
                    confidence = "high"
            # For non-alveolar consonants, fire if the target letter/phoneme
            # is absent from the recognized inventory — the speaker likely
            # never produced it canonically.
            elif target_ipa and target_ipa[0] not in recognized_chars:
                evidence.append(f"target /{pat.ipa_target}/ not detected in production")
                if confidence == "low":
                    confidence = "medium"

        elif pat.category in ("cluster", "prosody"):
            if "syllable_timed_rhythm" in fired_tags or "no_vowel_reduction" in fired_tags:
                evidence.append("rhythm class transferred from L1")
                if confidence == "low":
                    confidence = "medium"

        if not evidence:
            continue  # No acoustic evidence → don't surface this pattern

        fired_substitutions.append({
            "target": pat.english_target,
            "likely_substitute": pat.l1_substitute,
            "ipa_target": pat.ipa_target,
            "ipa_substitute": pat.ipa_substitute,
            "category": pat.category,
            "description": pat.description,
            "severity": pat.severity,
            "confidence": confidence,
            "evidence": "; ".join(evidence),
            "events": events_for_pat,           # phoneme-aligned timestamps
            "evidence_grade": "phoneme_aligned" if events_for_pat else "heuristic",
            "remediation": pat.remediation,
        })

    # Sort fired substitutions: high-confidence + high-severity first.
    _sev_rank = {"high": 0, "medium": 1, "low": 2}
    _conf_rank = {"high": 0, "medium": 1, "low": 2}
    fired_substitutions.sort(
        key=lambda s: (_conf_rank.get(s["confidence"], 3), _sev_rank.get(s["severity"], 3)),
    )

    interference_score = min(100, interference_score)

    # CAVP = Contrastive **Acoustic** Voice Profiling. Only patterns with a
    # phoneme-aligned acoustic event survive into the response. L1-prior
    # catalog matches without acoustic evidence are dropped entirely — the
    # earlier rev-2 design kept them in a fenced `predicted_substitutions`
    # field, but per Neil 2026-05-05 even that is too misleading: a
    # downstream consumer (or screenshot reviewer) cannot reliably tell that
    # the field is non-acoustic. The product surfaces measurement only.
    acoustically_observed = [
        s for s in fired_substitutions if s.get("evidence_grade") == "phoneme_aligned"
    ]

    return {
        "l1_language": profile.code,
        "l1_display_name": profile.display_name,
        "l1_interference_score": round(interference_score, 2),
        "detected_patterns": detected_patterns,
        # Headline list — only acoustic measurements; nothing fabricated.
        "fired_substitutions": acoustically_observed,
        "substitutions_fired_count": len(acoustically_observed),
        "acoustically_observed_substitutions": acoustically_observed,
        "acoustically_observed_count": len(acoustically_observed),
        # Back-compat alias — also restricted to acoustic only.
        "known_substitutions": acoustically_observed,
        "acoustic_markers_checked": total_checks,
        "patterns_found": len(detected_patterns),
        "l1_vowel_system": profile.vowel_formants,
        "english_vowel_targets": ENGLISH_VOWEL_FORMANTS,
        "risk_areas": [p["pattern"] for p in detected_patterns],
        # Backwards compat
        "bhojpuri_interference_score": round(interference_score, 2) if l1_code == "bho" else None,
    }
