"""Import playoff shots and players into MongoDB Atlas.

Reads from the already-exported frontend JSON files in `frontend/lib/data/`,
so this script has zero dependency on running the XGBoost pipeline. It only
needs pymongo and the JSON tree that ships with the repo.

Writes:
  - shots          one document per shot, _id = "<game_id>_<event_id>"
  - players        one document per ranked player, _id = player_id

Each shot also gets a natural-language `summary` field used as the embedding
source by `build_embeddings.py`.

Idempotent: re-running upserts on _id, no duplicates.

Env:
  MONGODB_URI   Atlas connection string (required)
  MONGODB_DB    target database (default: shotsense)

Usage:
  python scripts/import_to_mongodb.py            # full import
  python scripts/import_to_mongodb.py --limit 50 # smoke test
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger("import_to_mongodb")

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "frontend" / "lib" / "data"


def _load_json(name: str) -> object:
    path = DATA_DIR / name
    if not path.exists():
        raise FileNotFoundError(
            f"Missing {path}. Make sure you cloned the repo with the data tree intact."
        )
    with path.open() as f:
        return json.load(f)


def _build_xfg_lookup(shots_by_player: dict) -> dict:
    """Map (player_id, x, y, made_int) -> xfg from the per-player shots tree.

    The frontend JSON downsamples to <=500 shots/player, so not every
    (player, location) tuple in shots_by_game.json will have a match.
    Shots without an xfg match get skipped in the import.
    """
    lookup: dict[tuple, float] = {}
    for pid_str, entry in shots_by_player.items():
        pid = int(pid_str)
        for s in entry.get("shots", []):
            key = (pid, int(s["x"]), int(s["y"]), int(s["made"]))
            # If two shots collide on the key (rare), keep the first.
            lookup.setdefault(key, float(s["xfg"]))
    return lookup


def _shot_summary(s: dict, player_name: str, period: int, seconds_left: int, xfg: float) -> str:
    made = "made" if s.get("made") else "missed"
    clock_phrase = "clutch" if period >= 4 and seconds_left <= 120 else f"period {period}"
    distance = int(s.get("shot_distance", 0))
    zone = str(s.get("shot_zone", "")).lower()
    action = str(s.get("action_type", "")).lower()
    xfg_pct = round(xfg * 100)
    return (
        f"{player_name} {made} a {distance}-ft {action} from the {zone} "
        f"during {clock_phrase} with an estimated xFG of {xfg_pct} percent."
    )


def _shot_doc(s: dict, game_id: str, xfg: float) -> dict:
    """Map a shot from shots_by_game.json + its joined xFG to the Mongo schema."""
    event_id = s.get("shot_id")
    _id = f"{game_id}_{event_id}"
    made = bool(s.get("made"))
    period = int(s.get("period", 0))
    # The exporter's `seconds_remaining` is canonical total-seconds-left-in-period
    # (range 0-720), not the 0-59 seconds-of-clock value. `minutes_remaining` is
    # just floor(seconds_remaining / 60), kept for human-friendly display.
    seconds_left = int(s.get("seconds_remaining", 0))
    minutes_left = seconds_left // 60
    is_three = str(s.get("shot_type", "")).startswith("3")
    summary = _shot_summary(s, s.get("player_name", ""), period, seconds_left, xfg)
    return {
        "_id": _id,
        "shot_id": _id,
        "event_id": int(event_id) if event_id is not None else None,
        "game_id": game_id,
        "player_id": int(s["player_id"]),
        "player": str(s.get("player_name", "")),
        "team_id": int(s.get("team_id", 0)),
        "team": str(s.get("team_abbrev", "")),
        "period": period,
        "minutes_left_in_period": minutes_left,
        "seconds_left_in_period": seconds_left,
        "loc_x": int(s.get("x", 0)),
        "loc_y": int(s.get("y", 0)),
        "shot_distance": int(s.get("shot_distance", 0)),
        "shot_angle": float(s.get("shot_angle", 0.0)),
        "shot_zone": str(s.get("shot_zone", "")),
        "action_type": str(s.get("action_type", "")),
        "shot_type": str(s.get("shot_type", "")),
        "shot_made": made,
        "is_three_point": is_three,
        "xfg": round(xfg, 4),
        "fg_over_expected": round((1.0 if made else 0.0) - xfg, 4),
        "summary": summary,
    }


def _player_doc(r: dict) -> dict:
    return {
        "_id": int(r["player_id"]),
        "player_id": int(r["player_id"]),
        "name": str(r.get("player_name", "")),
        "n_shots": int(r.get("n_shots", 0)),
        "actual_fg": float(r.get("actual_fg", 0.0)),
        "mean_xfg": float(r.get("mean_xfg", 0.0)),
        "raw_delta": float(r.get("raw_delta", 0.0)),
        "shrunk_delta": float(r.get("shrunk_delta", 0.0)),
        "ci_lo": float(r.get("ci_lo", 0.0)),
        "ci_hi": float(r.get("ci_hi", 0.0)),
    }


def _bulk_upsert(coll, docs: list[dict], batch_size: int = 500) -> tuple[int, int]:
    from pymongo import UpdateOne

    matched = 0
    upserted = 0
    for i in range(0, len(docs), batch_size):
        chunk = docs[i : i + batch_size]
        ops = [UpdateOne({"_id": d["_id"]}, {"$set": d}, upsert=True) for d in chunk]
        result = coll.bulk_write(ops, ordered=False)
        matched += result.matched_count
        upserted += result.upserted_count
        if (i // batch_size) % 5 == 0:
            logger.info("  ...batch %d-%d (matched=%d upserted=%d)", i, i + len(chunk), matched, upserted)
    return matched, upserted


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None, help="Cap on shot count (smoke test).")
    parser.add_argument("--skip-players", action="store_true")
    parser.add_argument("--skip-shots", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
    )

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        logger.error("MONGODB_URI is required. See .env.example.")
        return 2
    db_name = os.environ.get("MONGODB_DB", "shotsense")

    try:
        from pymongo import MongoClient
    except ImportError:
        logger.error("pymongo not installed. Run: pip install pymongo python-dotenv")
        return 2

    # Optional .env loading so the user doesn't have to export by hand.
    try:
        from dotenv import load_dotenv
        load_dotenv(REPO_ROOT / ".env")
        uri = os.environ.get("MONGODB_URI", uri)
        db_name = os.environ.get("MONGODB_DB", db_name)
    except ImportError:
        pass

    client = MongoClient(uri, serverSelectionTimeoutMS=15_000)
    client.admin.command("ping")
    db = client[db_name]
    logger.info("Connected to %s", db_name)

    # ---------------- Shots ----------------
    if not args.skip_shots:
        logger.info("Loading shots_by_game.json + shots.json ...")
        shots_by_game = _load_json("shots_by_game.json")
        shots_by_player = _load_json("shots.json")
        xfg_lookup = _build_xfg_lookup(shots_by_player)  # type: ignore[arg-type]
        logger.info("xFG lookup built: %d (player_id, x, y, made) entries", len(xfg_lookup))

        docs: list[dict] = []
        skipped_no_xfg = 0
        for game_id, game_shots in shots_by_game.items():  # type: ignore[union-attr]
            for s in game_shots:
                key = (int(s["player_id"]), int(s["x"]), int(s["y"]), 1 if s.get("made") else 0)
                xfg = xfg_lookup.get(key)
                if xfg is None:
                    skipped_no_xfg += 1
                    continue
                docs.append(_shot_doc(s, str(game_id), xfg))
        logger.info(
            "Built %d shot docs across %d games (%d shots skipped: not in xfg lookup downsample)",
            len(docs),
            len(shots_by_game),  # type: ignore[arg-type]
            skipped_no_xfg,
        )
        if args.limit:
            docs = docs[: args.limit]
            logger.info("Limited to %d shots for smoke test", len(docs))

        logger.info("Upserting shots ...")
        matched, upserted = _bulk_upsert(db["shots"], docs)
        logger.info("shots: %d updated, %d inserted (total %d)", matched, upserted, matched + upserted)

        db["shots"].create_index([("player_id", 1), ("xfg", 1)])
        db["shots"].create_index([("player", 1), ("is_three_point", 1), ("shot_made", 1), ("xfg", 1)])
        db["shots"].create_index([("is_three_point", 1), ("shot_made", 1), ("xfg", 1)])
        db["shots"].create_index([("game_id", 1)])
        logger.info("Indexes ensured on shots")

    # ---------------- Players ----------------
    if not args.skip_players:
        logger.info("Loading ranking.json ...")
        ranking = _load_json("ranking.json")
        player_docs = [_player_doc(r) for r in ranking]  # type: ignore[union-attr]
        logger.info("Built %d player docs", len(player_docs))
        m, u = _bulk_upsert(db["players"], player_docs)
        logger.info("players: %d updated, %d inserted", m, u)

    # ---------------- Initial collections ----------------
    # Ensure the agent_memory and reports collections exist (even empty) so judges
    # see all four collections in Atlas immediately after import.
    db["reports"].create_index([("created_at", -1)])
    if "agent_memory" not in db.list_collection_names():
        db.create_collection("agent_memory")
    if "reports" not in db.list_collection_names():
        db.create_collection("reports")

    counts = {c: db[c].estimated_document_count() for c in ["shots", "players", "reports", "agent_memory"]}
    logger.info("Final counts: %s", counts)
    logger.info("Next step: python scripts/build_embeddings.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
