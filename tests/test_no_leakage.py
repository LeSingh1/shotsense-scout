"""GroupKFold outer-fold isolation — the critical-path no-leakage tests.

These tests don't require XGBoost (the splitter is sklearn-only). They
guarantee that no GAME_ID appears in both train and val of the same outer
fold — the regression-class invariant the design doc names as Critical
Path 1.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold


def test_groupkfold_outer_no_leakage(mini_shots: pd.DataFrame) -> None:
    """For every fold split: train games ∩ val games == ∅."""
    groups = mini_shots["GAME_ID"].values
    X = np.zeros((len(mini_shots), 1))
    y = mini_shots["SHOT_MADE_FLAG"].values

    n_groups = len(np.unique(groups))
    splitter = GroupKFold(n_splits=min(n_groups, 3))

    for fold_idx, (train_idx, val_idx) in enumerate(splitter.split(X, y, groups=groups)):
        train_groups = set(groups[train_idx])
        val_groups = set(groups[val_idx])
        intersection = train_groups & val_groups
        assert intersection == set(), (
            f"Fold {fold_idx}: GAME_IDs leak across folds: {intersection}"
        )


def test_groupkfold_covers_every_row_exactly_once(mini_shots: pd.DataFrame) -> None:
    """Every shot appears in exactly one validation fold."""
    groups = mini_shots["GAME_ID"].values
    X = np.zeros((len(mini_shots), 1))
    y = mini_shots["SHOT_MADE_FLAG"].values
    n_groups = len(np.unique(groups))
    splitter = GroupKFold(n_splits=min(n_groups, 3))

    val_counts = np.zeros(len(mini_shots), dtype=int)
    for _, val_idx in splitter.split(X, y, groups=groups):
        val_counts[val_idx] += 1

    assert (val_counts == 1).all()
