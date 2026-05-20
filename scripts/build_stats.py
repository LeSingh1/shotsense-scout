#!/usr/bin/env python3
"""Pre-compute player profiles, team profiles, and game logs from raw shot data.

Reads:
  frontend/lib/data/shots_by_game.json
  frontend/lib/data/games.json
  frontend/lib/data/ranking.json
  frontend/lib/data/shots.json

Writes:
  frontend/lib/data/player_profiles.json
  frontend/lib/data/team_profiles.json
  frontend/lib/data/game_logs.json
"""

import json
import os
from collections import defaultdict
from pathlib import Path

RECENT_GAMES = 3

ZONE_MAP = {
    "Restricted Area": "restricted_area",
    "In The Paint (Non-RA)": "paint_non_ra",
    "Mid-Range": "midrange",
    "Left Corner 3": "left_corner_3",
    "Right Corner 3": "right_corner_3",
    "Above the Break 3": "above_break_3",
    "Backcourt": "backcourt",
}

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "frontend" / "lib" / "data"


def load_json(name: str):
    with open(DATA_DIR / name) as f:
        return json.load(f)


def save_json(name: str, data):
    with open(DATA_DIR / name, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"  wrote {name} ({os.path.getsize(DATA_DIR / name) / 1024:.1f} KB)")


def round_pct(val: float | None, digits: int = 4) -> float | None:
    return round(val, digits) if val is not None else None


def safe_pct(makes: int, attempts: int) -> float | None:
    return round(makes / attempts, 4) if attempts > 0 else None


def build_xfg_lookup(shots_json: dict) -> dict:
    """Build a lookup: (player_id, x, y, made) -> list of xfg values.

    shots.json is keyed by player_id (str), each value has name + shots array
    with {x, y, made, xfg}. We use a list because the same (x,y,made) combo
    can appear multiple times for a player.
    """
    lookup: dict[tuple, list[float]] = defaultdict(list)
    for pid_str, entry in shots_json.items():
        pid = int(pid_str)
        for s in entry.get("shots", []):
            key = (pid, s["x"], s["y"], bool(s["made"]))
            lookup[key].append(s["xfg"])
    return lookup


def get_xfg(lookup: dict, player_id: int, x: int, y: int, made: bool) -> float | None:
    """Pop one xfg value for a shot from the lookup (consuming it to avoid reuse)."""
    key = (player_id, x, y, made)
    vals = lookup.get(key)
    if vals:
        return vals.pop(0)
    return None


def build_game_date_map(games: list) -> dict:
    """game_id -> {date, home_team, away_team}"""
    return {g["game_id"]: g for g in games}


def flatten_shots(shots_by_game: dict) -> list:
    """Flatten the game-keyed dict into a list of shots with game_id attached."""
    all_shots = []
    for game_id, shots in shots_by_game.items():
        for s in shots:
            s_copy = dict(s)
            s_copy["game_id"] = game_id
            all_shots.append(s_copy)
    return all_shots


def opponent_for(game: dict, team_abbrev: str) -> str:
    if game["home_team"] == team_abbrev:
        return game["away_team"]
    return game["home_team"]


def build_player_profiles(all_shots: list, xfg_lookup: dict, game_map: dict) -> list:
    # Group shots by player
    by_player: dict[int, list] = defaultdict(list)
    for s in all_shots:
        by_player[s["player_id"]].append(s)

    profiles = []
    for pid, shots in by_player.items():
        player_name = shots[0]["player_name"]
        team = shots[0]["team_abbrev"]

        # Games played (unique game_ids)
        game_ids = sorted(set(s["game_id"] for s in shots))
        games_played = len(game_ids)

        total_shots = len(shots)
        total_makes = sum(1 for s in shots if s["made"])
        overall_fg_pct = safe_pct(total_makes, total_shots)

        # xfg values for this player
        xfg_values = []
        for s in shots:
            xfg = get_xfg(xfg_lookup, pid, s["x"], s["y"], s["made"])
            s["_xfg"] = xfg
            if xfg is not None:
                xfg_values.append(xfg)
        overall_xfg = round(sum(xfg_values) / len(xfg_values), 4) if xfg_values else None

        # Zone stats
        zone_shots: dict[str, list] = defaultdict(list)
        for s in shots:
            zkey = ZONE_MAP.get(s["shot_zone"])
            if zkey:
                zone_shots[zkey].append(s)

        # Recent games (last N by date)
        game_dates = [(gid, game_map[gid]["date"]) for gid in game_ids if gid in game_map]
        game_dates.sort(key=lambda x: x[1])
        recent_game_ids = set(gid for gid, _ in game_dates[-RECENT_GAMES:])
        recent_shots = [s for s in shots if s["game_id"] in recent_game_ids]

        zones = {}
        for zkey, zshots in zone_shots.items():
            attempts = len(zshots)
            makes = sum(1 for s in zshots if s["made"])
            fg_pct = safe_pct(makes, attempts)

            z_xfg_vals = [s["_xfg"] for s in zshots if s.get("_xfg") is not None]
            z_xfg = round(sum(z_xfg_vals) / len(z_xfg_vals), 4) if z_xfg_vals else None

            # Recent zone stats
            rz = [s for s in recent_shots if ZONE_MAP.get(s["shot_zone"]) == zkey]
            r_attempts = len(rz)
            r_makes = sum(1 for s in rz if s["made"])
            r_fg_pct = safe_pct(r_makes, r_attempts)

            delta = round(r_fg_pct - fg_pct, 4) if (r_fg_pct is not None and fg_pct is not None) else None

            zones[zkey] = {
                "attempts": attempts,
                "makes": makes,
                "fg_pct": fg_pct,
                "xfg": z_xfg,
                "recent": {
                    "attempts": r_attempts,
                    "makes": r_makes,
                    "fg_pct": r_fg_pct,
                },
                "delta": delta,
            }

        profiles.append({
            "player_name": player_name,
            "player_id": pid,
            "team": team,
            "games_played": games_played,
            "total_shots": total_shots,
            "overall_fg_pct": overall_fg_pct,
            "overall_xfg": overall_xfg,
            "zones": zones,
        })

    profiles.sort(key=lambda p: p["total_shots"], reverse=True)
    return profiles


def build_team_profiles(all_shots: list, game_map: dict) -> list:
    by_team: dict[str, list] = defaultdict(list)
    for s in all_shots:
        by_team[s["team_abbrev"]].append(s)

    profiles = []
    for team_abbr, shots in by_team.items():
        game_ids = set(s["game_id"] for s in shots)
        games_played = len(game_ids)
        total_shots = len(shots)
        total_makes = sum(1 for s in shots if s["made"])
        overall_fg_pct = safe_pct(total_makes, total_shots)

        # Zone stats
        zone_shots: dict[str, list] = defaultdict(list)
        for s in shots:
            zkey = ZONE_MAP.get(s["shot_zone"])
            if zkey:
                zone_shots[zkey].append(s)

        zones = {}
        for zkey, zshots in zone_shots.items():
            attempts = len(zshots)
            makes = sum(1 for s in zshots if s["made"])
            zones[zkey] = {
                "attempts": attempts,
                "makes": makes,
                "fg_pct": safe_pct(makes, attempts),
            }

        # Shot distribution (% of total shots per zone)
        shot_distribution = {}
        for zkey, zdata in zones.items():
            shot_distribution[zkey] = round(zdata["attempts"] / total_shots, 4) if total_shots > 0 else 0

        # Paint attempts per game (restricted_area + paint_non_ra)
        paint_attempts = sum(
            zones.get(z, {}).get("attempts", 0)
            for z in ["restricted_area", "paint_non_ra"]
        )
        paint_per_game = round(paint_attempts / games_played, 2) if games_played > 0 else 0

        # Three-point rate
        three_zones = ["left_corner_3", "right_corner_3", "above_break_3"]
        three_attempts = sum(zones.get(z, {}).get("attempts", 0) for z in three_zones)
        three_point_rate = round(three_attempts / total_shots, 4) if total_shots > 0 else 0

        profiles.append({
            "team_name": team_abbr,  # We only have abbreviations in the data
            "team_abbr": team_abbr,
            "games_played": games_played,
            "total_shots": total_shots,
            "overall_fg_pct": overall_fg_pct,
            "zones": zones,
            "shot_distribution": shot_distribution,
            "paint_attempts_per_game": paint_per_game,
            "three_point_rate": three_point_rate,
        })

    profiles.sort(key=lambda p: p["total_shots"], reverse=True)
    return profiles


def build_game_logs(all_shots: list, xfg_lookup_unused, game_map: dict) -> list:
    """Build per-player, per-game rows.

    Note: xfg was already attached to shots as _xfg during player profile building.
    """
    # Group by (player_id, game_id)
    grouped: dict[tuple, list] = defaultdict(list)
    for s in all_shots:
        grouped[(s["player_id"], s["game_id"])].append(s)

    logs = []
    for (pid, gid), shots in grouped.items():
        game = game_map.get(gid, {})
        player_name = shots[0]["player_name"]
        team = shots[0]["team_abbrev"]

        attempts = len(shots)
        makes = sum(1 for s in shots if s["made"])
        fg_pct = safe_pct(makes, attempts)

        xfg_vals = [s["_xfg"] for s in shots if s.get("_xfg") is not None]
        mean_xfg = round(sum(xfg_vals) / len(xfg_vals), 4) if xfg_vals else None

        # Zone breakdown
        zone_breakdown = {}
        for s in shots:
            zkey = ZONE_MAP.get(s["shot_zone"])
            if zkey:
                if zkey not in zone_breakdown:
                    zone_breakdown[zkey] = {"attempts": 0, "makes": 0}
                zone_breakdown[zkey]["attempts"] += 1
                if s["made"]:
                    zone_breakdown[zkey]["makes"] += 1

        # Quarter breakdown
        quarter_breakdown = {}
        for s in shots:
            q = s["period"]
            qkey = str(q)
            if qkey not in quarter_breakdown:
                quarter_breakdown[qkey] = {"attempts": 0, "makes": 0}
            quarter_breakdown[qkey]["attempts"] += 1
            if s["made"]:
                quarter_breakdown[qkey]["makes"] += 1
        for qdata in quarter_breakdown.values():
            qdata["fg_pct"] = safe_pct(qdata["makes"], qdata["attempts"])

        logs.append({
            "player_name": player_name,
            "player_id": pid,
            "game_date": game.get("date"),
            "opponent": opponent_for(game, team) if game else None,
            "game_id": gid,
            "shots_attempted": attempts,
            "shots_made": makes,
            "fg_pct": fg_pct,
            "mean_xfg": mean_xfg,
            "zone_breakdown": zone_breakdown,
            "quarter_breakdown": quarter_breakdown,
        })

    logs.sort(key=lambda r: (r["game_date"] or "", r["player_name"]))
    return logs


def main():
    print("Loading data...")
    shots_by_game = load_json("shots_by_game.json")
    games = load_json("games.json")
    ranking = load_json("ranking.json")
    shots_json = load_json("shots.json")

    game_map = build_game_date_map(games)
    xfg_lookup = build_xfg_lookup(shots_json)
    all_shots = flatten_shots(shots_by_game)

    print(f"  {len(all_shots)} shots across {len(shots_by_game)} games, {len(ranking)} ranked players")

    print("Building player profiles...")
    player_profiles = build_player_profiles(all_shots, xfg_lookup, game_map)
    print(f"  {len(player_profiles)} players")

    print("Building team profiles...")
    team_profiles = build_team_profiles(all_shots, game_map)
    print(f"  {len(team_profiles)} teams")

    print("Building game logs...")
    game_logs = build_game_logs(all_shots, xfg_lookup, game_map)
    print(f"  {len(game_logs)} rows")

    print("Writing output...")
    save_json("player_profiles.json", player_profiles)
    save_json("team_profiles.json", team_profiles)
    save_json("game_logs.json", game_logs)

    print("Done.")


if __name__ == "__main__":
    main()
