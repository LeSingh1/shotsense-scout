"""Reproducibility: seed_everything locks numpy + Python random.

Cannot easily test XGBoost determinism without libomp on this machine; the
LogisticRegression baseline is deterministic regardless and is tested in
test_train_baseline.py.
"""

from __future__ import annotations

import os
import random

import numpy as np

from nba_shot_quality.seed import seed_everything


def test_seed_everything_locks_numpy() -> None:
    seed_everything(42)
    a = np.random.rand(5)
    seed_everything(42)
    b = np.random.rand(5)
    np.testing.assert_array_equal(a, b)


def test_seed_everything_locks_python_random() -> None:
    seed_everything(42)
    a = [random.random() for _ in range(5)]
    seed_everything(42)
    b = [random.random() for _ in range(5)]
    assert a == b


def test_seed_everything_sets_pythonhashseed() -> None:
    seed_everything(123)
    assert os.environ["PYTHONHASHSEED"] == "123"


def test_different_seeds_produce_different_streams() -> None:
    seed_everything(1)
    a = np.random.rand(5)
    seed_everything(2)
    b = np.random.rand(5)
    assert not np.allclose(a, b)
