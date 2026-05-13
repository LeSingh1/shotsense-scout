"""Empirical-Bayes shrinkage on FG%-over-expected, plus bootstrap CI.

The headline output of this package is a per-player ranking by how much a
player exceeded (or undershot) the model's predicted xFG% on their own
shots. Without shrinkage, the player with 20 lucky shots dominates the top
of the list — pure noise.

Shrinkage formula (Efron-Morris-style, simplified):

  For each player p with n_p shots, raw delta x_p:
    sigma2_within(p) = mean(xfg_p * (1 - xfg_p)) / n_p     # binomial variance bound
    sigma2_between   = Var(x_p across all players with n_p >= min_shots_for_estimation)
    weight_p         = sigma2_between / (sigma2_between + sigma2_within(p))
    shrunk_p         = weight_p * x_p

A player with many shots: weight ~ 1, shrunk ~ x_p.
A player with few shots:  weight ~ 0, shrunk ~ 0.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from ..config import BOOTSTRAP_ROUNDS, MIN_SHOTS_FOR_HEADLINE_RANKING, SEED

logger = logging.getLogger(__name__)


def _player_table(shots_with_pred: pd.DataFrame) -> pd.DataFrame:
    """Aggregate per-player stats. Expects columns:
       PLAYER_ID, PLAYER_NAME, SHOT_MADE_FLAG, xfg_pred.
    """
    required = {"PLAYER_ID", "PLAYER_NAME", "SHOT_MADE_FLAG", "xfg_pred"}
    missing = required - set(shots_with_pred.columns)
    if missing:
        raise ValueError(f"_player_table: missing columns: {missing}")

    by_player = (
        shots_with_pred.groupby(["PLAYER_ID", "PLAYER_NAME"], sort=False)
        .agg(
            n_shots=("SHOT_MADE_FLAG", "size"),
            actual_fg=("SHOT_MADE_FLAG", "mean"),
            mean_xfg=("xfg_pred", "mean"),
            sigma2_within_sum=("xfg_pred", lambda s: float((s * (1.0 - s)).sum())),
        )
        .reset_index()
    )
    by_player["raw_delta"] = by_player["actual_fg"] - by_player["mean_xfg"]
    # mean of xfg*(1-xfg) per shot, then divide by n for variance of the mean delta.
    by_player["sigma2_within"] = by_player["sigma2_within_sum"] / by_player["n_shots"] ** 2
    return by_player.drop(columns=["sigma2_within_sum"])


def shrink_player_deltas(
    shots_with_pred: pd.DataFrame,
    *,
    min_shots_for_estimation: int = 25,
) -> pd.DataFrame:
    """Compute shrunk FG%-over-expected per player.

    `min_shots_for_estimation` filters which players contribute to the
    estimate of sigma2_between (between-player variance). All players are
    still scored in the output; small-sample players are heavily shrunk.

    Returns a DataFrame: PLAYER_ID, PLAYER_NAME, n_shots, actual_fg, mean_xfg,
    raw_delta, sigma2_within, weight, shrunk_delta. Sorted by shrunk_delta desc.
    """
    players = _player_table(shots_with_pred)

    pool = players[players["n_shots"] >= min_shots_for_estimation]
    if len(pool) < 2:
        logger.warning(
            "shrink_player_deltas: only %d players have >=%d shots; cannot estimate "
            "between-player variance. Returning raw deltas with weight=0.",
            len(pool), min_shots_for_estimation,
        )
        players["weight"] = 0.0
        players["shrunk_delta"] = 0.0
        return players.sort_values("raw_delta", ascending=False).reset_index(drop=True)

    sigma2_between = float(np.var(pool["raw_delta"].values, ddof=1))
    # Guard: if all pool players have identical raw deltas, variance is 0.
    if sigma2_between <= 0:
        sigma2_between = 1e-12

    weight = sigma2_between / (sigma2_between + players["sigma2_within"].clip(lower=1e-12))
    players["weight"] = weight
    players["shrunk_delta"] = weight * players["raw_delta"]
    return players.sort_values("shrunk_delta", ascending=False).reset_index(drop=True)


def bootstrap_ci(
    deltas: np.ndarray,
    *,
    n_rounds: int = BOOTSTRAP_ROUNDS,
    confidence: float = 0.95,
    seed: int = SEED,
) -> tuple[float, float]:
    """Bootstrap CI for the mean of `deltas` (per-shot actual - xfg)."""
    deltas = np.asarray(deltas, dtype=float)
    if len(deltas) == 0:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    samples = rng.choice(deltas, size=(n_rounds, len(deltas)), replace=True)
    means = samples.mean(axis=1)
    alpha = (1.0 - confidence) / 2.0
    lo = float(np.quantile(means, alpha))
    hi = float(np.quantile(means, 1.0 - alpha))
    return lo, hi


def add_bootstrap_ci_to_ranking(
    shots_with_pred: pd.DataFrame,
    ranking: pd.DataFrame,
    *,
    n_rounds: int = BOOTSTRAP_ROUNDS,
    seed: int = SEED,
) -> pd.DataFrame:
    """For each ranked player, compute bootstrap CI of (actual - xfg_pred).

    Adds two columns: ci_lo, ci_hi. Returns a new DataFrame.
    """
    rng = np.random.default_rng(seed)
    out = ranking.copy()
    los, his = [], []
    deltas_by_player = (
        shots_with_pred.assign(_d=lambda d: d["SHOT_MADE_FLAG"] - d["xfg_pred"])
        .groupby("PLAYER_ID")["_d"]
        .apply(lambda s: s.values)
    )
    for pid in out["PLAYER_ID"].values:
        d = deltas_by_player.get(pid, np.array([]))
        if len(d) == 0:
            los.append(float("nan"))
            his.append(float("nan"))
            continue
        samples = rng.choice(d, size=(n_rounds, len(d)), replace=True)
        means = samples.mean(axis=1)
        los.append(float(np.quantile(means, 0.025)))
        his.append(float(np.quantile(means, 0.975)))
    out["ci_lo"] = los
    out["ci_hi"] = his
    return out


def top_bottom_n(
    ranking: pd.DataFrame,
    *,
    n: int = 10,
    min_shots: int = MIN_SHOTS_FOR_HEADLINE_RANKING,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Headline top-N and bottom-N from the shrunk ranking, gated by min_shots."""
    eligible = ranking[ranking["n_shots"] >= min_shots].copy()
    top = eligible.nlargest(n, "shrunk_delta")
    bot = eligible.nsmallest(n, "shrunk_delta")
    return top, bot
