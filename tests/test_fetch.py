"""Fetch behavior: retry/backoff, schema validation, --use-cache resume,
empty-league warning. All API calls are monkeypatched — no real network."""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd
import pytest

import nba_shot_quality.data.fetch as fetch_mod
from nba_shot_quality.data.schema import SchemaError


# --- Single-team fetch: happy path + retry --------------------------------


def test_fetch_team_shots_happy_path(monkeypatch: pytest.MonkeyPatch, mini_shots: pd.DataFrame) -> None:
    team_shots = mini_shots[mini_shots["TEAM_ID"] == mini_shots["TEAM_ID"].iloc[0]].copy()
    monkeypatch.setattr(fetch_mod, "_call_shotchartdetail", lambda *a, **k: team_shots)
    out = fetch_mod.fetch_team_shots(1, season="2025-26", season_type="Playoffs")
    pd.testing.assert_frame_equal(out.reset_index(drop=True), team_shots.reset_index(drop=True))


def test_fetch_team_shots_retries_until_success(
    monkeypatch: pytest.MonkeyPatch,
    mini_shots: pd.DataFrame,
) -> None:
    """Two transient errors then a 200 → returns the 200 payload."""
    team_shots = mini_shots[mini_shots["TEAM_ID"] == mini_shots["TEAM_ID"].iloc[0]].copy()
    call_count = {"n": 0}

    def flaky(*a, **k):
        call_count["n"] += 1
        if call_count["n"] < 3:
            raise ConnectionError("simulated transient")
        return team_shots

    monkeypatch.setattr(fetch_mod, "_call_shotchartdetail", flaky)
    # Speed up tests: don't actually sleep between retries
    monkeypatch.setattr(fetch_mod, "_sleep_with_log", lambda s: None)
    out = fetch_mod.fetch_team_shots(1)
    assert out is not None
    assert call_count["n"] == 3


def test_fetch_team_shots_returns_none_after_max_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    def always_fail(*a, **k):
        raise ConnectionError("rate limit")
    monkeypatch.setattr(fetch_mod, "_call_shotchartdetail", always_fail)
    monkeypatch.setattr(fetch_mod, "_sleep_with_log", lambda s: None)
    out = fetch_mod.fetch_team_shots(1)
    assert out is None


def test_fetch_team_shots_propagates_schema_error_via_retries(
    monkeypatch: pytest.MonkeyPatch,
    mini_shots: pd.DataFrame,
) -> None:
    """A schema-mismatched response is treated as a retryable failure (per current design).

    The validate_shots SchemaError is caught and counts as a retry attempt; after
    MAX_RETRIES the function returns None.
    """
    bad = mini_shots.drop(columns=["SHOT_MADE_FLAG"])
    monkeypatch.setattr(fetch_mod, "_call_shotchartdetail", lambda *a, **k: bad)
    monkeypatch.setattr(fetch_mod, "_sleep_with_log", lambda s: None)
    out = fetch_mod.fetch_team_shots(1)
    assert out is None


# --- Games fetch ---------------------------------------------------------


def test_fetch_games_happy_path(monkeypatch: pytest.MonkeyPatch, mini_games: pd.DataFrame) -> None:
    monkeypatch.setattr(fetch_mod, "_call_leaguegamefinder", lambda *a, **k: mini_games)
    out = fetch_mod.fetch_games()
    pd.testing.assert_frame_equal(out.reset_index(drop=True), mini_games.reset_index(drop=True))


def test_fetch_games_returns_none_after_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(fetch_mod, "_call_leaguegamefinder", lambda *a, **k: (_ for _ in ()).throw(IOError("x")))
    monkeypatch.setattr(fetch_mod, "_sleep_with_log", lambda s: None)
    out = fetch_mod.fetch_games()
    assert out is None


# --- Orchestrator: --use-cache resume semantics --------------------------


def test_fetch_all_uses_cache_when_available(
    monkeypatch: pytest.MonkeyPatch,
    mini_shots: pd.DataFrame,
    tmp_path: Path,
) -> None:
    """If all teams' parquets exist, fetch_all should hit the API zero times."""
    monkeypatch.setattr(fetch_mod, "SHOTS_CACHE_DIR", tmp_path / "shots")
    (tmp_path / "shots").mkdir(parents=True)

    team_ids = sorted(mini_shots["TEAM_ID"].unique().tolist())
    for tid in team_ids:
        team_df = mini_shots[mini_shots["TEAM_ID"] == tid]
        team_df.to_parquet(tmp_path / "shots" / f"{tid}.parquet", index=False)

    call_count = {"n": 0}

    def should_not_be_called(*a, **k):
        call_count["n"] += 1
        raise AssertionError("API should not have been called when cache is complete")

    monkeypatch.setattr(fetch_mod, "_call_shotchartdetail", should_not_be_called)

    out = fetch_mod.fetch_all_playoff_shots(use_cache=True, team_ids=team_ids)
    assert call_count["n"] == 0
    assert len(out) == len(mini_shots)


def test_fetch_all_resumes_missing_teams(
    monkeypatch: pytest.MonkeyPatch,
    mini_shots: pd.DataFrame,
    tmp_path: Path,
) -> None:
    """Cache has team A; team B is missing → API called once for B only."""
    monkeypatch.setattr(fetch_mod, "SHOTS_CACHE_DIR", tmp_path / "shots")
    (tmp_path / "shots").mkdir(parents=True)

    team_ids = sorted(mini_shots["TEAM_ID"].unique().tolist())
    cached_team = team_ids[0]
    missing_team = team_ids[1]

    mini_shots[mini_shots["TEAM_ID"] == cached_team].to_parquet(
        tmp_path / "shots" / f"{cached_team}.parquet", index=False,
    )

    api_calls: list[int] = []

    def fake_api(team_id, season, season_type):
        api_calls.append(team_id)
        return mini_shots[mini_shots["TEAM_ID"] == team_id]

    monkeypatch.setattr(fetch_mod, "_call_shotchartdetail", fake_api)
    monkeypatch.setattr(fetch_mod, "_sleep_with_log", lambda s: None)

    out = fetch_mod.fetch_all_playoff_shots(use_cache=True, team_ids=[cached_team, missing_team])
    assert api_calls == [missing_team]
    assert not out.empty


def test_fetch_all_warns_on_empty_league(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    mini_shots: pd.DataFrame,
    tmp_path: Path,
) -> None:
    """If a team returns zero shots, log a warning (not silently train)."""
    monkeypatch.setattr(fetch_mod, "SHOTS_CACHE_DIR", tmp_path / "shots")
    (tmp_path / "shots").mkdir(parents=True)

    team_ids = sorted(mini_shots["TEAM_ID"].unique().tolist())[:2]
    # Give team 0 valid shots; team 1 returns empty
    mini_shots[mini_shots["TEAM_ID"] == team_ids[0]].to_parquet(
        tmp_path / "shots" / f"{team_ids[0]}.parquet", index=False,
    )
    empty_df = mini_shots.iloc[0:0].copy()
    empty_df.to_parquet(tmp_path / "shots" / f"{team_ids[1]}.parquet", index=False)

    with caplog.at_level(logging.WARNING, logger="nba_shot_quality.data.fetch"):
        out = fetch_mod.fetch_all_playoff_shots(use_cache=True, team_ids=team_ids)

    assert any("zero shots" in r.message for r in caplog.records)
    assert not out.empty


def test_fetch_all_raises_when_no_shots_anywhere(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(fetch_mod, "SHOTS_CACHE_DIR", tmp_path / "shots")
    (tmp_path / "shots").mkdir(parents=True)
    # All teams return None (API exhausted)
    monkeypatch.setattr(fetch_mod, "_call_shotchartdetail", lambda *a, **k: (_ for _ in ()).throw(IOError("x")))
    monkeypatch.setattr(fetch_mod, "_sleep_with_log", lambda s: None)
    with pytest.raises(RuntimeError, match="no shots returned"):
        fetch_mod.fetch_all_playoff_shots(use_cache=False, team_ids=[1, 2])
