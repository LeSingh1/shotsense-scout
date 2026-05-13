"""Smoke tests for visualizations — verify they don't raise on the mini fixture.

Visual quality is verified by eye when running the actual pipeline; these
tests guard against API breakage in matplotlib/seaborn and shape mismatches.
"""

from __future__ import annotations

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from nba_shot_quality.eval.viz import (
    calibration_plot,
    feature_importance_plot,
    hex_shot_chart,
    model_compare_plot,
    player_ranking_plot,
)


def test_hex_shot_chart_returns_figure(mini_shots: pd.DataFrame) -> None:
    rng = np.random.default_rng(42)
    df = mini_shots.assign(xfg_pred=rng.uniform(size=len(mini_shots)))
    fig = hex_shot_chart(df)
    assert isinstance(fig, plt.Figure)
    plt.close(fig)


def test_feature_importance_plot_returns_figure() -> None:
    # Use a fitted Pipeline with a clf that has coef_ (LogReg-like via Dummy variants
    # don't expose coef_, so fit a real LogisticRegression).
    from sklearn.linear_model import LogisticRegression
    pipe = Pipeline([
        ("preprocessor", StandardScaler()),
        ("classifier", LogisticRegression(max_iter=200)),
    ])
    rng = np.random.default_rng(0)
    X = rng.normal(size=(100, 5))
    y = (X[:, 0] + rng.normal(scale=0.1, size=100) > 0).astype(int)
    pipe.fit(X, y)
    fig = feature_importance_plot(pipe)
    assert isinstance(fig, plt.Figure)
    plt.close(fig)


def test_calibration_plot_returns_figure() -> None:
    rng = np.random.default_rng(42)
    y_pred = rng.uniform(size=500)
    y_true = (y_pred > rng.uniform(size=500)).astype(int)
    fig = calibration_plot(y_true, y_pred, label="test")
    assert isinstance(fig, plt.Figure)
    plt.close(fig)


def test_model_compare_plot_returns_figure() -> None:
    baseline = [{"fold": i, "log_loss": 0.65 + 0.01 * i, "roc_auc": 0.55 + 0.01 * i} for i in range(1, 6)]
    xgb = [{"fold": i, "log_loss": 0.60 + 0.01 * i, "roc_auc": 0.60 + 0.01 * i} for i in range(1, 6)]
    fig = model_compare_plot(baseline, xgb)
    assert isinstance(fig, plt.Figure)
    plt.close(fig)


def test_player_ranking_plot_returns_figure() -> None:
    top = pd.DataFrame({
        "PLAYER_NAME": [f"Top {i}" for i in range(5)],
        "shrunk_delta": [0.10 - i * 0.01 for i in range(5)],
        "ci_lo": [0.05 - i * 0.01 for i in range(5)],
        "ci_hi": [0.15 - i * 0.01 for i in range(5)],
    })
    bot = pd.DataFrame({
        "PLAYER_NAME": [f"Bot {i}" for i in range(5)],
        "shrunk_delta": [-0.10 + i * 0.01 for i in range(5)],
        "ci_lo": [-0.15 + i * 0.01 for i in range(5)],
        "ci_hi": [-0.05 + i * 0.01 for i in range(5)],
    })
    fig = player_ranking_plot(top, bot)
    assert isinstance(fig, plt.Figure)
    plt.close(fig)


def test_player_ranking_plot_without_ci_columns() -> None:
    """Should work without ci_lo / ci_hi columns (no error bars)."""
    top = pd.DataFrame({
        "PLAYER_NAME": [f"P {i}" for i in range(3)],
        "shrunk_delta": [0.10, 0.05, 0.02],
    })
    bot = pd.DataFrame({
        "PLAYER_NAME": [f"P {i}" for i in range(3, 6)],
        "shrunk_delta": [-0.02, -0.05, -0.10],
    })
    fig = player_ranking_plot(top, bot)
    assert isinstance(fig, plt.Figure)
    plt.close(fig)
