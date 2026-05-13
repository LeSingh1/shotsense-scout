"""Versioned model persistence.

`save_model` writes `models/{season}-{timestamp}.joblib` and points
`models/latest.joblib` (a symlink) at it. `load_latest` reads through that
symlink. Stale-symlink case (target deleted but symlink survives) returns a
clear, user-actionable error.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

import joblib

from ..config import LATEST_MODEL_SYMLINK, MODELS_DIR

logger = logging.getLogger(__name__)


def save_model(pipeline: Any, *, season: str, models_dir: Path | None = None) -> Path:
    """Save a fitted sklearn Pipeline. Returns the path of the timestamped artifact.

    Also (re)creates `models/latest.joblib` as a symlink to this artifact.
    """
    models_dir = Path(models_dir) if models_dir is not None else MODELS_DIR
    models_dir.mkdir(parents=True, exist_ok=True)

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    artifact = models_dir / f"{season}-{timestamp}.joblib"
    joblib.dump(pipeline, artifact)

    latest = models_dir / "latest.joblib"
    # Replace symlink atomically. Path.symlink_to does not overwrite, so unlink first.
    if latest.is_symlink() or latest.exists():
        latest.unlink()
    # Relative target keeps the symlink portable inside the models/ dir.
    latest.symlink_to(artifact.name)
    logger.info("save_model: wrote %s; updated symlink %s", artifact, latest)
    return artifact


def load_latest(models_dir: Path | None = None) -> Any:
    """Load the most recently saved pipeline via `models/latest.joblib`.

    Raises FileNotFoundError with an actionable message if the symlink is
    missing OR points at a deleted file (stale symlink).
    """
    models_dir = Path(models_dir) if models_dir is not None else MODELS_DIR
    latest = models_dir / "latest.joblib"

    if not latest.is_symlink() and not latest.exists():
        raise FileNotFoundError(
            f"No model artifact at {latest}. "
            "Run `python scripts/run_pipeline.py` to train first."
        )

    # Resolve to detect stale symlink (symlink exists, target doesn't).
    resolved = latest.resolve()
    if not resolved.exists():
        raise FileNotFoundError(
            f"Stale symlink: {latest} -> {resolved}, target missing. "
            "Run `python scripts/run_pipeline.py` to retrain."
        )

    return joblib.load(resolved)
