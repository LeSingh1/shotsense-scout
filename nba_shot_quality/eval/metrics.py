"""Metrics, calibration deciles, and the calibration warning gate."""

from __future__ import annotations

import logging
from typing import TypedDict

import numpy as np
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

from ..config import CALIBRATION_N_DECILES, CALIBRATION_WARNING_THRESHOLD

logger = logging.getLogger(__name__)


class MetricsDict(TypedDict):
    log_loss: float
    brier: float
    roc_auc: float


def compute_metrics(y_true: np.ndarray, y_pred_proba: np.ndarray) -> MetricsDict:
    """Compute log loss, Brier score, ROC-AUC.

    `roc_auc` is NaN (with a logged warning) if y_true is single-class — log
    loss and Brier are still well-defined in that case.
    """
    y_true = np.asarray(y_true).astype(int)
    y_pred_proba = np.asarray(y_pred_proba).astype(float)

    ll = float(log_loss(y_true, y_pred_proba, labels=[0, 1]))
    bs = float(brier_score_loss(y_true, y_pred_proba))

    if len(np.unique(y_true)) < 2:
        logger.warning("compute_metrics: y_true is single-class; AUC is undefined.")
        auc = float("nan")
    else:
        auc = float(roc_auc_score(y_true, y_pred_proba))

    return {"log_loss": ll, "brier": bs, "roc_auc": auc}


def calibration_deciles(
    y_true: np.ndarray,
    y_pred_proba: np.ndarray,
    n_bins: int = CALIBRATION_N_DECILES,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (bin_centers, predicted_mean, actual_rate) for `n_bins` quantile bins.

    Quantile-based bins (not equal-width) so each bin has roughly the same
    number of shots. This matches what's commonly called a "decile reliability
    diagram" in sabermetrics.
    """
    y_true = np.asarray(y_true).astype(int)
    y_pred_proba = np.asarray(y_pred_proba).astype(float)

    # np.quantile edges; drop duplicates if many ties (rare in practice).
    edges = np.unique(np.quantile(y_pred_proba, np.linspace(0, 1, n_bins + 1)))
    if len(edges) < 2:
        # Pathological case: all predictions identical.
        return np.array([y_pred_proba[0]]), np.array([y_pred_proba[0]]), np.array([y_true.mean()])

    bin_indices = np.clip(np.digitize(y_pred_proba, edges[1:-1]), 0, len(edges) - 2)
    centers, pred_mean, actual_rate = [], [], []
    for i in range(len(edges) - 1):
        mask = bin_indices == i
        if mask.sum() == 0:
            continue
        centers.append(0.5 * (edges[i] + edges[i + 1]))
        pred_mean.append(y_pred_proba[mask].mean())
        actual_rate.append(y_true[mask].mean())
    return np.array(centers), np.array(pred_mean), np.array(actual_rate)


def check_calibration_warning(
    y_true: np.ndarray,
    y_pred_proba: np.ndarray,
    *,
    threshold: float = CALIBRATION_WARNING_THRESHOLD,
    n_bins: int = CALIBRATION_N_DECILES,
) -> tuple[bool, float]:
    """Return (warning_triggered, max_deciles_off).

    Triggers a logged warning if ANY decile has |predicted_mean - actual_rate|
    > threshold. Returns the max deviation observed.
    """
    _, pred_mean, actual_rate = calibration_deciles(y_true, y_pred_proba, n_bins=n_bins)
    if len(pred_mean) == 0:
        return False, 0.0
    deviations = np.abs(pred_mean - actual_rate)
    max_dev = float(deviations.max())
    warn = max_dev > threshold
    if warn:
        logger.warning(
            "check_calibration_warning: max decile deviation %.3f exceeds threshold %.3f. "
            "Consider rerunning with --calibrate for isotonic post-processing.",
            max_dev, threshold,
        )
    return warn, max_dev
