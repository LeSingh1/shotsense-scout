#!/usr/bin/env python3
"""Detect shooting patterns from pre-computed player stats and game logs.

Reads:
  frontend/lib/data/player_profiles.json  (217 players with per-zone stats)
  frontend/lib/data/game_logs.json        (1,252 per-player-per-game rows)

Writes:
  frontend/lib/data/patterns.json         (detected patterns, sorted by severity desc)
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "frontend" / "lib" / "data"

RECENT_GAMES = 3

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def ols_slope(ys: list[float]) -> float:
    """Simple OLS slope for y values at x = 0, 1, 2, ..."""
    n = len(ys)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2.0
    y_mean = sum(ys) / n
    num = sum((i - x_mean) * (y - y_mean) for i, y in enumerate(ys))
    den = sum((i - x_mean) ** 2 for i in range(n))
    return num / den if den else 0.0


def fmt_pct(v: float) -> str:
    return f"{v * 100:.1f}%"


# ---------------------------------------------------------------------------
# Pattern detectors
# ---------------------------------------------------------------------------

def detect_cold_hot_zones(profiles: list[dict]) -> list[dict]:
    """cold_zone and hot_zone: recent FG% vs playoff avg differs by 15+ ppt."""
    patterns: list[dict] = []
    for p in profiles:
        for zone_name, z in p.get("zones", {}).items():
            recent = z.get("recent", {})
            if recent.get("attempts", 0) < 5:
                continue
            avg_fg = z.get("fg_pct", 0.0)
            rec_fg = recent.get("fg_pct", 0.0)
            delta = rec_fg - avg_fg
            if abs(delta) < 0.15:
                continue
            is_hot = delta > 0
            ptype = "hot_zone" if is_hot else "cold_zone"
            severity = clamp01(abs(delta))
            patterns.append({
                "player_name": p["player_name"],
                "player_id": p["player_id"],
                "pattern_type": ptype,
                "zone": zone_name,
                "severity": round(severity, 4),
                "direction": "positive" if is_hot else "negative",
                "evidence": {
                    "playoff_fg_pct": round(avg_fg, 4),
                    "recent_fg_pct": round(rec_fg, 4),
                    "delta": round(delta, 4),
                    "recent_attempts": recent["attempts"],
                    "total_attempts": z["attempts"],
                },
                "summary": (
                    f"{p['player_name']}'s {zone_name.replace('_', ' ')} FG% "
                    f"{'rose' if is_hot else 'dropped'} from {fmt_pct(avg_fg)} to "
                    f"{fmt_pct(rec_fg)} over last {RECENT_GAMES} games "
                    f"({recent['attempts']} attempts)."
                ),
                "games_window": [],  # filled later
            })
    return patterns


def detect_shot_profile_shift(
    profiles: list[dict], game_logs: list[dict]
) -> list[dict]:
    """Zone share of total attempts changed by 10+ ppt between recent and full playoffs."""
    patterns: list[dict] = []

    # Build per-player recent total attempts from profiles
    for p in profiles:
        zones = p.get("zones", {})
        total_attempts = p.get("total_shots", 0)
        if total_attempts == 0:
            continue
        recent_total = sum(
            z.get("recent", {}).get("attempts", 0) for z in zones.values()
        )
        if recent_total == 0:
            continue

        for zone_name, z in zones.items():
            full_share = z["attempts"] / total_attempts
            rec_attempts = z.get("recent", {}).get("attempts", 0)
            rec_share = rec_attempts / recent_total
            delta = rec_share - full_share
            if abs(delta) < 0.10:
                continue
            severity = clamp01(abs(delta))
            direction = "positive" if delta > 0 else "negative"
            patterns.append({
                "player_name": p["player_name"],
                "player_id": p["player_id"],
                "pattern_type": "shot_profile_shift",
                "zone": zone_name,
                "severity": round(severity, 4),
                "direction": direction,
                "evidence": {
                    "playoff_share": round(full_share, 4),
                    "recent_share": round(rec_share, 4),
                    "delta": round(delta, 4),
                    "recent_attempts": rec_attempts,
                    "total_attempts": z["attempts"],
                },
                "summary": (
                    f"{p['player_name']}'s {zone_name.replace('_', ' ')} shot share "
                    f"{'increased' if delta > 0 else 'decreased'} from "
                    f"{fmt_pct(full_share)} to {fmt_pct(rec_share)} over last "
                    f"{RECENT_GAMES} games ({rec_attempts} of {recent_total} recent shots)."
                ),
                "games_window": [],
            })
    return patterns


def detect_efficiency_drop(game_logs: list[dict]) -> list[dict]:
    """Per-game FG% has negative OLS slope steeper than -0.05 over 3+ games."""
    patterns: list[dict] = []
    by_player: dict[int, list[dict]] = {}
    for row in game_logs:
        by_player.setdefault(row["player_id"], []).append(row)

    for pid, rows in by_player.items():
        rows_sorted = sorted(rows, key=lambda r: r["game_date"])
        if len(rows_sorted) < 3:
            continue
        fg_pcts = [r["fg_pct"] for r in rows_sorted]
        slope = ols_slope(fg_pcts)
        if slope >= -0.05:
            continue
        severity = clamp01(abs(slope) / 0.15)
        patterns.append({
            "player_name": rows_sorted[0]["player_name"],
            "player_id": pid,
            "pattern_type": "efficiency_drop",
            "zone": None,
            "severity": round(severity, 4),
            "direction": "negative",
            "evidence": {
                "slope": round(slope, 4),
                "games": len(rows_sorted),
                "fg_pcts": [round(v, 4) for v in fg_pcts],
                "first_game_fg": round(fg_pcts[0], 4),
                "last_game_fg": round(fg_pcts[-1], 4),
            },
            "summary": (
                f"{rows_sorted[0]['player_name']}'s per-game FG% trended from "
                f"{fmt_pct(fg_pcts[0])} to {fmt_pct(fg_pcts[-1])} over "
                f"{len(rows_sorted)} games (slope {slope:.4f}/game)."
            ),
            "games_window": [r["game_date"] for r in rows_sorted],
        })
    return patterns


def detect_volume_change(
    profiles: list[dict], game_logs: list[dict]
) -> list[dict]:
    """Shots per game in recent window differs from playoff average by 25%+."""
    patterns: list[dict] = []
    by_player: dict[int, list[dict]] = {}
    for row in game_logs:
        by_player.setdefault(row["player_id"], []).append(row)

    for p in profiles:
        pid = p["player_id"]
        games_played = p.get("games_played", 0)
        if games_played == 0:
            continue
        avg_spg = p["total_shots"] / games_played
        if avg_spg == 0:
            continue

        rows = by_player.get(pid, [])
        recent = sorted(rows, key=lambda r: r["game_date"], reverse=True)[:RECENT_GAMES]
        if len(recent) < RECENT_GAMES:
            continue
        recent_spg = sum(r["shots_attempted"] for r in recent) / len(recent)
        change = (recent_spg - avg_spg) / avg_spg
        if abs(change) < 0.25:
            continue
        severity = clamp01(abs(change) / 0.5)
        direction = "positive" if change > 0 else "negative"
        patterns.append({
            "player_name": p["player_name"],
            "player_id": pid,
            "pattern_type": "volume_change",
            "zone": None,
            "severity": round(severity, 4),
            "direction": direction,
            "evidence": {
                "playoff_avg_spg": round(avg_spg, 2),
                "recent_avg_spg": round(recent_spg, 2),
                "change_pct": round(change, 4),
            },
            "summary": (
                f"{p['player_name']}'s shot volume "
                f"{'increased' if change > 0 else 'decreased'} from "
                f"{avg_spg:.1f} to {recent_spg:.1f} shots/game over last "
                f"{RECENT_GAMES} games ({change:+.0%})."
            ),
            "games_window": [r["game_date"] for r in sorted(recent, key=lambda r: r["game_date"])],
        })
    return patterns


def detect_late_game_fade(game_logs: list[dict]) -> list[dict]:
    """Q4+OT combined FG% is 10+ ppt worse than Q1-Q3. Min 10 attempts each bucket."""
    patterns: list[dict] = []
    by_player: dict[int, dict[str, Any]] = {}

    for row in game_logs:
        pid = row["player_id"]
        if pid not in by_player:
            by_player[pid] = {
                "player_name": row["player_name"],
                "early_attempts": 0,
                "early_makes": 0,
                "late_attempts": 0,
                "late_makes": 0,
                "dates": set(),
            }
        entry = by_player[pid]
        entry["dates"].add(row["game_date"])
        for q, qdata in row.get("quarter_breakdown", {}).items():
            att = qdata.get("attempts", 0)
            makes = qdata.get("makes", 0)
            if q in ("1", "2", "3"):
                entry["early_attempts"] += att
                entry["early_makes"] += makes
            else:  # "4", "5" (OT), etc.
                entry["late_attempts"] += att
                entry["late_makes"] += makes

    for pid, e in by_player.items():
        if e["early_attempts"] < 10 or e["late_attempts"] < 10:
            continue
        early_fg = e["early_makes"] / e["early_attempts"]
        late_fg = e["late_makes"] / e["late_attempts"]
        delta = late_fg - early_fg
        if delta >= -0.10:
            continue
        severity = clamp01(abs(delta) / 0.25)
        patterns.append({
            "player_name": e["player_name"],
            "player_id": pid,
            "pattern_type": "late_game_fade",
            "zone": None,
            "severity": round(severity, 4),
            "direction": "negative",
            "evidence": {
                "q1_q3_fg_pct": round(early_fg, 4),
                "q4_ot_fg_pct": round(late_fg, 4),
                "delta": round(delta, 4),
                "early_attempts": e["early_attempts"],
                "late_attempts": e["late_attempts"],
            },
            "summary": (
                f"{e['player_name']}'s Q4+OT FG% ({fmt_pct(late_fg)}) is "
                f"{abs(delta) * 100:.1f} ppt below Q1-Q3 ({fmt_pct(early_fg)}) "
                f"({e['late_attempts']} late-game attempts)."
            ),
            "games_window": sorted(e["dates"]),
        })
    return patterns


# ---------------------------------------------------------------------------
# Backfill recent game dates for zone-based patterns
# ---------------------------------------------------------------------------

def backfill_game_windows(
    patterns: list[dict], game_logs: list[dict]
) -> None:
    """Fill games_window for patterns that don't already have it."""
    by_player: dict[int, list[str]] = {}
    for row in game_logs:
        by_player.setdefault(row["player_id"], []).append(row["game_date"])

    for pat in patterns:
        if pat["games_window"]:
            continue
        pid = pat["player_id"]
        dates = sorted(set(by_player.get(pid, [])), reverse=True)
        pat["games_window"] = sorted(dates[:RECENT_GAMES])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    profiles = json.loads((DATA / "player_profiles.json").read_text())
    game_logs = json.loads((DATA / "game_logs.json").read_text())

    patterns: list[dict] = []
    patterns.extend(detect_cold_hot_zones(profiles))
    patterns.extend(detect_shot_profile_shift(profiles, game_logs))
    patterns.extend(detect_efficiency_drop(game_logs))
    patterns.extend(detect_volume_change(profiles, game_logs))
    patterns.extend(detect_late_game_fade(game_logs))

    backfill_game_windows(patterns, game_logs)

    # Sort by severity descending
    patterns.sort(key=lambda p: p["severity"], reverse=True)

    out = DATA / "patterns.json"
    out.write_text(json.dumps(patterns, indent=2) + "\n")

    # Summary
    from collections import Counter
    counts = Counter(p["pattern_type"] for p in patterns)
    print(f"Wrote {len(patterns)} patterns to {out}")
    for ptype, n in counts.most_common():
        print(f"  {ptype}: {n}")


if __name__ == "__main__":
    main()
