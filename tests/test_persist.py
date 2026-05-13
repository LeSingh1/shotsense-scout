"""Model artifact persistence: timestamped joblib + latest.joblib symlink."""

from __future__ import annotations

from pathlib import Path

import joblib
import pytest
from sklearn.dummy import DummyClassifier
from sklearn.pipeline import Pipeline

from nba_shot_quality.model.persist import load_latest, save_model


def _dummy_pipeline() -> Pipeline:
    return Pipeline([("clf", DummyClassifier(strategy="prior"))])


def test_save_model_writes_timestamped_artifact(tmp_path: Path) -> None:
    pipe = _dummy_pipeline()
    pipe.fit([[1], [2], [3]], [0, 1, 0])
    artifact = save_model(pipe, season="2025-26", models_dir=tmp_path)
    assert artifact.exists()
    assert artifact.name.startswith("2025-26-")
    assert artifact.suffix == ".joblib"


def test_save_model_updates_latest_symlink(tmp_path: Path) -> None:
    pipe = _dummy_pipeline()
    pipe.fit([[1], [2], [3]], [0, 1, 0])
    artifact = save_model(pipe, season="2025-26", models_dir=tmp_path)
    latest = tmp_path / "latest.joblib"
    assert latest.is_symlink()
    assert latest.resolve() == artifact


def test_save_model_replaces_old_symlink(tmp_path: Path) -> None:
    pipe = _dummy_pipeline()
    pipe.fit([[1], [2], [3]], [0, 1, 0])
    a1 = save_model(pipe, season="2025-26", models_dir=tmp_path)
    import time as _t
    _t.sleep(1.1)            # ensure different timestamp
    a2 = save_model(pipe, season="2025-26", models_dir=tmp_path)
    assert a1 != a2
    latest = tmp_path / "latest.joblib"
    assert latest.resolve() == a2


def test_load_latest_round_trips(tmp_path: Path) -> None:
    pipe = _dummy_pipeline()
    pipe.fit([[1], [2], [3]], [0, 1, 0])
    save_model(pipe, season="2025-26", models_dir=tmp_path)
    loaded = load_latest(models_dir=tmp_path)
    assert hasattr(loaded, "predict_proba")


def test_load_latest_missing_raises_clear_error(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="No model artifact"):
        load_latest(models_dir=tmp_path)


def test_load_latest_stale_symlink_raises(tmp_path: Path) -> None:
    """Symlink exists but target was deleted → clear error."""
    pipe = _dummy_pipeline()
    pipe.fit([[1], [2], [3]], [0, 1, 0])
    artifact = save_model(pipe, season="2025-26", models_dir=tmp_path)
    artifact.unlink()        # delete the target, keep symlink
    with pytest.raises(FileNotFoundError, match="Stale symlink"):
        load_latest(models_dir=tmp_path)
