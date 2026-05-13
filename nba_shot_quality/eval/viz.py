"""Five visualizations: hex shot chart, feature importance, calibration curve,
model comparison (XGB vs LogReg), and player ranking with bootstrap CI bars.

All functions return a `matplotlib.figure.Figure` and DO NOT call `plt.show()`.
Saving is the caller's responsibility (handled in scripts/run_pipeline.py).
"""

from __future__ import annotations

from typing import Any

import matplotlib
matplotlib.use("Agg")                    # headless-safe; tests don't open windows
import matplotlib.pyplot as plt          # noqa: E402
import numpy as np                        # noqa: E402
import pandas as pd                       # noqa: E402


# --- 1. Hex shot chart ---------------------------------------------------


def hex_shot_chart(shots_with_pred: pd.DataFrame, *, gridsize: int = 30) -> plt.Figure:
    """Hexbin colored by mean xfg_pred. Court coords from nba_api shotchartdetail."""
    fig, ax = plt.subplots(figsize=(7, 6.5))
    hb = ax.hexbin(
        shots_with_pred["LOC_X"],
        shots_with_pred["LOC_Y"],
        C=shots_with_pred["xfg_pred"],
        reduce_C_function=np.mean,
        gridsize=gridsize,
        cmap="RdYlGn",
        mincnt=5,
    )
    cbar = fig.colorbar(hb, ax=ax)
    cbar.set_label("Mean xFG%")
    ax.set_xlim(-260, 260)
    ax.set_ylim(-50, 430)
    ax.set_aspect("equal")
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_title("Mean xFG% by floor location (2025-26 playoffs)")
    return fig


# --- 2. Feature importance -----------------------------------------------


def feature_importance_plot(pipeline: Any, *, top_n: int = 20) -> plt.Figure:
    """Bar chart of XGBoost feature importances after preprocessing.

    Works against a fitted Pipeline with steps ("preprocessor", "classifier").
    """
    preproc = pipeline.named_steps.get("preprocessor")
    clf = pipeline.named_steps.get("classifier")
    if preproc is None or clf is None:
        raise ValueError("feature_importance_plot: pipeline must have preprocessor + classifier steps")

    try:
        importances = clf.feature_importances_
    except AttributeError:
        # LogReg has coef_ instead. Use absolute coefficient magnitude.
        importances = np.abs(clf.coef_).ravel()

    try:
        names = preproc.get_feature_names_out()
    except Exception:
        names = np.array([f"f{i}" for i in range(len(importances))])

    order = np.argsort(importances)[::-1][:top_n]
    fig, ax = plt.subplots(figsize=(8, max(3, 0.3 * len(order))))
    ax.barh(np.arange(len(order))[::-1], importances[order])
    ax.set_yticks(np.arange(len(order))[::-1])
    ax.set_yticklabels([names[i] for i in order])
    ax.set_xlabel("Importance")
    ax.set_title("Feature importance")
    fig.tight_layout()
    return fig


# --- 3. Calibration plot -------------------------------------------------


def calibration_plot(
    y_true: np.ndarray,
    y_pred_proba: np.ndarray,
    *,
    n_bins: int = 10,
    label: str = "model",
) -> plt.Figure:
    """Reliability diagram with the y=x line."""
    from .metrics import calibration_deciles

    _, pred_mean, actual_rate = calibration_deciles(y_true, y_pred_proba, n_bins=n_bins)
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.plot([0, 1], [0, 1], "k--", alpha=0.4, label="perfect calibration")
    ax.plot(pred_mean, actual_rate, "o-", label=label)
    ax.set_xlabel("Predicted probability")
    ax.set_ylabel("Actual make rate")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_aspect("equal")
    ax.legend()
    ax.set_title("Calibration curve (decile bins)")
    fig.tight_layout()
    return fig


# --- 4. Model comparison: XGB vs LogReg ----------------------------------


def model_compare_plot(
    baseline_folds: list[dict[str, float]],
    xgb_folds: list[dict[str, float]],
) -> plt.Figure:
    """Side-by-side log_loss and AUC per fold. Lower log_loss / higher AUC = better.

    Each input is a list of dicts with keys: 'fold', 'log_loss', 'roc_auc'.
    """
    folds = [f["fold"] for f in xgb_folds]
    fig, (ax_ll, ax_auc) = plt.subplots(1, 2, figsize=(11, 4))

    width = 0.4
    ax_ll.bar([f - width / 2 for f in folds], [f["log_loss"] for f in baseline_folds], width, label="LogReg baseline")
    ax_ll.bar([f + width / 2 for f in folds], [f["log_loss"] for f in xgb_folds], width, label="XGBoost")
    ax_ll.set_xlabel("Fold")
    ax_ll.set_ylabel("Log loss (lower is better)")
    ax_ll.set_xticks(folds)
    ax_ll.legend()
    ax_ll.set_title("Log loss per fold")

    ax_auc.bar([f - width / 2 for f in folds], [f["roc_auc"] for f in baseline_folds], width, label="LogReg baseline")
    ax_auc.bar([f + width / 2 for f in folds], [f["roc_auc"] for f in xgb_folds], width, label="XGBoost")
    ax_auc.set_xlabel("Fold")
    ax_auc.set_ylabel("ROC-AUC (higher is better)")
    ax_auc.set_xticks(folds)
    ax_auc.legend()
    ax_auc.set_title("ROC-AUC per fold")

    fig.tight_layout()
    return fig


# --- 5. Player ranking ---------------------------------------------------


def player_ranking_plot(top: pd.DataFrame, bot: pd.DataFrame) -> plt.Figure:
    """Horizontal bar chart of top-N and bottom-N players by shrunk delta.

    Expects columns: PLAYER_NAME, shrunk_delta, ci_lo, ci_hi (CI optional).
    """
    combined = pd.concat([top, bot.iloc[::-1]], ignore_index=True)
    fig, ax = plt.subplots(figsize=(8, max(4, 0.35 * len(combined))))

    colors = ["#2ca02c" if v >= 0 else "#d62728" for v in combined["shrunk_delta"]]
    y = np.arange(len(combined))
    ax.barh(y, combined["shrunk_delta"], color=colors)

    if "ci_lo" in combined.columns and "ci_hi" in combined.columns:
        xerr_lo = combined["shrunk_delta"] - combined["ci_lo"]
        xerr_hi = combined["ci_hi"] - combined["shrunk_delta"]
        ax.errorbar(
            combined["shrunk_delta"],
            y,
            xerr=[xerr_lo.clip(lower=0), xerr_hi.clip(lower=0)],
            fmt="none",
            ecolor="black",
            alpha=0.4,
            capsize=2,
        )

    ax.set_yticks(y)
    ax.set_yticklabels(combined["PLAYER_NAME"])
    ax.invert_yaxis()
    ax.axvline(0, color="black", linewidth=0.5)
    ax.set_xlabel("Shrunk FG% over expected")
    ax.set_title(f"Top {len(top)} / Bottom {len(bot)} by shrunk delta (with bootstrap 95% CI)")
    fig.tight_layout()
    return fig
