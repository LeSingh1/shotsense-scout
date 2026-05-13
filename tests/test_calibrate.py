"""Isotonic post-processing improves miscalibrated probabilities."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from sklearn.dummy import DummyClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer

from nba_shot_quality.model.calibrate import apply_isotonic_calibration


class _ConstantProbaModel:
    """Predicts a fixed probability — easy to construct mis/well-calibrated."""

    def __init__(self, p: float):
        self.p = p

    def predict_proba(self, X):
        n = len(X)
        return np.column_stack([np.full(n, 1 - self.p), np.full(n, self.p)])


def test_apply_isotonic_returns_calibrated_pipeline() -> None:
    rng = np.random.default_rng(42)
    n = 500
    # Miscalibrated: predict 0.7, actual rate 0.4
    oof = np.full(n, 0.7)
    y_true = (rng.uniform(size=n) < 0.4).astype(int)

    cal = apply_isotonic_calibration(_ConstantProbaModel(0.7), oof, y_true)
    assert hasattr(cal, "predict_proba")

    # Calibrated probability should be much closer to 0.4 than to 0.7
    X = pd.DataFrame({"x": np.zeros(100)})
    proba = cal.predict_proba(X)[:, 1]
    assert abs(proba.mean() - 0.4) < 0.1


def test_apply_isotonic_handles_nan_oof() -> None:
    """OOF arrays may contain NaN for rows that weren't in any held-out fold."""
    rng = np.random.default_rng(42)
    n = 500
    oof = np.full(n, 0.7)
    oof[:50] = np.nan
    y_true = (rng.uniform(size=n) < 0.4).astype(int)
    cal = apply_isotonic_calibration(_ConstantProbaModel(0.7), oof, y_true)
    assert cal.calibrator is not None


def test_apply_isotonic_raises_on_all_nan() -> None:
    oof = np.full(100, np.nan)
    with pytest.raises(ValueError, match="no out-of-fold predictions"):
        apply_isotonic_calibration(_ConstantProbaModel(0.5), oof, np.zeros(100))


def test_calibrated_pipeline_predict_returns_binary() -> None:
    rng = np.random.default_rng(42)
    n = 200
    oof = rng.uniform(size=n)
    y_true = (oof > rng.uniform(size=n)).astype(int)
    cal = apply_isotonic_calibration(_ConstantProbaModel(0.5), oof, y_true)
    X = pd.DataFrame({"x": np.zeros(10)})
    pred = cal.predict(X)
    assert set(np.unique(pred)).issubset({0, 1})
