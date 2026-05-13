"""GroupKFold training loop for XGBoost + LogisticRegression baseline.

Both models are trained on the SAME outer fold splits so the comparison is
direct. The XGBoost Pipeline uses TargetEncoder (refit per outer fold).

Critical correctness:
  - GroupKFold(n_splits=CV_N_SPLITS) on GAME_ID — no game appears in both
    train and val for any fold.
  - TargetEncoder lives inside the Pipeline, so it's refit per outer fold.
    Its INNER CV (default 5) is not group-aware; this is documented in the
    design doc and accepted (outer GroupKFold is the real holdout).
  - Early stopping: XGBoost holds out VAL_FRACTION of the OUTER-fold train
    set as its early-stopping validation, drawn group-aware (random sample
    of unique GAME_IDs within the outer train).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from ..config import CV_N_SPLITS, SEED, VAL_FRACTION
from ..eval.metrics import compute_metrics
from ..features.engineer import build_pipeline

logger = logging.getLogger(__name__)


@dataclass
class FoldResult:
    fold: int
    log_loss: float
    brier: float
    roc_auc: float
    n_train: int
    n_val: int
    best_iteration: int | None = None


@dataclass
class CVResult:
    """Output of a full GroupKFold training run."""

    model_name: str
    folds: list[FoldResult] = field(default_factory=list)
    # The pipeline refit on the FULL dataset after CV (this is what gets saved).
    final_pipeline: Any = None
    # Out-of-fold predictions, aligned with the input X's index.
    oof_predictions: np.ndarray | None = None

    @property
    def mean_log_loss(self) -> float:
        return float(np.mean([f.log_loss for f in self.folds]))

    @property
    def mean_auc(self) -> float:
        return float(np.mean([f.roc_auc for f in self.folds]))

    @property
    def mean_brier(self) -> float:
        return float(np.mean([f.brier for f in self.folds]))


def _split_train_val_groupwise(
    train_idx: np.ndarray,
    groups: np.ndarray,
    val_fraction: float,
    rng: np.random.Generator,
) -> tuple[np.ndarray, np.ndarray]:
    """Within an outer-fold train set, hold out a group-aware validation slice
    for XGBoost early stopping.

    Picks `val_fraction` of unique GAME_IDs at random; all shots from those
    games go to val.
    """
    train_groups = groups[train_idx]
    unique_groups = np.unique(train_groups)
    rng.shuffle(unique_groups)
    n_val_groups = max(1, int(len(unique_groups) * val_fraction))
    val_groups = set(unique_groups[:n_val_groups].tolist())
    mask_val = np.isin(train_groups, list(val_groups))
    inner_val_idx = train_idx[mask_val]
    inner_train_idx = train_idx[~mask_val]
    return inner_train_idx, inner_val_idx


def train_with_cv(
    X: pd.DataFrame,
    y: pd.Series,
    groups: pd.Series,
    *,
    n_splits: int = CV_N_SPLITS,
    seed: int = SEED,
) -> CVResult:
    """Train XGBoost via GroupKFold. Returns CV metrics + a final pipeline.

    Final pipeline is refit on ALL data after CV completes; this is what
    `predict.py` will use.
    """
    if len(np.unique(groups)) < n_splits:
        raise ValueError(
            f"train_with_cv: only {len(np.unique(groups))} unique groups but "
            f"n_splits={n_splits}. Use a smaller n_splits or more data."
        )

    rng = np.random.default_rng(seed)
    splitter = GroupKFold(n_splits=n_splits)
    result = CVResult(model_name="xgb")
    oof = np.full(len(X), fill_value=np.nan, dtype=float)

    for fold_idx, (train_idx, val_idx) in enumerate(
        splitter.split(X, y, groups=groups), start=1
    ):
        # Group-aware early-stopping val inside the outer train.
        inner_train_idx, inner_val_idx = _split_train_val_groupwise(
            train_idx, groups.values, VAL_FRACTION, rng
        )

        pipeline = build_pipeline(model="xgb")

        # The XGBClassifier inside the pipeline needs an eval_set in preprocessed
        # space. We use sklearn's Pipeline `fit` with named-step kwargs:
        # the preprocessor fits first, then we hand XGBoost a preprocessed eval set.
        # Pattern: fit_transform the early-stop val through the preprocessor only.
        X_tr = X.iloc[inner_train_idx]
        y_tr = y.iloc[inner_train_idx]
        X_es = X.iloc[inner_val_idx]
        y_es = y.iloc[inner_val_idx]
        X_va = X.iloc[val_idx]
        y_va = y.iloc[val_idx]

        # Fit preprocessor on the inner-train fold; transform the early-stop val.
        # Then fit XGB with that as eval_set so early stopping triggers correctly.
        preproc = pipeline.named_steps["preprocessor"]
        preproc.fit(X_tr, y_tr)
        X_es_t = preproc.transform(X_es)
        X_tr_t = preproc.transform(X_tr)

        clf = pipeline.named_steps["classifier"]
        clf.fit(X_tr_t, y_tr, eval_set=[(X_es_t, y_es)], verbose=False)

        # Score the outer-fold val.
        X_va_t = preproc.transform(X_va)
        proba = clf.predict_proba(X_va_t)[:, 1]
        oof[val_idx] = proba

        m = compute_metrics(y_va.values, proba)
        fold_result = FoldResult(
            fold=fold_idx,
            log_loss=m["log_loss"],
            brier=m["brier"],
            roc_auc=m["roc_auc"],
            n_train=len(inner_train_idx),
            n_val=len(val_idx),
            best_iteration=getattr(clf, "best_iteration", None),
        )
        result.folds.append(fold_result)
        logger.info(
            "[xgb fold %d/%d] n_tr=%d n_es=%d n_va=%d  log_loss=%.4f auc=%.4f brier=%.4f%s",
            fold_idx, n_splits, len(inner_train_idx), len(inner_val_idx), len(val_idx),
            fold_result.log_loss, fold_result.roc_auc, fold_result.brier,
            f" best_iter={fold_result.best_iteration}" if fold_result.best_iteration else "",
        )

    # Final refit on ALL data — this is the artifact predict.py loads.
    # Use the median best_iteration from CV (or n_estimators if none).
    median_best = int(np.median([f.best_iteration for f in result.folds if f.best_iteration]))
    final_pipeline = build_pipeline(model="xgb")
    # Strip early stopping for the final fit — no eval set.
    final_pipeline.named_steps["classifier"].set_params(
        n_estimators=max(1, median_best or final_pipeline.named_steps["classifier"].n_estimators),
        early_stopping_rounds=None,
    )
    final_pipeline.fit(X, y)

    result.final_pipeline = final_pipeline
    result.oof_predictions = oof
    return result


def train_baseline(
    X: pd.DataFrame,
    y: pd.Series,
    groups: pd.Series,
    *,
    n_splits: int = CV_N_SPLITS,
    seed: int = SEED,
) -> CVResult:
    """Train the LogisticRegression baseline on the same GroupKFold splits.

    Same interface as train_with_cv. No early stopping needed (LogReg converges
    deterministically).
    """
    splitter = GroupKFold(n_splits=n_splits)
    result = CVResult(model_name="logreg")
    oof = np.full(len(X), fill_value=np.nan, dtype=float)

    for fold_idx, (train_idx, val_idx) in enumerate(
        splitter.split(X, y, groups=groups), start=1
    ):
        pipeline = build_pipeline(model="logreg")
        pipeline.fit(X.iloc[train_idx], y.iloc[train_idx])
        proba = pipeline.predict_proba(X.iloc[val_idx])[:, 1]
        oof[val_idx] = proba

        m = compute_metrics(y.iloc[val_idx].values, proba)
        fold_result = FoldResult(
            fold=fold_idx,
            log_loss=m["log_loss"],
            brier=m["brier"],
            roc_auc=m["roc_auc"],
            n_train=len(train_idx),
            n_val=len(val_idx),
        )
        result.folds.append(fold_result)
        logger.info(
            "[logreg fold %d/%d] n_tr=%d n_va=%d  log_loss=%.4f auc=%.4f brier=%.4f",
            fold_idx, n_splits, len(train_idx), len(val_idx),
            fold_result.log_loss, fold_result.roc_auc, fold_result.brier,
        )

    final_pipeline = build_pipeline(model="logreg")
    final_pipeline.fit(X, y)
    result.final_pipeline = final_pipeline
    result.oof_predictions = oof
    return result
