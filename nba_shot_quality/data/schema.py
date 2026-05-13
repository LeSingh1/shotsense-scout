"""Schema validation at the API boundary.

The first thing we do with any DataFrame coming back from `nba_api` is check
that the columns we depend on are present. If the API has drifted, we want a
loud, specific error from fetch.py — not a cryptic KeyError 100 lines later
in engineer.py.
"""

from __future__ import annotations

from typing import Iterable

import pandas as pd

from ..config import GAMES_REQUIRED_COLUMNS, SHOTCHART_REQUIRED_COLUMNS


class SchemaError(ValueError):
    """Raised when an upstream DataFrame is missing required columns."""


def _check_columns(df: pd.DataFrame, required: Iterable[str], source: str) -> None:
    required_set = set(required)
    missing = required_set - set(df.columns)
    if missing:
        raise SchemaError(
            f"{source} response is missing required columns: {sorted(missing)}. "
            f"Got: {sorted(df.columns)}"
        )


def validate_shots(df: pd.DataFrame) -> None:
    """Validate a shotchartdetail DataFrame. Raises SchemaError on drift.

    Also enforces dtype expectations on the target column: SHOT_MADE_FLAG must
    be integer-coercible (0/1). Other columns are not dtype-checked because
    nba_api returns inconsistent dtypes (e.g. GAME_ID is sometimes str, sometimes int).
    """
    _check_columns(df, SHOTCHART_REQUIRED_COLUMNS, "shotchartdetail")
    if not df.empty:
        try:
            df["SHOT_MADE_FLAG"].astype(int)
        except (TypeError, ValueError) as exc:
            raise SchemaError(
                "SHOT_MADE_FLAG cannot be coerced to int. Got dtype "
                f"{df['SHOT_MADE_FLAG'].dtype}, sample: {df['SHOT_MADE_FLAG'].head().tolist()}"
            ) from exc


def validate_games(df: pd.DataFrame) -> None:
    """Validate a leaguegamefinder DataFrame. Raises SchemaError on drift."""
    _check_columns(df, GAMES_REQUIRED_COLUMNS, "leaguegamefinder")
