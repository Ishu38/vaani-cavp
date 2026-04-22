"""
Export training-ready datasets from MongoDB for model fine-tuning.

Extracts from the voiceprofiles collection:
  - Whisper:   audio paths + transcripts (JSONL)
  - Wav2Vec2:  audio paths + phoneme timestamps (JSONL)
  - auDeep:    mel spectrogram tensors (NPZ archive)

Usage:
    python engine/scripts/export_training_data.py --output ./training_data
    python engine/scripts/export_training_data.py --output ./training_data --l1 bho hin
    python engine/scripts/export_training_data.py --output ./training_data --min-duration 2.0
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from pymongo import MongoClient


def connect(mongo_uri: str) -> MongoClient:
    client = MongoClient(mongo_uri)
    client.admin.command("ping")
    return client


def export_whisper(
    collection,
    output_dir: Path,
    upload_dir: Path,
    l1_filter: list[str] | None,
    min_duration: float,
) -> int:
    """Export audio path + transcript pairs for Whisper fine-tuning."""
    out = output_dir / "whisper"
    out.mkdir(parents=True, exist_ok=True)

    query: dict = {"transcription.text": {"$exists": True, "$ne": ""}}
    if l1_filter:
        query["language"] = {"$in": l1_filter}

    count = 0
    with open(out / "manifest.jsonl", "w") as f:
        for doc in collection.find(query):
            tx = doc.get("transcription", {})
            duration = tx.get("duration_seconds", 0.0)
            if duration < min_duration:
                continue

            audio_file = doc.get("audioFilename", "")
            audio_path = upload_dir / audio_file
            if not audio_path.exists():
                continue

            record = {
                "audio_filepath": str(audio_path),
                "text": tx["text"].strip(),
                "duration": round(duration, 3),
                "language": tx.get("language", "en"),
                "speaker_id": doc.get("speakerId", "unknown"),
                "l1_language": doc.get("language", ""),
                "profile_id": str(doc["_id"]),
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1

    print(f"  Whisper: {count} samples -> {out / 'manifest.jsonl'}")
    return count


def export_wav2vec(
    collection,
    output_dir: Path,
    upload_dir: Path,
    l1_filter: list[str] | None,
    min_duration: float,
) -> int:
    """Export audio path + phoneme timestamps for Wav2Vec2 fine-tuning."""
    out = output_dir / "wav2vec2"
    out.mkdir(parents=True, exist_ok=True)

    query: dict = {
        "$or": [
            {"aiClassification.wav2vec.phonemes": {"$exists": True}},
            {"phonemeAnalysis.forced_alignment_phones": {"$exists": True}},
        ]
    }
    if l1_filter:
        query["language"] = {"$in": l1_filter}

    count = 0
    with open(out / "manifest.jsonl", "w") as f:
        for doc in collection.find(query):
            duration = doc.get("transcription", {}).get("duration_seconds", 0.0)
            if duration < min_duration:
                continue

            audio_file = doc.get("audioFilename", "")
            audio_path = upload_dir / audio_file
            if not audio_path.exists():
                continue

            # Prefer forced-alignment phones over Wav2Vec CTC
            pa = doc.get("phonemeAnalysis", {})
            ai = doc.get("aiClassification", {})
            fa_phones = pa.get("forced_alignment_phones", [])
            w2v_phones = (ai.get("wav2vec", {}) or {}).get("phonemes", [])
            phones = fa_phones if fa_phones else w2v_phones

            if not phones:
                continue

            labels = []
            for p in phones:
                labels.append({
                    "phoneme": p.get("phoneme") or p.get("phone", ""),
                    "start_ms": p.get("start_ms", 0),
                    "end_ms": p.get("end_ms", 0),
                })

            record = {
                "audio_filepath": str(audio_path),
                "phoneme_labels": labels,
                "source": "forced_alignment" if fa_phones else "wav2vec_ctc",
                "duration": round(duration, 3),
                "speaker_id": doc.get("speakerId", "unknown"),
                "l1_language": doc.get("language", ""),
                "profile_id": str(doc["_id"]),
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1

    print(f"  Wav2Vec2: {count} samples -> {out / 'manifest.jsonl'}")
    return count


def export_audeep(
    collection,
    output_dir: Path,
    l1_filter: list[str] | None,
) -> int:
    """Export mel spectrograms as NPZ for auDeep GRU fine-tuning."""
    out = output_dir / "audeep"
    out.mkdir(parents=True, exist_ok=True)

    query: dict = {"featureExtraction.librosa.mel_spectrogram": {"$exists": True}}
    if l1_filter:
        query["language"] = {"$in": l1_filter}

    spectrograms = []
    labels = []
    profile_ids = []

    for doc in collection.find(query):
        mel = doc.get("featureExtraction", {}).get("librosa", {}).get("mel_spectrogram")
        if mel is None:
            continue

        arr = np.array(mel, dtype=np.float32)
        if arr.ndim != 2 or arr.shape[0] == 0:
            continue

        spectrograms.append(arr)

        l1 = doc.get("language", "unknown")
        labels.append(l1)
        profile_ids.append(str(doc["_id"]))

    if not spectrograms:
        print("  auDeep: 0 samples (no mel spectrograms found)")
        return 0

    np.savez_compressed(
        out / "spectrograms.npz",
        **{f"spec_{i}": s for i, s in enumerate(spectrograms)},
    )
    with open(out / "labels.jsonl", "w") as f:
        for i, (label, pid) in enumerate(zip(labels, profile_ids)):
            f.write(json.dumps({"index": i, "l1_language": label, "profile_id": pid}) + "\n")

    print(f"  auDeep: {len(spectrograms)} samples -> {out / 'spectrograms.npz'}")
    return len(spectrograms)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Vani training data from MongoDB")
    parser.add_argument("--output", type=str, default="./training_data", help="Output directory")
    parser.add_argument("--mongo-uri", type=str, default=None, help="MongoDB URI (default: from .env)")
    parser.add_argument("--upload-dir", type=str, default=None, help="Audio upload directory")
    parser.add_argument("--l1", nargs="*", default=None, help="Filter by L1 language codes (bho hin ben ori)")
    parser.add_argument("--min-duration", type=float, default=1.0, help="Min audio duration in seconds")
    parser.add_argument("--models", nargs="*", default=["whisper", "wav2vec2", "audeep"],
                        choices=["whisper", "wav2vec2", "audeep"], help="Which datasets to export")
    args = parser.parse_args()

    # Resolve config
    if args.mongo_uri is None:
        from dotenv import load_dotenv
        import os
        load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
        args.mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/contrastive_voice")

    if args.upload_dir is None:
        upload_dir = Path(__file__).resolve().parent.parent / "uploads"
    else:
        upload_dir = Path(args.upload_dir).resolve()

    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Connecting to {args.mongo_uri} ...")
    client = connect(args.mongo_uri)
    db = client.get_default_database()
    profiles = db["voiceprofiles"]

    total = profiles.count_documents({})
    print(f"Found {total} voice profiles in database\n")

    if total == 0:
        print("No profiles yet. Run school pilots to collect data!")
        sys.exit(0)

    totals: dict[str, int] = {}
    if "whisper" in args.models:
        totals["whisper"] = export_whisper(profiles, output_dir, upload_dir, args.l1, args.min_duration)
    if "wav2vec2" in args.models:
        totals["wav2vec2"] = export_wav2vec(profiles, output_dir, upload_dir, args.l1, args.min_duration)
    if "audeep" in args.models:
        totals["audeep"] = export_audeep(profiles, output_dir, args.l1)

    print(f"\nExport complete -> {output_dir}")
    for model, n in totals.items():
        print(f"  {model}: {n} samples")

    client.close()


if __name__ == "__main__":
    main()
