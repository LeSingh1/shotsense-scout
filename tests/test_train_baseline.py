"""LogisticRegression baseline training — runs without xgboost/libomp.

The XGBoost-dependent training path is gated by a skipif marker so the
suite passes on machines without libomp.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from nba_shot_quality.config import CV_N_SPLITS
from nba_shot_quality.features import engineer_features
from nba_shot_quality.features.engineer import ALL_FEATURE_COLS
from nba_shot_quality.model.train import train_baseline


@pytest.fixture
def engineered_mini(mini_shots: pd.DataFrame, mini_games: pd.DataFrame) -> pd.DataFrame:
    return engineer_features(mini_shots, mini_games)


def test_baseline_trains_and_returns_cv_result(engineered_mini: pd.DataFrame) -> None:
    X = engineered_mini[list(ALL_FEATURE_COLS)]
    y = engineered_mini["SHOT_MADE_FLAG"].astype(int)
    groups = engineered_mini["GAME_ID"].astype(str)

    n_groups = groups.nunique()
    n_splits = min(CV_N_SPLITS, n_groups)
    result = train_baseline(X, y, groups, n_splits=n_splits)

    assert result.model_name == "logreg"
    assert len(result.folds) == n_splits
    assert result.final_pipeline is not None
    assert result.oof_predictions is not None
    # OOF predictions should be filled for every row
    assert not np.isnan(result.oof_predictions).any()
    # Probabilities in [0, 1]
    assert ((result.oof_predictions >= 0) & (result.oof_predictions <= 1)).all()


def test_baseline_final_pipeline_predicts(engineered_mini: pd.DataFrame) -> None:
    X = engineered_mini[list(ALL_FEATURE_COLS)]
    y = engineered_mini["SHOT_MADE_FLAG"].astype(int)
    groups = engineered_mini["GAME_ID"].astype(str)

    result = train_baseline(X, y, groups, n_splits=min(CV_N_SPLITS, groups.nunique()))
    proba = result.final_pipeline.predict_proba(X.head(5))[:, 1]
    assert proba.shape == (5,)
    assert ((proba >= 0) & (proba <= 1)).all()


def test_baseline_metrics_are_finite(engineered_mini: pd.DataFrame) -> None:
    X = engineered_mini[list(ALL_FEATURE_COLS)]
    y = engineered_mini["SHOT_MADE_FLAG"].astype(int)
    groups = engineered_mini["GAME_ID"].astype(str)
    result = train_baseline(X, y, groups, n_splits=min(CV_N_SPLITS, groups.nunique()))
    assert np.isfinite(result.mean_log_loss)
    assert np.isfinite(result.mean_brier)
    # AUC can be NaN if a fold has single-class y; mean is fine either way for finite folds
    aucs = [f.roc_auc for f in result.folds if np.isfinite(f.roc_auc)]
    if aucs:
        assert 0 <= min(aucs) <= max(aucs) <= 1
