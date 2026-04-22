"""NLP LAYER
spaCy -> Morphological analysis
NLTK  -> Syntactic + morpheme analysis
Phoneme inventory analysis
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

_spacy_model: Any = None


def _load_spacy(model_name: str = "en_core_web_sm") -> Any:
    global _spacy_model
    if _spacy_model is None:
        import spacy
        try:
            _spacy_model = spacy.load(model_name)
        except OSError:
            logger.info("Downloading spaCy model: %s", model_name)
            from spacy.cli import download
            download(model_name)
            _spacy_model = spacy.load(model_name)
    return _spacy_model


# ---------------------------------------------------------------------------
# spaCy: Morphological analysis
# ---------------------------------------------------------------------------

@dataclass
class TokenAnalysis:
    text: str
    lemma: str
    pos: str
    tag: str
    dep: str
    morph: str
    is_stop: bool
    head: str


@dataclass
class MorphologicalResult:
    tokens: list[TokenAnalysis]
    noun_phrases: list[str]
    entities: list[dict[str, str]]
    sentence_count: int
    word_count: int
    unique_pos_tags: list[str]
    pos_distribution: dict[str, int]


def analyze_morphology(text: str, model_name: str = "en_core_web_sm") -> MorphologicalResult:
    """Perform morphological analysis using spaCy."""
    nlp = _load_spacy(model_name)
    doc = nlp(text)

    tokens = [
        TokenAnalysis(
            text=tok.text,
            lemma=tok.lemma_,
            pos=tok.pos_,
            tag=tok.tag_,
            dep=tok.dep_,
            morph=str(tok.morph),
            is_stop=tok.is_stop,
            head=tok.head.text,
        )
        for tok in doc
        if not tok.is_space
    ]

    pos_dist: dict[str, int] = {}
    for tok in tokens:
        pos_dist[tok.pos] = pos_dist.get(tok.pos, 0) + 1

    entities = [
        {"text": ent.text, "label": ent.label_, "start": ent.start_char, "end": ent.end_char}
        for ent in doc.ents
    ]

    return MorphologicalResult(
        tokens=tokens,
        noun_phrases=[chunk.text for chunk in doc.noun_chunks],
        entities=entities,
        sentence_count=len(list(doc.sents)),
        word_count=len([t for t in doc if not t.is_punct and not t.is_space]),
        unique_pos_tags=sorted(set(t.pos for t in tokens)),
        pos_distribution=pos_dist,
    )


# ---------------------------------------------------------------------------
# NLTK: Syntactic + morpheme analysis
# ---------------------------------------------------------------------------

@dataclass
class SyntaxNode:
    label: str
    children: list[SyntaxNode | str] = field(default_factory=list)


@dataclass
class MorphemeBreakdown:
    word: str
    root: str
    prefixes: list[str]
    suffixes: list[str]
    morpheme_count: int
    is_compound: bool


@dataclass
class NLTKResult:
    pos_tags: list[tuple[str, str]]
    constituency_tree: SyntaxNode | None
    morphemes: list[MorphemeBreakdown]
    syllable_count: int
    mlu: float  # Mean Length of Utterance in morphemes


def _ensure_nltk_data() -> None:
    import nltk
    for resource in ["punkt_tab", "averaged_perceptron_tagger_eng", "wordnet", "omw-1.4"]:
        try:
            nltk.data.find(f"tokenizers/{resource}" if "punkt" in resource else f"taggers/{resource}" if "tagger" in resource else f"corpora/{resource}")
        except LookupError:
            nltk.download(resource, quiet=True)


def _break_morphemes(word: str) -> MorphemeBreakdown:
    """Simple morpheme decomposition using known affixes."""
    prefixes_list = ["un", "re", "pre", "dis", "mis", "over", "under", "out", "non", "anti", "de", "en", "em", "in", "im", "il", "ir"]
    suffixes_list = ["ing", "tion", "sion", "ment", "ness", "able", "ible", "ful", "less", "ous", "ive", "al", "ly", "er", "or", "ist", "ed", "es", "s"]

    w = word.lower()
    found_prefixes: list[str] = []
    found_suffixes: list[str] = []

    for p in sorted(prefixes_list, key=len, reverse=True):
        if w.startswith(p) and len(w) > len(p) + 2:
            found_prefixes.append(p)
            w = w[len(p):]
            break

    for s in sorted(suffixes_list, key=len, reverse=True):
        if w.endswith(s) and len(w) > len(s) + 2:
            found_suffixes.append(s)
            w = w[: -len(s)]
            break

    return MorphemeBreakdown(
        word=word,
        root=w,
        prefixes=found_prefixes,
        suffixes=found_suffixes,
        morpheme_count=1 + len(found_prefixes) + len(found_suffixes),
        is_compound="-" in word or len(word.split()) > 1,
    )


def _tree_to_node(tree: Any) -> SyntaxNode | str:
    """Convert NLTK Tree to our SyntaxNode structure."""
    import nltk
    if isinstance(tree, nltk.Tree):
        return SyntaxNode(
            label=tree.label(),
            children=[_tree_to_node(child) for child in tree],
        )
    return str(tree)


def analyze_syntax(text: str) -> NLTKResult:
    """Perform syntactic and morpheme analysis using NLTK."""
    import nltk

    _ensure_nltk_data()

    sentences = nltk.sent_tokenize(text)
    all_tags: list[tuple[str, str]] = []
    all_morphemes: list[MorphemeBreakdown] = []
    tree: SyntaxNode | None = None
    total_syllables = 0

    for sent in sentences:
        words = nltk.word_tokenize(sent)
        tagged = nltk.pos_tag(words)
        all_tags.extend(tagged)

        for word, _ in tagged:
            if word.isalpha():
                all_morphemes.append(_break_morphemes(word))
                # Approximate syllable count
                vowels = sum(1 for c in word.lower() if c in "aeiou")
                total_syllables += max(1, vowels)

    # Build constituency tree using regex parser for the first sentence
    if sentences:
        words = nltk.word_tokenize(sentences[0])
        tagged = nltk.pos_tag(words)
        grammar = r"""
            NP: {<DT|PP\$>?<JJ.*>*<NN.*>+}
            VP: {<VB.*><NP|PP|CLAUSE>+$}
            VP: {<VB.*>}
            PP: {<IN><NP>}
            CLAUSE: {<NP><VP>}
        """
        parser = nltk.RegexpParser(grammar)
        parsed = parser.parse(tagged)
        tree = _tree_to_node(parsed)
        if isinstance(tree, str):
            tree = None

    total_morphemes = sum(m.morpheme_count for m in all_morphemes)
    word_count = len(all_morphemes)
    mlu = total_morphemes / max(len(sentences), 1)

    return NLTKResult(
        pos_tags=all_tags,
        constituency_tree=tree,
        morphemes=all_morphemes,
        syllable_count=total_syllables,
        mlu=round(mlu, 2),
    )


# ---------------------------------------------------------------------------
# Phoneme inventory analysis
# ---------------------------------------------------------------------------

@dataclass
class PhonemeInventory:
    ipa_phonemes: list[str]
    consonants: list[str]
    vowels: list[str]
    consonant_clusters: list[str]
    phoneme_frequency: dict[str, int]


def analyze_phoneme_inventory(phoneme_sequence: list[str]) -> PhonemeInventory:
    """Analyze phoneme inventory from a sequence of phonemes."""
    ipa_vowels = set("aeiouɑɛɪɔʊəæʌɒɜɐ")
    vowels: list[str] = []
    consonants: list[str] = []
    freq: dict[str, int] = {}
    clusters: list[str] = []

    prev_consonant = ""
    for p in phoneme_sequence:
        p_clean = p.strip().lower()
        if not p_clean or p_clean == " ":
            prev_consonant = ""
            continue

        freq[p_clean] = freq.get(p_clean, 0) + 1

        if any(c in ipa_vowels for c in p_clean):
            if p_clean not in vowels:
                vowels.append(p_clean)
            prev_consonant = ""
        else:
            if p_clean not in consonants:
                consonants.append(p_clean)
            if prev_consonant:
                cluster = prev_consonant + p_clean
                if cluster not in clusters:
                    clusters.append(cluster)
            prev_consonant = p_clean

    return PhonemeInventory(
        ipa_phonemes=sorted(set(p.strip().lower() for p in phoneme_sequence if p.strip())),
        consonants=consonants,
        vowels=vowels,
        consonant_clusters=clusters,
        phoneme_frequency=freq,
    )
