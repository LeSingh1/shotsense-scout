"""Configuration constants and paths.

NOTE: defender distance and shot clock are NOT available per-shot in the free
2025-26 nba_api endpoints. They are deliberately omitted from the feature set.
"""

from __future__ import annotations

import os
from pathlib import Path

# --- Reproducibility ------------------------------------------------------

SEED = 42

# --- Season / scope -------------------------------------------------------

SEASON = "2025-26"
SEASON_TYPE = "Playoffs"

# --- Filesystem paths -----------------------------------------------------
#
# CACHE_DIR can be overridden via NBA_CACHE_DIR env var (used by tests to
# point at tests/fixtures/mini_team_cache/).

PROJECT_ROOT = Path(__file__).resolve().parents[1]

CACHE_DIR = Path(os.environ.get("NBA_CACHE_DIR", PROJECT_ROOT / "data"))
SHOTS_CACHE_DIR = CACHE_DIR / "shots"
GAMES_CACHE_PATH = CACHE_DIR / "games.parquet"

MODELS_DIR = PROJECT_ROOT / "models"
LATEST_MODEL_SYMLINK = MODELS_DIR / "latest.joblib"

OUTPUTS_DIR = PROJECT_ROOT / "outputs"

# --- nba_api rate limiting ------------------------------------------------

SLEEP_BETWEEN_REQUESTS = 0.5        # seconds
MAX_RETRIES = 3
BACKOFF_FACTOR = 2                  # exponential: 0.5, 1.0, 2.0 seconds

# --- Cache hygiene --------------------------------------------------------

STALE_TMP_MAX_AGE_SECONDS = 3600    # cleanup orphan .tmp files older than 1h

# --- Model hyperparameters ------------------------------------------------

CV_N_SPLITS = 5

XGB_PARAMS = {
    "n_estimators": 500,
    "max_depth": 5,
    "learning_rate": 0.05,
    "subsample": 0.9,
    "colsample_bytree": 0.9,
    "objective": "binary:logistic",
    "eval_metric": "logloss",
    "early_stopping_rounds": 25,
    "tree_method": "hist",
    "random_state": SEED,
}

LOGREG_PARAMS = {
    "C": 1.0,
    "max_iter": 1000,
    "solver": "lbfgs",
    "random_state": SEED,
}

# Validation split fraction (within each outer-fold train, held out for XGB early stopping)
VAL_FRACTION = 0.15

# --- Ranking / shrinkage --------------------------------------------------

MIN_SHOTS_FOR_HEADLINE_RANKING = 25
BOOTSTRAP_ROUNDS = 1000

# --- Calibration ----------------------------------------------------------

CALIBRATION_WARNING_THRESHOLD = 0.05     # warn if any decile is >5% off
CALIBRATION_N_DECILES = 10

# --- Feature lists --------------------------------------------------------
#
# Columns we expect from shotchartdetail (validated in data/schema.py).
SHOTCHART_REQUIRED_COLUMNS = (
    "GAME_ID",
    "PLAYER_ID",
    "PLAYER_NAME",
    "TEAM_ID",
    "PERIOD",
    "MINUTES_REMAINING",
    "SECONDS_REMAINING",
    "SHOT_TYPE",
    "SHOT_ZONE_BASIC",
    "SHOT_ZONE_AREA",
    "SHOT_ZONE_RANGE",
    "SHOT_DISTANCE",
    "LOC_X",
    "LOC_Y",
    "ACTION_TYPE",
    "SHOT_MADE_FLAG",
)

# Columns we expect from leaguegamefinder (for home/away derivation).
GAMES_REQUIRED_COLUMNS = (
    "GAME_ID",
    "TEAM_ID",
    "MATCHUP",            # e.g. "BOS vs. CLE" (home) or "BOS @ CLE" (away)
)
