"""Pure feature derivations: angle, time, late_game_q4, home/away.

The `shot_number_in_game` feature is intentionally NOT tested because it's
intentionally NOT implemented (dropped per design doc T4 — usage proxy, not
fatigue).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from nba_shot_quality.features.engineer import (
    compute_is_overtime,
    compute_late_game_q4,
    compute_seconds_left_in_game,
    compute_seconds_left_in_period,
    compute_shot_angle,
    derive_home_away,
    engineer_features,
)


# --- shot_angle ----------------------------------------------------------


def test_shot_angle_at_rim_returns_zero_not_nan() -> None:
    """The original is_clutch/at-rim premise: (0,0) → 0, never NaN."""
    angle = compute_shot_angle(0, 0)
    assert not np.isnan(angle)
    assert angle == 0.0


def test_shot_angle_top_of_key_is_zero() -> None:
    """Straight on (positive Y, zero X) → 0 radians."""
    angle = compute_shot_angle(0, 230)
    assert pytest.approx(angle, abs=1e-9) == 0.0


def test_shot_angle_corner_three_is_large() -> None:
    """Corner 3 (large |X|, small Y) → angle approaching π/2."""
    angle = compute_shot_angle(220, 10)
    assert angle > 1.4   # close to π/2 ≈ 1.5708


def test_shot_angle_symmetric_left_right() -> None:
    """Left-corner and right-corner shots should produce the same angle (uses |x|)."""
    left = compute_shot_angle(-220, 10)
    right = compute_shot_angle(220, 10)
    assert pytest.approx(left) == right


def test_shot_angle_vectorized() -> None:
    xs = np.array([0, 100, -100, 200])
    ys = np.array([100, 100, 100, 50])
    result = compute_shot_angle(xs, ys)
    assert result.shape == (4,)
    assert result[0] == pytest.approx(0.0)
    assert result[1] == pytest.approx(result[2])      # symmetry


# --- seconds_left_in_period / game ---------------------------------------


def test_seconds_left_in_period_simple() -> None:
    minutes = pd.Series([5, 0, 11])
    seconds = pd.Series([30, 5, 0])
    out = compute_seconds_left_in_period(minutes, seconds)
    assert list(out) == [330, 5, 660]


def test_seconds_left_in_game_q1() -> None:
    period = pd.Series([1])
    sec = pd.Series([600])
    assert compute_seconds_left_in_game(period, sec).iloc[0] == 600 + 3 * 720      # 2760


def test_seconds_left_in_game_q4() -> None:
    period = pd.Series([4])
    sec = pd.Series([120])
    assert compute_seconds_left_in_game(period, sec).iloc[0] == 120


def test_seconds_left_in_game_overtime() -> None:
    period = pd.Series([5])
    sec = pd.Series([180])
    # OT → 0 (use is_overtime flag separately)
    assert compute_seconds_left_in_game(period, sec).iloc[0] == 0


# --- late_game_q4 --------------------------------------------------------


@pytest.mark.parametrize("period,sec,expected", [
    (4, 290, True),     # Q4, 4:50 left
    (4, 300, True),     # Q4, exactly 5:00 left — boundary inclusive
    (4, 310, False),    # Q4, 5:10 left
    (3, 100, False),    # Q3 doesn't count even with little time
    (5, 600, True),     # OT, any time
    (5, 0, True),       # End of OT
    (1, 700, False),    # Q1
])
def test_late_game_q4(period: int, sec: int, expected: bool) -> None:
    out = compute_late_game_q4(pd.Series([period]), pd.Series([sec]))
    assert out.iloc[0] == expected


def test_is_overtime() -> None:
    assert compute_is_overtime(pd.Series([4])).iloc[0] is np.False_ or compute_is_overtime(pd.Series([4])).iloc[0] == False
    assert compute_is_overtime(pd.Series([5])).iloc[0] == True


# --- derive_home_away ----------------------------------------------------


def test_derive_home_away_basic(mini_shots: pd.DataFrame, mini_games: pd.DataFrame) -> None:
    home_away = derive_home_away(mini_shots, mini_games)
    assert home_away.shape == (len(mini_shots),)
    assert set(np.unique(home_away)).issubset({0, 1})


def test_derive_home_away_matches_matchup_convention(mini_games: pd.DataFrame) -> None:
    """If MATCHUP says 'LAL vs. BOS' for the LAL row, LAL is home (=1)."""
    shots = pd.DataFrame([
        {"GAME_ID": "0042500101", "TEAM_ID": 1610612747},      # LAL row → "LAL vs. BOS" → home
        {"GAME_ID": "0042500101", "TEAM_ID": 1610612738},      # BOS row → "BOS @ LAL" → away
    ])
    out = derive_home_away(shots, mini_games)
    assert out[0] == 1
    assert out[1] == 0


def test_derive_home_away_raises_without_matchup() -> None:
    bad_games = pd.DataFrame([{"GAME_ID": "0042500101", "TEAM_ID": 1, "FOO": "bar"}])
    shots = pd.DataFrame([{"GAME_ID": "0042500101", "TEAM_ID": 1}])
    with pytest.raises(ValueError, match="MATCHUP"):
        derive_home_away(shots, bad_games)


# --- engineer_features orchestrator --------------------------------------


def test_engineer_features_adds_all_derived_columns(
    mini_shots: pd.DataFrame,
    mini_games: pd.DataFrame,
) -> None:
    out = engineer_features(mini_shots, mini_games)
    for col in ("shot_angle", "seconds_left_in_period", "seconds_left_in_game",
                "late_game_q4", "is_overtime", "is_three_point", "home_away"):
        assert col in out.columns

    # No NaNs in critical features
    assert not out["shot_angle"].isna().any()
    assert not out["home_away"].isna().any()


def test_engineer_features_drops_no_rows(
    mini_shots: pd.DataFrame,
    mini_games: pd.DataFrame,
) -> None:
    out = engineer_features(mini_shots, mini_games)
    assert len(out) == len(mini_shots)
