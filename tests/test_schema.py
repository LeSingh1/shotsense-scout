"""Schema validation catches API drift at the boundary."""

from __future__ import annotations

import pandas as pd
import pytest

from nba_shot_quality.data.schema import (
    SchemaError,
    validate_games,
    validate_shots,
)


def test_validate_shots_accepts_complete_dataframe(mini_shots: pd.DataFrame) -> None:
    validate_shots(mini_shots)  # must not raise


def test_validate_shots_rejects_missing_target(mini_shots: pd.DataFrame) -> None:
    bad = mini_shots.drop(columns=["SHOT_MADE_FLAG"])
    with pytest.raises(SchemaError, match="SHOT_MADE_FLAG"):
        validate_shots(bad)


def test_validate_shots_rejects_missing_coords(mini_shots: pd.DataFrame) -> None:
    bad = mini_shots.drop(columns=["LOC_X"])
    with pytest.raises(SchemaError, match="LOC_X"):
        validate_shots(bad)


def test_validate_shots_rejects_non_numeric_target(mini_shots: pd.DataFrame) -> None:
    bad = mini_shots.copy()
    bad["SHOT_MADE_FLAG"] = ["yes"] * len(bad)
    with pytest.raises(SchemaError):
        validate_shots(bad)


def test_validate_games_accepts_complete_dataframe(mini_games: pd.DataFrame) -> None:
    validate_games(mini_games)  # must not raise


def test_validate_games_rejects_missing_matchup(mini_games: pd.DataFrame) -> None:
    bad = mini_games.drop(columns=["MATCHUP"])
    with pytest.raises(SchemaError, match="MATCHUP"):
        validate_games(bad)
