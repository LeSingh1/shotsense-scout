"""Shared test fixtures.

The mini shot dataset is synthesized programmatically (not stored as binary
parquet in git). Three playoff games, six players per game, with a known
average xFG% structure so we can write known-answer assertions.

Why synthetic?
  - No binary blobs in version control
  - Easy to extend (one more player, one more game)
  - Deterministic given the SEED
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Try to import xgboost. If libomp is missing on macOS, downstream xgboost
# tests must skip — but the package code path doesn't care; only runtime fits do.
try:
    import xgboost as _xgb  # noqa: F401
    XGB_AVAILABLE = True
except (ImportError, OSError, Exception):
    XGB_AVAILABLE = False


SEED = 42


def _make_shot_row(
    game_id: str,
    team_id: int,
    player_id: int,
    player_name: str,
    period: int,
    minutes_remaining: int,
    seconds_remaining: int,
    loc_x: int,
    loc_y: int,
    action_type: str,
    shot_type: str,
    shot_zone_basic: str,
    shot_zone_area: str,
    shot_zone_range: str,
    shot_distance: int,
    shot_made_flag: int,
) -> dict:
    return {
        "GAME_ID": game_id,
        "TEAM_ID": team_id,
        "PLAYER_ID": player_id,
        "PLAYER_NAME": player_name,
        "PERIOD": period,
        "MINUTES_REMAINING": minutes_remaining,
        "SECONDS_REMAINING": seconds_remaining,
        "LOC_X": loc_x,
        "LOC_Y": loc_y,
        "ACTION_TYPE": action_type,
        "SHOT_TYPE": shot_type,
        "SHOT_ZONE_BASIC": shot_zone_basic,
        "SHOT_ZONE_AREA": shot_zone_area,
        "SHOT_ZONE_RANGE": shot_zone_range,
        "SHOT_DISTANCE": shot_distance,
        "SHOT_MADE_FLAG": shot_made_flag,
    }


def _synth_shots(n_per_game: int = 30, rng: np.random.Generator | None = None) -> pd.DataFrame:
    """Generate three playoff games × ~30 shots × 6 players."""
    if rng is None:
        rng = np.random.default_rng(SEED)

    games = [
        ("0042500101", 1610612747, 1610612738),   # Lakers vs Celtics
        ("0042500102", 1610612747, 1610612738),
        ("0042500103", 1610612744, 1610612750),   # Warriors vs Wolves
    ]
    players_by_team = {
        1610612747: [(11, "Shooter A"), (12, "Wing A"), (13, "Big A")],
        1610612738: [(21, "Shooter B"), (22, "Wing B"), (23, "Big B")],
        1610612744: [(31, "Shooter C"), (32, "Wing C"), (33, "Big C")],
        1610612750: [(41, "Shooter D"), (42, "Wing D"), (43, "Big D")],
    }

    actions = ["Jump Shot", "Driving Layup Shot", "Step Back Jump shot", "Cutting Layup Shot"]
    rows: list[dict] = []

    for game_id, home_id, away_id in games:
        for team_id in (home_id, away_id):
            for player_id, player_name in players_by_team[team_id]:
                for _ in range(n_per_game // 6):
                    distance = int(rng.integers(0, 30))
                    is_three = distance >= 22
                    # Plausible LOC_X / LOC_Y from distance
                    angle = rng.uniform(0, np.pi / 2)
                    loc_x = int(distance * 10 * np.sin(angle))
                    loc_y = int(distance * 10 * np.cos(angle))
                    period = int(rng.integers(1, 5))
                    minutes = int(rng.integers(0, 12))
                    seconds = int(rng.integers(0, 60))
                    if is_three:
                        zone_basic = "Above the Break 3" if abs(loc_x) < 200 else "Left Corner 3" if loc_x < 0 else "Right Corner 3"
                        zone_range = "24+ ft."
                    elif distance < 8:
                        zone_basic = "Restricted Area" if distance < 5 else "In The Paint (Non-RA)"
                        zone_range = "Less Than 8 ft."
                    elif distance < 16:
                        zone_basic = "Mid-Range"
                        zone_range = "8-16 ft."
                    else:
                        zone_basic = "Mid-Range"
                        zone_range = "16-24 ft."
                    zone_area = "Center(C)" if abs(loc_x) < 80 else ("Left Side(L)" if loc_x < 0 else "Right Side(R)")

                    # Make rate is a function of distance only (logistic shape) — gives the model
                    # something predictable to learn.
                    p_make = 1.0 / (1.0 + np.exp(0.07 * (distance - 8)))
                    made = int(rng.random() < p_make)

                    rows.append(_make_shot_row(
                        game_id=game_id,
                        team_id=team_id,
                        player_id=player_id,
                        player_name=player_name,
                        period=period,
                        minutes_remaining=minutes,
                        seconds_remaining=seconds,
                        loc_x=loc_x,
                        loc_y=loc_y,
                        action_type=str(rng.choice(actions)),
                        shot_type="3PT Field Goal" if is_three else "2PT Field Goal",
                        shot_zone_basic=zone_basic,
                        shot_zone_area=zone_area,
                        shot_zone_range=zone_range,
                        shot_distance=distance,
                        shot_made_flag=made,
                    ))
    return pd.DataFrame(rows)


def _synth_games() -> pd.DataFrame:
    """Three games, six (team, game) rows. MATCHUP indicates home/away."""
    return pd.DataFrame([
        {"GAME_ID": "0042500101", "TEAM_ID": 1610612747, "MATCHUP": "LAL vs. BOS"},
        {"GAME_ID": "0042500101", "TEAM_ID": 1610612738, "MATCHUP": "BOS @ LAL"},
        {"GAME_ID": "0042500102", "TEAM_ID": 1610612747, "MATCHUP": "LAL @ BOS"},
        {"GAME_ID": "0042500102", "TEAM_ID": 1610612738, "MATCHUP": "BOS vs. LAL"},
        {"GAME_ID": "0042500103", "TEAM_ID": 1610612744, "MATCHUP": "GSW vs. MIN"},
        {"GAME_ID": "0042500103", "TEAM_ID": 1610612750, "MATCHUP": "MIN @ GSW"},
    ])


# --- pytest fixtures ------------------------------------------------------


@pytest.fixture(scope="session")
def mini_shots() -> pd.DataFrame:
    return _synth_shots()


@pytest.fixture(scope="session")
def mini_games() -> pd.DataFrame:
    return _synth_games()


@pytest.fixture
def mini_cache_dir(tmp_path: Path, mini_shots: pd.DataFrame) -> Path:
    """Build a tests/fixtures-style team cache in tmp_path/shots/<team>.parquet."""
    cache = tmp_path / "shots"
    cache.mkdir(parents=True, exist_ok=True)
    for team_id, df in mini_shots.groupby("TEAM_ID"):
        df.to_parquet(cache / f"{team_id}.parquet", index=False)
    return cache


@pytest.fixture
def mini_games_path(tmp_path: Path, mini_games: pd.DataFrame) -> Path:
    path = tmp_path / "games.parquet"
    mini_games.to_parquet(path, index=False)
    return path


@pytest.fixture(autouse=True)
def _isolate_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redirect package paths into tmp_path so tests don't write into the project tree."""
    monkeypatch.setenv("NBA_CACHE_DIR", str(tmp_path / "data"))
    # Force reload of config to pick up new env var
    import importlib

    import nba_shot_quality.config as cfg
    importlib.reload(cfg)
    # Re-point dependent modules' constants too (data.cache reads only the path, not the constant).
    monkeypatch.setattr("nba_shot_quality.config.MODELS_DIR", tmp_path / "models")
    monkeypatch.setattr("nba_shot_quality.config.OUTPUTS_DIR", tmp_path / "outputs")
    monkeypatch.setattr("nba_shot_quality.config.SHOTS_CACHE_DIR", tmp_path / "data" / "shots")
    monkeypatch.setattr("nba_shot_quality.config.GAMES_CACHE_PATH", tmp_path / "data" / "games.parquet")
