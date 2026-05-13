"""Empirical-Bayes shrinkage math.

Known-answer fixture: three players with the same raw delta (+0.10) but
different sample sizes (5, 50, 500). The 500-shot player should keep most
of their delta; the 5-shot player should be heavily shrunk toward 0.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from nba_shot_quality.eval.ranking import (
    _player_table,
    add_bootstrap_ci_to_ranking,
    bootstrap_ci,
    shrink_player_deltas,
    top_bottom_n,
)


def _build_three_player_fixture() -> pd.DataFrame:
    """Three players, same raw delta of +0.10, different shot counts.

    Player A: 5 shots, all xfg_pred=0.50, all made → actual=1.0, delta=+0.50.
              (We'll use smaller delta to match the docstring of "same raw delta")
    To match "+0.10": each player makes 60% of shots that the model predicts
    at 0.50. So actual=0.60, mean_xfg=0.50, delta=+0.10 for all three.
    """
    # Use deterministic make rates so all three players have identical raw deltas
    rng = np.random.default_rng(0)
    rows: list[dict] = []
    for player_id, player_name, n_shots in [(1, "A", 5), (2, "B", 50), (3, "C", 500)]:
        # Ensure exactly 0.60 actual hit rate
        n_made = round(n_shots * 0.60)
        outcomes = np.array([1] * n_made + [0] * (n_shots - n_made))
        rng.shuffle(outcomes)
        for o in outcomes:
            rows.append({
                "PLAYER_ID": player_id,
                "PLAYER_NAME": player_name,
                "SHOT_MADE_FLAG": int(o),
                "xfg_pred": 0.50,
            })

    # Need a 4th player so sigma2_between can be estimated from a pool
    # (with only 3 identical deltas, between-variance = 0). Add several
    # diverse players with >= 25 shots each at varied deltas.
    for pid, name, n_shots, hit_rate, xfg in [
        (100, "Filler1", 50, 0.50, 0.50),
        (101, "Filler2", 50, 0.40, 0.50),
        (102, "Filler3", 50, 0.55, 0.50),
        (103, "Filler4", 50, 0.45, 0.50),
        (104, "Filler5", 50, 0.65, 0.50),
    ]:
        n_made = round(n_shots * hit_rate)
        outcomes = np.array([1] * n_made + [0] * (n_shots - n_made))
        rng.shuffle(outcomes)
        for o in outcomes:
            rows.append({
                "PLAYER_ID": pid, "PLAYER_NAME": name,
                "SHOT_MADE_FLAG": int(o), "xfg_pred": xfg,
            })

    return pd.DataFrame(rows)


def test_player_table_aggregates_correctly() -> None:
    df = _build_three_player_fixture()
    table = _player_table(df)
    a = table[table["PLAYER_NAME"] == "A"].iloc[0]
    assert a["n_shots"] == 5
    assert a["actual_fg"] == pytest.approx(0.60, abs=1e-9)
    assert a["mean_xfg"] == pytest.approx(0.50, abs=1e-9)
    assert a["raw_delta"] == pytest.approx(0.10, abs=1e-9)


def test_shrinkage_orders_by_sample_size() -> None:
    """Same raw delta → smaller n is shrunk more. shrunk_A < shrunk_B < shrunk_C."""
    df = _build_three_player_fixture()
    ranking = shrink_player_deltas(df, min_shots_for_estimation=25)
    by_name = ranking.set_index("PLAYER_NAME")

    shrunk_a = by_name.loc["A", "shrunk_delta"]
    shrunk_b = by_name.loc["B", "shrunk_delta"]
    shrunk_c = by_name.loc["C", "shrunk_delta"]
    assert shrunk_a < shrunk_b < shrunk_c


def test_large_sample_player_barely_shrunk() -> None:
    """Player C (500 shots) keeps most of their +0.10 delta."""
    df = _build_three_player_fixture()
    ranking = shrink_player_deltas(df, min_shots_for_estimation=25)
    c = ranking[ranking["PLAYER_NAME"] == "C"].iloc[0]
    # weight should be very close to 1 for a 500-shot player; shrunk close to raw
    assert c["weight"] > 0.85
    assert abs(c["shrunk_delta"] - 0.10) / 0.10 < 0.20    # within 20% of raw


def test_small_sample_player_heavily_shrunk() -> None:
    """Player A (5 shots) is pulled hard toward zero."""
    df = _build_three_player_fixture()
    ranking = shrink_player_deltas(df, min_shots_for_estimation=25)
    a = ranking[ranking["PLAYER_NAME"] == "A"].iloc[0]
    # weight should be low for a 5-shot player
    assert a["weight"] < 0.5
    assert abs(a["shrunk_delta"]) < 0.07         # well below raw 0.10


def test_player_table_raises_on_missing_columns() -> None:
    bad = pd.DataFrame({"PLAYER_ID": [1], "PLAYER_NAME": ["X"]})
    with pytest.raises(ValueError, match="missing columns"):
        _player_table(bad)


def test_shrink_falls_back_with_too_few_players() -> None:
    """Edge: fewer than 2 eligible players → return raw deltas with weight=0."""
    df = pd.DataFrame([
        {"PLAYER_ID": 1, "PLAYER_NAME": "Only", "SHOT_MADE_FLAG": 1, "xfg_pred": 0.5},
    ] * 30)
    ranking = shrink_player_deltas(df, min_shots_for_estimation=25)
    assert (ranking["weight"] == 0.0).all()
    assert (ranking["shrunk_delta"] == 0.0).all()


# --- bootstrap_ci --------------------------------------------------------


def test_bootstrap_ci_brackets_mean() -> None:
    deltas = np.array([0.05, 0.10, 0.15, 0.20, 0.08, 0.12])
    lo, hi = bootstrap_ci(deltas, n_rounds=500, seed=42)
    mean = deltas.mean()
    assert lo <= mean <= hi


def test_bootstrap_ci_empty_returns_nan() -> None:
    lo, hi = bootstrap_ci(np.array([]))
    assert np.isnan(lo) and np.isnan(hi)


def test_bootstrap_ci_reproducible_with_seed() -> None:
    deltas = np.array([0.05, 0.10, 0.15, 0.20, 0.08, 0.12])
    a = bootstrap_ci(deltas, n_rounds=200, seed=42)
    b = bootstrap_ci(deltas, n_rounds=200, seed=42)
    assert a == b


def test_add_bootstrap_ci_to_ranking_adds_columns() -> None:
    df = _build_three_player_fixture()
    ranking = shrink_player_deltas(df, min_shots_for_estimation=25)
    enriched = add_bootstrap_ci_to_ranking(df, ranking, n_rounds=100)
    assert "ci_lo" in enriched.columns
    assert "ci_hi" in enriched.columns
    assert (enriched["ci_lo"] <= enriched["ci_hi"]).all()


# --- top_bottom_n --------------------------------------------------------


def test_top_bottom_n_filters_by_min_shots() -> None:
    """Player A (5 shots) is excluded from headline top/bottom."""
    df = _build_three_player_fixture()
    ranking = shrink_player_deltas(df, min_shots_for_estimation=25)
    top, bot = top_bottom_n(ranking, n=5, min_shots=25)
    assert "A" not in top["PLAYER_NAME"].values
    assert "A" not in bot["PLAYER_NAME"].values
