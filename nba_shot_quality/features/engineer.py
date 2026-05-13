"""Feature engineering and the sklearn Pipeline factory.

Two public surfaces:

  1. `engineer_features(shots, games)` — pure DataFrame transforms (angle, time,
     late_game_q4, home_away). Called once before CV.

  2. `build_pipeline()` — returns a sklearn `Pipeline` that wraps
     `ColumnTransformer(TargetEncoder + OneHot)` + `XGBClassifier`. The
     Pipeline ensures TargetEncoder is refit per outer fold; the inner CV
     inside `TargetEncoder(cv=5)` is NOT group-aware, which is acknowledged
     and accepted (the outer GroupKFold is the holdout).

Per the design doc:
  - `shot_number_in_game` is intentionally NOT engineered — it's a usage
    proxy, not fatigue, and confounds the player-effect estimate.
  - `at-rim (LOC_X=0, LOC_Y=0)` → angle 0, not NaN (handled by np.arctan2).
"""

from __future__ import annotations

import logging
from typing import Final

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, TargetEncoder

from ..config import SEED, XGB_PARAMS

logger = logging.getLogger(__name__)


# Columns the Pipeline will use after engineer_features() runs.
NUMERIC_COLS: Final = (
    "SHOT_DISTANCE",
    "shot_angle",
    "seconds_left_in_period",
    "seconds_left_in_game",
)
BINARY_COLS: Final = (
    "is_three_point",
    "late_game_q4",
    "is_overtime",
    "home_away",
)
ONEHOT_COLS: Final = (
    "SHOT_ZONE_BASIC",
    "SHOT_ZONE_AREA",
    "SHOT_ZONE_RANGE",
    "PERIOD",
)
TARGET_ENC_COLS: Final = ("ACTION_TYPE",)

# Convenience: every feature the model sees.
ALL_FEATURE_COLS: Final = (
    *NUMERIC_COLS,
    *BINARY_COLS,
    *ONEHOT_COLS,
    *TARGET_ENC_COLS,
)


# --- Atomic feature derivations ------------------------------------------


def compute_shot_angle(loc_x: float | np.ndarray, loc_y: float | np.ndarray) -> float | np.ndarray:
    """Angle (radians) from the basket along the floor.

    Uses np.arctan2(|x|, y): symmetric across the court midline.
    At-rim (0, 0) → 0.0 (not NaN). Corner-3 (220, 10) → ~1.52 (close to 90°
    from baseline). Top of key (0, 230) → 0.0 (straight on).

    Note: the basket is at (0, 0) in nba_api's shotchartdetail coordinates.
    Positive LOC_Y is toward half-court.
    """
    x = np.abs(np.asarray(loc_x, dtype=float))
    y = np.asarray(loc_y, dtype=float)
    return np.arctan2(x, y)


def compute_seconds_left_in_period(minutes_remaining: pd.Series, seconds_remaining: pd.Series) -> pd.Series:
    """Total seconds remaining in the current period."""
    return 60 * minutes_remaining.astype(int) + seconds_remaining.astype(int)


def compute_seconds_left_in_game(period: pd.Series, seconds_left_in_period: pd.Series) -> pd.Series:
    """Seconds remaining in regulation. OT periods → 0 (use is_overtime flag).

    Formula (regulation): (4 - period) * 720 + seconds_left_in_period
    For OT (period > 4): 0
    """
    period = period.astype(int)
    sec = seconds_left_in_period.astype(int)
    regulation = (4 - period).clip(lower=0) * 720 + sec
    return regulation.where(period <= 4, 0)


def compute_late_game_q4(period: pd.Series, seconds_left_in_period: pd.Series) -> pd.Series:
    """True for shots in the last 5 minutes of Q4 OR any OT period.

    NOT a leverage measure — without score margin we can't know if the game
    was close. Documented in README + variable name.
    """
    period = period.astype(int)
    sec = seconds_left_in_period.astype(int)
    return ((period == 4) & (sec <= 300)) | (period >= 5)


def compute_is_overtime(period: pd.Series) -> pd.Series:
    return period.astype(int) > 4


def derive_home_away(shots: pd.DataFrame, games: pd.DataFrame) -> pd.Series:
    """For each shot, return 1 if the shooting team played at home, 0 if away.

    Uses `leaguegamefinder.MATCHUP`: home games are formatted "BOS vs. CLE",
    away games "BOS @ CLE". Joining on (GAME_ID, TEAM_ID), the MATCHUP for
    that team-game tells us home/away directly.
    """
    if "MATCHUP" not in games.columns:
        raise ValueError("derive_home_away: games DataFrame must have MATCHUP column")

    # Cast GAME_ID and TEAM_ID to string on both sides to avoid join-failure
    # from nba_api's inconsistent int/str dtypes.
    left = shots[["GAME_ID", "TEAM_ID"]].copy()
    left["GAME_ID"] = left["GAME_ID"].astype(str)
    left["TEAM_ID"] = left["TEAM_ID"].astype(int)

    right = games[["GAME_ID", "TEAM_ID", "MATCHUP"]].copy()
    right["GAME_ID"] = right["GAME_ID"].astype(str)
    right["TEAM_ID"] = right["TEAM_ID"].astype(int)

    merged = left.merge(right, on=["GAME_ID", "TEAM_ID"], how="left")
    is_home = merged["MATCHUP"].fillna("").str.contains(" vs. ", regex=False).astype(int)
    return is_home.values  # numpy array, preserves index alignment with `shots`


# --- Orchestrator --------------------------------------------------------


def engineer_features(shots: pd.DataFrame, games: pd.DataFrame) -> pd.DataFrame:
    """Apply all per-shot feature derivations.

    Input: raw shotchartdetail-shaped DataFrame + leaguegamefinder DataFrame.
    Output: DataFrame with all derived columns added, ready to feed the Pipeline.

    Does NOT drop the original columns — keeps everything so debugging is easy.
    The Pipeline picks columns by name from `ALL_FEATURE_COLS`.
    """
    df = shots.copy()

    # Numeric features
    df["shot_angle"] = compute_shot_angle(df["LOC_X"].values, df["LOC_Y"].values)
    df["seconds_left_in_period"] = compute_seconds_left_in_period(
        df["MINUTES_REMAINING"], df["SECONDS_REMAINING"]
    )
    df["seconds_left_in_game"] = compute_seconds_left_in_game(
        df["PERIOD"], df["seconds_left_in_period"]
    )

    # Binary / categorical-ish
    df["is_three_point"] = (df["SHOT_TYPE"].str.startswith("3PT")).astype(int)
    df["late_game_q4"] = compute_late_game_q4(df["PERIOD"], df["seconds_left_in_period"]).astype(int)
    df["is_overtime"] = compute_is_overtime(df["PERIOD"]).astype(int)
    df["home_away"] = derive_home_away(df, games).astype(int)

    # Make PERIOD a string so the OneHotEncoder treats it categorically
    df["PERIOD"] = df["PERIOD"].astype(int).astype(str)

    return df


# --- Pipeline factory ----------------------------------------------------


def build_pipeline(model: str = "xgb") -> Pipeline:
    """Construct the sklearn Pipeline used for both XGBoost and the LogReg baseline.

    `model` is "xgb" (full pipeline with TargetEncoder + OneHot + XGBClassifier)
    or "logreg" (baseline: distance + zone_basic + LogisticRegression).

    The XGB pipeline is the one wired into the GroupKFold loop in
    `model/train.py`. TargetEncoder.cv defaults to its sklearn default (5),
    which is NOT group-aware on the inner CV — documented + accepted.
    """
    from sklearn.linear_model import LogisticRegression

    from ..config import LOGREG_PARAMS

    if model == "xgb":
        from xgboost import XGBClassifier        # lazy: keep package importable without libomp

        preprocessor = ColumnTransformer(
            transformers=[
                (
                    "target_enc",
                    TargetEncoder(smooth="auto", random_state=SEED),
                    list(TARGET_ENC_COLS),
                ),
                (
                    "onehot",
                    OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                    list(ONEHOT_COLS),
                ),
                ("numeric", "passthrough", list(NUMERIC_COLS) + list(BINARY_COLS)),
            ],
            remainder="drop",
            verbose_feature_names_out=False,
        )
        return Pipeline(
            steps=[
                ("preprocessor", preprocessor),
                ("classifier", XGBClassifier(**XGB_PARAMS)),
            ]
        )

    if model == "logreg":
        # Baseline: only shot_distance + shot_zone_basic. Honest sanity floor.
        preprocessor = ColumnTransformer(
            transformers=[
                (
                    "onehot",
                    OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                    ["SHOT_ZONE_BASIC"],
                ),
                ("numeric", "passthrough", ["SHOT_DISTANCE"]),
            ],
            remainder="drop",
            verbose_feature_names_out=False,
        )
        return Pipeline(
            steps=[
                ("preprocessor", preprocessor),
                ("classifier", LogisticRegression(**LOGREG_PARAMS)),
            ]
        )

    raise ValueError(f"build_pipeline: unknown model={model!r}. Use 'xgb' or 'logreg'.")
