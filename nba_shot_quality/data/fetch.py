"""nba_api fetch with retry, rate limiting, and atomic caching.

Two endpoints:

  - shotchartdetail (per team, 30 calls) → data/shots/{team_id}.parquet
  - leaguegamefinder (one call for the playoff season) → data/games.parquet

`fetch_all_playoff_shots(use_cache=True)` is the orchestrator: reads what's
cached, fetches only missing teams, and warns loudly if any team returns zero
shots across the whole playoff bracket.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Iterable

import pandas as pd
from tqdm import tqdm

from ..config import (
    BACKOFF_FACTOR,
    GAMES_CACHE_PATH,
    MAX_RETRIES,
    SEASON,
    SEASON_TYPE,
    SHOTS_CACHE_DIR,
    SLEEP_BETWEEN_REQUESTS,
    STALE_TMP_MAX_AGE_SECONDS,
)
from .cache import atomic_write_parquet, cleanup_stale_tmp
from .schema import validate_games, validate_shots

logger = logging.getLogger(__name__)


# --- Endpoint adapters ----------------------------------------------------
#
# Wrapped so tests can monkeypatch a single point (or `responses` can mock
# the HTTP layer through nba_api's internal requests session).


def _call_shotchartdetail(team_id: int, season: str, season_type: str) -> pd.DataFrame:  # pragma: no cover
    """Call nba_api.stats.endpoints.shotchartdetail. Wrapped for testability.

    Excluded from coverage: pure adapter to an external network endpoint;
    tests monkeypatch this function directly.
    """
    from nba_api.stats.endpoints import shotchartdetail  # local import: keep package import light

    resp = shotchartdetail.ShotChartDetail(
        team_id=team_id,
        player_id=0,                       # 0 = all players for the team
        season_nullable=season,
        season_type_all_star=season_type,
        context_measure_simple="FGA",
    )
    return resp.get_data_frames()[0]


def _call_leaguegamefinder(season: str, season_type: str) -> pd.DataFrame:  # pragma: no cover
    """Call nba_api.stats.endpoints.leaguegamefinder. Wrapped for testability.

    Excluded from coverage: pure adapter to an external network endpoint.
    """
    from nba_api.stats.endpoints import leaguegamefinder

    resp = leaguegamefinder.LeagueGameFinder(
        season_nullable=season,
        season_type_nullable=season_type,
        league_id_nullable="00",           # NBA
    )
    return resp.get_data_frames()[0]


def _call_team_list() -> list[int]:  # pragma: no cover
    """Return all 30 NBA team_ids. Wrapped for testability.

    Excluded from coverage: tests monkeypatch this for determinism.
    """
    from nba_api.stats.static import teams

    return [t["id"] for t in teams.get_teams()]


# --- Retry-aware fetch ----------------------------------------------------


def _sleep_with_log(seconds: float) -> None:
    if seconds > 0:
        time.sleep(seconds)


def fetch_team_shots(
    team_id: int,
    season: str = SEASON,
    season_type: str = SEASON_TYPE,
) -> pd.DataFrame | None:
    """Fetch one team's playoff shots with retry/backoff.

    Returns the validated DataFrame on success. Returns None if MAX_RETRIES
    are exhausted (caller decides whether to skip or abort).
    """
    delay = SLEEP_BETWEEN_REQUESTS
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df = _call_shotchartdetail(team_id, season, season_type)
            validate_shots(df)
            return df
        except Exception as exc:                     # noqa: BLE001 — we re-log and re-raise via return None
            last_exc = exc
            logger.warning(
                "fetch_team_shots(team_id=%s) attempt %d/%d failed: %s",
                team_id, attempt, MAX_RETRIES, exc,
            )
            if attempt < MAX_RETRIES:
                _sleep_with_log(delay)
                delay *= BACKOFF_FACTOR
    logger.error("fetch_team_shots(team_id=%s) exhausted retries: %s", team_id, last_exc)
    return None


def fetch_games(season: str = SEASON, season_type: str = SEASON_TYPE) -> pd.DataFrame | None:
    """Fetch the playoff games table for home/away derivation."""
    delay = SLEEP_BETWEEN_REQUESTS
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df = _call_leaguegamefinder(season, season_type)
            validate_games(df)
            return df
        except Exception as exc:                     # noqa: BLE001
            last_exc = exc
            logger.warning(
                "fetch_games attempt %d/%d failed: %s", attempt, MAX_RETRIES, exc,
            )
            if attempt < MAX_RETRIES:
                _sleep_with_log(delay)
                delay *= BACKOFF_FACTOR
    logger.error("fetch_games exhausted retries: %s", last_exc)
    return None


# --- Orchestration --------------------------------------------------------


def _shots_path(team_id: int) -> Path:
    return SHOTS_CACHE_DIR / f"{team_id}.parquet"


def fetch_all_playoff_shots(
    *,
    use_cache: bool = True,
    team_ids: Iterable[int] | None = None,
    season: str = SEASON,
    season_type: str = SEASON_TYPE,
) -> pd.DataFrame:
    """Fetch shots for all NBA teams' playoff appearances.

    Workflow per team:
      1. If `use_cache` and cache file exists → read it.
      2. Else → call API, validate, atomic-write to cache.
      3. Sleep SLEEP_BETWEEN_REQUESTS between API calls (not between cache reads).

    Returns the concatenated DataFrame across all teams.

    Loud warning if any team returns zero shots after a full pass — this is
    how we surface partial cache or playoff-bracket-incomplete situations
    without silently training on bad data.
    """
    SHOTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cleanup_stale_tmp(SHOTS_CACHE_DIR, max_age_seconds=STALE_TMP_MAX_AGE_SECONDS)

    if team_ids is None:
        team_ids = _call_team_list()
    team_ids = list(team_ids)

    frames: list[pd.DataFrame] = []
    empty_teams: list[int] = []
    api_hits = 0

    for team_id in tqdm(team_ids, desc="fetch teams", unit="team"):
        cache_path = _shots_path(team_id)
        df: pd.DataFrame | None = None
        if use_cache and cache_path.exists():
            df = pd.read_parquet(cache_path)
        else:
            if api_hits > 0:
                _sleep_with_log(SLEEP_BETWEEN_REQUESTS)
            df = fetch_team_shots(team_id, season=season, season_type=season_type)
            api_hits += 1
            if df is None:
                logger.warning("Skipping team_id=%s after retry exhaustion", team_id)
                continue
            atomic_write_parquet(df, cache_path)

        if df is None or df.empty:
            empty_teams.append(team_id)
        else:
            frames.append(df)

    if not frames:
        raise RuntimeError(
            "fetch_all_playoff_shots: no shots returned for any team. "
            "Likely causes: playoff bracket not started, all API calls failed, "
            "or empty cache with use_cache=True."
        )

    if empty_teams:
        logger.warning(
            "fetch_all_playoff_shots: %d/%d teams returned zero shots: %s. "
            "If the bracket is still running this is expected; otherwise investigate.",
            len(empty_teams), len(team_ids), empty_teams,
        )

    result = pd.concat(frames, ignore_index=True)
    logger.info(
        "fetch_all_playoff_shots: %d shots from %d/%d teams (api_hits=%d)",
        len(result), len(team_ids) - len(empty_teams), len(team_ids), api_hits,
    )
    return result
