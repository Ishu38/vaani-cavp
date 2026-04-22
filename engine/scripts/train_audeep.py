"""
Train the auDeep GRU spectrogram autoencoder on Vani-collected data.

Reads the NPZ spectrograms + labels exported by export_training_data.py
and trains the sequence-to-sequence GRU autoencoder defined in
engine/modules/audeep.py.  The trained checkpoint can then be loaded at
inference time for proper latent representations.

Usage:
    # Basic (trains on all exported spectrograms):
    python engine/scripts/train_audeep.py \
        --data ./training_data/audeep

    # Custom:
    python engine/scripts/train_audeep.py \
        --data ./training_data/audeep \
        --output ./models/audeep-vani \
        --epochs 100 \
        --batch-size 16 \
        --learning-rate 1e-3 \
        --latent-dim 256
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader, random_split

# ── Add engine/ to path so we can import the autoencoder definition ─────
ENGINE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ENGINE_DIR))

from modules.audeep import (
    _build_autoencoder,
    MEL_BANDS,
    MAX_FRAMES,
    LATENT_DIM,
    HIDDEN_DIM,
    NUM_LAYERS,
)


# ── Dataset ─────────────────────────────────────────────────────────────

class SpectrogramDataset(Dataset):
    """Load mel spectrograms from the NPZ archive produced by export_training_data."""

    def __init__(self, npz_path: Path, labels_path: Path | None = None) -> None:
        data = np.load(str(npz_path), allow_pickle=False)
        self.specs: list[np.ndarray] = []
        self.labels: list[str] = []

        # Keys are "spec_0", "spec_1", …
        indices = sorted(
            (int(k.split("_")[1]), k) for k in data.files if k.startswith("spec_")
        )
        for _, key in indices:
            arr = data[key].astype(np.float32)
            # Ensure shape is (time, mel_bands) and pad/truncate to MAX_FRAMES
            if arr.ndim != 2:
                continue
            if arr.shape[1] != MEL_BANDS:
                # Transpose if stored as (mel_bands, time)
                if arr.shape[0] == MEL_BANDS:
                    arr = arr.T
                else:
                    continue
            arr = _pad_or_truncate(arr)
            self.specs.append(arr)

        # Load optional L1 labels (for downstream evaluation, not used in AE loss)
        if labels_path and labels_path.exists():
            with open(labels_path) as f:
                for line in f:
                    obj = json.loads(line)
                    self.labels.append(obj.get("l1_language", "unknown"))
        # Pad labels list to match specs if needed
        while len(self.labels) < len(self.specs):
            self.labels.append("unknown")

    def __len__(self) -> int:
        return len(self.specs)

    def __getitem__(self, idx: int) -> dict:
        return {
            "spectrogram": torch.from_numpy(self.specs[idx]),
            "label": self.labels[idx],
        }


def _pad_or_truncate(arr: np.ndarray) -> np.ndarray:
    """Ensure spectrogram has exactly MAX_FRAMES time steps."""
    if arr.shape[0] > MAX_FRAMES:
        return arr[:MAX_FRAMES]
    elif arr.shape[0] < MAX_FRAMES:
        pad = np.zeros((MAX_FRAMES - arr.shape[0], MEL_BANDS), dtype=np.float32)
        return np.vstack([arr, pad])
    return arr


# ── Training loop ───────────────────────────────────────────────────────

def train_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    device: str,
) -> float:
    model.train()
    total_loss = 0.0
    n_batches = 0

    for batch in loader:
        x = batch["spectrogram"].to(device)  # (B, T, mel_bands)
        recon, z = model(x)
        loss = nn.functional.mse_loss(recon, x)

        optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
        optimizer.step()

        total_loss += loss.item()
        n_batches += 1

    return total_loss / max(n_batches, 1)


@torch.no_grad()
def eval_epoch(model: nn.Module, loader: DataLoader, device: str) -> float:
    model.eval()
    total_loss = 0.0
    n_batches = 0

    for batch in loader:
        x = batch["spectrogram"].to(device)
        recon, z = model(x)
        loss = nn.functional.mse_loss(recon, x)
        total_loss += loss.item()
        n_batches += 1

    return total_loss / max(n_batches, 1)


# ── Main ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Train auDeep GRU autoencoder on Vani spectrograms")
    parser.add_argument("--data", type=str, required=True,
                        help="Directory containing spectrograms.npz (from export_training_data.py)")
    parser.add_argument("--output", type=str, default="./models/audeep-vani",
                        help="Output directory for trained checkpoint")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-5)
    parser.add_argument("--eval-split", type=float, default=0.1,
                        help="Fraction of data for validation")
    parser.add_argument("--patience", type=int, default=15,
                        help="Early stopping patience (epochs without improvement)")
    parser.add_argument("--latent-dim", type=int, default=LATENT_DIM)
    parser.add_argument("--hidden-dim", type=int, default=HIDDEN_DIM)
    parser.add_argument("--num-layers", type=int, default=NUM_LAYERS)
    parser.add_argument("--device", type=str, default=None,
                        help="Device (default: auto-detect)")
    args = parser.parse_args()

    # Resolve paths
    data_dir = Path(args.data).resolve()
    npz_path = data_dir / "spectrograms.npz"
    labels_path = data_dir / "labels.jsonl"
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not npz_path.exists():
        print(f"Error: {npz_path} not found.")
        print("Run export_training_data.py first to generate spectrogram data.")
        sys.exit(1)

    # Device
    if args.device:
        device = args.device
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"
    print(f"Device: {device}")

    # Load dataset
    print(f"Loading spectrograms from {npz_path} ...")
    dataset = SpectrogramDataset(npz_path, labels_path)
    print(f"  Total samples: {len(dataset)}")

    if len(dataset) < 5:
        print("Error: Need at least 5 spectrograms to train. Collect more data first.")
        sys.exit(1)

    # Train/val split
    n_val = max(1, int(len(dataset) * args.eval_split))
    n_train = len(dataset) - n_val
    train_set, val_set = random_split(
        dataset, [n_train, n_val], generator=torch.Generator().manual_seed(42)
    )
    print(f"  Train: {n_train}, Val: {n_val}")

    train_loader = DataLoader(
        train_set, batch_size=args.batch_size, shuffle=True,
        num_workers=2, pin_memory=(device == "cuda"),
    )
    val_loader = DataLoader(
        val_set, batch_size=args.batch_size, shuffle=False,
        num_workers=2, pin_memory=(device == "cuda"),
    )

    # Build model
    ModelClass = _build_autoencoder()
    if ModelClass is None:
        print("Error: PyTorch not available. Cannot build autoencoder.")
        sys.exit(1)

    model = ModelClass(
        input_dim=MEL_BANDS,
        hidden_dim=args.hidden_dim,
        latent_dim=args.latent_dim,
        num_layers=args.num_layers,
    ).to(device)

    param_count = sum(p.numel() for p in model.parameters())
    print(f"  Model parameters: {param_count:,}")

    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.learning_rate, weight_decay=args.weight_decay
    )
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=5, min_lr=1e-6
    )

    # Training
    best_val_loss = float("inf")
    patience_counter = 0
    checkpoint_path = output_dir / "audeep_autoencoder.pt"

    print(f"\nTraining for up to {args.epochs} epochs (patience={args.patience})...\n")
    print(f"{'Epoch':>6}  {'Train Loss':>12}  {'Val Loss':>12}  {'LR':>10}  {'Status'}")
    print("-" * 64)

    for epoch in range(1, args.epochs + 1):
        train_loss = train_epoch(model, train_loader, optimizer, device)
        val_loss = eval_epoch(model, val_loader, device)
        lr = optimizer.param_groups[0]["lr"]

        status = ""
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            # Save best checkpoint
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "val_loss": val_loss,
                "train_loss": train_loss,
                "config": {
                    "input_dim": MEL_BANDS,
                    "hidden_dim": args.hidden_dim,
                    "latent_dim": args.latent_dim,
                    "num_layers": args.num_layers,
                    "max_frames": MAX_FRAMES,
                },
            }, checkpoint_path)
            status = "* saved"
        else:
            patience_counter += 1

        scheduler.step(val_loss)

        print(f"{epoch:>6}  {train_loss:>12.6f}  {val_loss:>12.6f}  {lr:>10.2e}  {status}")

        if patience_counter >= args.patience:
            print(f"\nEarly stopping at epoch {epoch} (no improvement for {args.patience} epochs)")
            break

    # Save final metadata
    meta = {
        "best_val_loss": best_val_loss,
        "total_samples": len(dataset),
        "train_samples": n_train,
        "val_samples": n_val,
        "config": {
            "input_dim": MEL_BANDS,
            "hidden_dim": args.hidden_dim,
            "latent_dim": args.latent_dim,
            "num_layers": args.num_layers,
            "max_frames": MAX_FRAMES,
            "mel_bands": MEL_BANDS,
        },
        "hyperparameters": {
            "epochs_run": epoch,
            "batch_size": args.batch_size,
            "learning_rate": args.learning_rate,
            "weight_decay": args.weight_decay,
            "patience": args.patience,
        },
    }
    with open(output_dir / "training_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nBest val loss: {best_val_loss:.6f}")
    print(f"Checkpoint saved to: {checkpoint_path}")
    print(f"Metadata saved to: {output_dir / 'training_meta.json'}")
    print(f"\nTo use in Vani, set AUDEEP_MODEL={checkpoint_path} in .env")


if __name__ == "__main__":
    main()
