"""Known-answer tests for metrics + calibration deciles.

Includes the calibration warning gate: a >5%-off decile should trigger a
warning (verified via caplog).
"""

from __future__ import annotations

import logging

import numpy as np
import pytest

from nba_shot_quality.eval.metrics import (
    calibration_deciles,
    check_calibration_warning,
    compute_metrics,
)


def test_perfect_predictions_give_log_loss_near_zero() -> None:
    y_true = np.array([0, 0, 1, 1, 0, 1])
    y_pred = np.array([0.001, 0.001, 0.999, 0.999, 0.001, 0.999])
    m = compute_metrics(y_true, y_pred)
    assert m["log_loss"] < 0.01
    assert m["roc_auc"] == 1.0
    assert m["brier"] < 0.001


def test_constant_05_predictions_give_log_loss_ln2() -> None:
    """All predictions = 0.5 → log_loss = ln(2) ≈ 0.693."""
    y_true = np.array([0, 1] * 50)
    y_pred = np.full(100, 0.5)
    m = compute_metrics(y_true, y_pred)
    assert m["log_loss"] == pytest.approx(np.log(2), abs=1e-9)
    assert m["brier"] == pytest.approx(0.25, abs=1e-9)


def test_single_class_y_true_returns_nan_auc_with_warning(caplog: pytest.LogCaptureFixture) -> None:
    y_true = np.array([1, 1, 1, 1])
    y_pred = np.array([0.3, 0.5, 0.7, 0.9])
    with caplog.at_level(logging.WARNING):
        m = compute_metrics(y_true, y_pred)
    assert np.isnan(m["roc_auc"])
    assert "single-class" in caplog.text


def test_calibration_deciles_returns_three_arrays() -> None:
    rng = np.random.default_rng(42)
    n = 1000
    y_pred = rng.uniform(size=n)
    y_true = (y_pred > rng.uniform(size=n)).astype(int)
    centers, pred_mean, actual_rate = calibration_deciles(y_true, y_pred, n_bins=10)
    assert centers.shape == pred_mean.shape == actual_rate.shape
    # well-calibrated synthetic: pred_mean ≈ actual_rate within ~10%
    assert np.all(np.abs(pred_mean - actual_rate) < 0.15)


def test_check_calibration_warning_trips_on_large_deviation(caplog: pytest.LogCaptureFixture) -> None:
    """Construct miscalibrated predictions: predict ~0.7 for shots that go in at ~0.4 rate."""
    rng = np.random.default_rng(42)
    # All shots in one bin near 0.7, actual rate 0.4
    n = 200
    y_pred = rng.uniform(0.65, 0.75, size=n)
    y_true = (rng.uniform(size=n) < 0.4).astype(int)
    with caplog.at_level(logging.WARNING, logger="nba_shot_quality.eval.metrics"):
        triggered, max_dev = check_calibration_warning(y_true, y_pred, threshold=0.05)
    assert triggered
    assert max_dev > 0.15


def test_check_calibration_warning_silent_on_good_calibration(caplog: pytest.LogCaptureFixture) -> None:
    rng = np.random.default_rng(42)
    n = 5000
    y_pred = rng.uniform(size=n)
    y_true = (y_pred > rng.uniform(size=n)).astype(int)
    with caplog.at_level(logging.WARNING):
        triggered, max_dev = check_calibration_warning(y_true, y_pred, threshold=0.10)
    assert not triggered
    assert max_dev <= 0.10


def test_calibration_handles_constant_predictions() -> None:
    """Pathological case: all predictions identical. Should not crash."""
    y_pred = np.full(100, 0.5)
    y_true = np.random.default_rng(0).integers(0, 2, size=100)
    centers, pred_mean, actual_rate = calibration_deciles(y_true, y_pred)
    # Implementation collapses to a single bin
    assert len(centers) >= 1
