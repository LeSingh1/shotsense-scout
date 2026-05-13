"""Atomic parquet cache.

Writes go to `path.tmp` first, then `os.replace(tmp, path)` makes the rename
atomic on POSIX. If the process is killed mid-write, the destination is never
half-written; the `.tmp` orphan is cleaned by `cleanup_stale_tmp()` on the
next run.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)


def atomic_write_parquet(df: pd.DataFrame, path: Path) -> None:
    """Write `df` to `path` atomically.

    Strategy: write to `path.with_suffix(path.suffix + '.tmp')`, then
    `os.replace` to the final path. The replace is atomic on POSIX.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    try:
        df.to_parquet(tmp_path, index=False)
        os.replace(tmp_path, path)
    except Exception:
        # Leave the .tmp orphan; cleanup_stale_tmp will get it on the next
        # run. We don't delete it here because doing so before the original
        # error propagates can hide the real cause in the traceback.
        raise


def cleanup_stale_tmp(cache_dir: Path, max_age_seconds: int = 3600) -> int:
    """Delete `*.tmp` files in `cache_dir` (recursive) older than `max_age_seconds`.

    Returns the number of files deleted. Safe to call before every fetch run.
    """
    cache_dir = Path(cache_dir)
    if not cache_dir.exists():
        return 0
    now = time.time()
    deleted = 0
    for tmp in cache_dir.rglob("*.tmp"):
        try:
            age = now - tmp.stat().st_mtime
        except FileNotFoundError:
            continue
        if age >= max_age_seconds:
            try:
                tmp.unlink()
                deleted += 1
                logger.info("cleanup_stale_tmp: removed %s (age=%.0fs)", tmp, age)
            except OSError as exc:
                logger.warning("cleanup_stale_tmp: failed to remove %s: %s", tmp, exc)
    return deleted
