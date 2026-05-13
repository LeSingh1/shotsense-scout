"""Isotonic regression post-processing for miscalibrated probabilities.

XGBoost probabilities are often over-confident. We surface this via the
calibration curve in eval/metrics.py. If `--calibrate` is passed (or the
warning gate trips), we fit a one-dimensional `IsotonicRegression` mapping
raw_prob → calibrated_prob on out-of-fold predictions, and attach it to the
final pipeline.

The calibrator is a thin wrapper around the saved Pipeline so `predict.py`
gets calibrated probabilities transparently.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

logger = logging.getLogger(__name__)


@dataclass
class CalibratedPipeline:
    """A Pipeline + isotonic calibrator. Mimics Pipeline.predict_proba for downstream use."""

    pipeline: Any
    calibrator: IsotonicRegression

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        raw = self.pipeline.predict_proba(X)[:, 1]
        cal = self.calibrator.predict(raw)
        return np.column_stack([1.0 - cal, cal])

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


def apply_isotonic_calibration(
    pipeline: Any,
    oof_predictions: np.ndarray,
    y_true: np.ndarray,
) -> CalibratedPipeline:
    """Fit an isotonic regressor on out-of-fold predictions and wrap the pipeline.

    `oof_predictions` come from `CVResult.oof_predictions` (every shot has a
    prediction from when its game was in the held-out fold). Fitting the
    isotonic regressor on these gives an honest calibration map — same level
    of leakage protection as the GroupKFold itself.
    """
    mask = ~np.isnan(oof_predictions)
    if mask.sum() == 0:
        raise ValueError("apply_isotonic_calibration: no out-of-fold predictions provided")

    isotonic = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    isotonic.fit(oof_predictions[mask], np.asarray(y_true)[mask])

    logger.info(
        "apply_isotonic_calibration: fit on %d OOF predictions, range=[%.3f, %.3f]",
        mask.sum(), oof_predictions[mask].min(), oof_predictions[mask].max(),
    )
    return CalibratedPipeline(pipeline=pipeline, calibrator=isotonic)
