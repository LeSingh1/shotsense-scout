"""Atomic write + cleanup_stale_tmp.

These are the tests for the "process killed mid-write doesn't corrupt cache"
guarantee. We use `monkeypatch` to make `to_parquet` raise mid-write.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import pandas as pd
import pytest

from nba_shot_quality.data.cache import atomic_write_parquet, cleanup_stale_tmp


def test_atomic_write_succeeds(tmp_path: Path, mini_shots: pd.DataFrame) -> None:
    out = tmp_path / "team.parquet"
    atomic_write_parquet(mini_shots, out)
    assert out.exists()
    # No orphan .tmp
    assert not (tmp_path / "team.parquet.tmp").exists()
    # Round-trip
    pd.testing.assert_frame_equal(pd.read_parquet(out).reset_index(drop=True),
                                  mini_shots.reset_index(drop=True))


def test_atomic_write_leaves_no_corrupt_file_on_failure(
    tmp_path: Path,
    mini_shots: pd.DataFrame,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mid-write failure: target parquet doesn't exist; .tmp orphan may remain."""
    out = tmp_path / "team.parquet"

    def boom(self, path, *args, **kwargs):
        # Write some bytes so the .tmp file exists, then raise.
        with open(path, "wb") as f:
            f.write(b"PAR1corrupt")
        raise IOError("simulated mid-write failure")

    monkeypatch.setattr(pd.DataFrame, "to_parquet", boom)

    with pytest.raises(IOError, match="simulated mid-write"):
        atomic_write_parquet(mini_shots, out)

    # Target was never created
    assert not out.exists()
    # Orphan .tmp may exist; cleanup handles it on the next run.


def test_cleanup_stale_tmp_removes_old_orphans(tmp_path: Path) -> None:
    cache = tmp_path / "shots"
    cache.mkdir()
    stale = cache / "1.parquet.tmp"
    fresh = cache / "2.parquet.tmp"
    stale.write_text("x")
    fresh.write_text("y")

    # Backdate the stale file
    old_time = time.time() - 7200      # 2h ago
    os.utime(stale, (old_time, old_time))

    deleted = cleanup_stale_tmp(cache, max_age_seconds=3600)

    assert deleted == 1
    assert not stale.exists()
    assert fresh.exists()


def test_cleanup_stale_tmp_handles_missing_dir(tmp_path: Path) -> None:
    deleted = cleanup_stale_tmp(tmp_path / "does_not_exist")
    assert deleted == 0


def test_cleanup_stale_tmp_max_age_zero_removes_all(tmp_path: Path) -> None:
    cache = tmp_path / "shots"
    cache.mkdir()
    (cache / "1.parquet.tmp").write_text("x")
    (cache / "2.parquet.tmp").write_text("y")
    assert cleanup_stale_tmp(cache, max_age_seconds=0) == 2
