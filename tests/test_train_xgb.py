"""XGBoost training (CV loop + Pipeline w/ TargetEncoder).

Skipped on machines without libomp (macOS without `brew install libomp`).
Critical-Path-2 test (TargetEncoder fold isolation) lives here.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

try:
    import xgboost
    xgboost.XGBClassifier()                          # libomp link check
except Exception as e:                                # noqa: BLE001
    pytest.skip(f"XGBoost runtime unavailable: {e}", allow_module_level=True)

from nba_shot_quality.config import CV_N_SPLITS  # noqa: E402
from nba_shot_quality.features import engineer_features  # noqa: E402
from nba_shot_quality.features.engineer import ALL_FEATURE_COLS, build_pipeline  # noqa: E402
from nba_shot_quality.model.train import train_with_cv  # noqa: E402


@pytest.fixture
def engineered_mini(mini_shots: pd.DataFrame, mini_games: pd.DataFrame) -> pd.DataFrame:
    return engineer_features(mini_shots, mini_games)


def test_pipeline_has_target_encoder_step() -> None:
    pipe = build_pipeline(model="xgb")
    preproc = pipe.named_steps["preprocessor"]
    transformer_names = [n for n, _, _ in preproc.transformers]
    assert "target_enc" in transformer_names


def test_target_encoder_refit_per_outer_fold(engineered_mini: pd.DataFrame) -> None:
    """Critical Path 2: TargetEncoder learned encodings differ between outer folds."""
    X = engineered_mini[list(ALL_FEATURE_COLS)]
    y = engineered_mini["SHOT_MADE_FLAG"].astype(int)
    groups = engineered_mini["GAME_ID"].astype(str)

    n_groups = groups.nunique()
    n_splits = min(CV_N_SPLITS, n_groups)
    from sklearn.model_selection import GroupKFold
    splitter = GroupKFold(n_splits=n_splits)
    folds = list(splitter.split(X, y, groups=groups))

    enc_means: list[np.ndarray] = []
    for train_idx, _ in folds[:2]:
        pipe = build_pipeline(model="xgb")
        preproc = pipe.named_steps["preprocessor"]
        preproc.fit(X.iloc[train_idx], y.iloc[train_idx])
        # TargetEncoder.encodings_ exposes the per-category learned target means
        te = preproc.named_transformers_["target_enc"]
        # encodings_ is a list (one per encoded column); flatten to compare
        enc_means.append(np.concatenate([np.asarray(e).ravel() for e in te.encodings_]))

    # Encodings should differ across folds (refit per fold)
    assert not np.allclose(enc_means[0], enc_means[1]), (
        "TargetEncoder produced identical encodings across folds — refit not happening"
    )


def test_train_with_cv_returns_oof_predictions(engineered_mini: pd.DataFrame) -> None:
    X = engineered_mini[list(ALL_FEATURE_COLS)]
    y = engineered_mini["SHOT_MADE_FLAG"].astype(int)
    groups = engineered_mini["GAME_ID"].astype(str)

    n_splits = min(CV_N_SPLITS, groups.nunique())
    result = train_with_cv(X, y, groups, n_splits=n_splits)

    assert result.model_name == "xgb"
    assert len(result.folds) == n_splits
    assert result.final_pipeline is not None
    assert not np.isnan(result.oof_predictions).any()
    assert ((result.oof_predictions >= 0) & (result.oof_predictions <= 1)).all()


def test_train_with_cv_raises_on_too_few_groups(engineered_mini: pd.DataFrame) -> None:
    """If groups < n_splits, raise (don't silently fall back)."""
    X = engineered_mini[list(ALL_FEATURE_COLS)]
    y = engineered_mini["SHOT_MADE_FLAG"].astype(int)
    groups = engineered_mini["GAME_ID"].astype(str)

    with pytest.raises(ValueError, match="unique groups"):
        train_with_cv(X, y, groups, n_splits=100)
