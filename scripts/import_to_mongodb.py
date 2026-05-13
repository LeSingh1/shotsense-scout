"""Import scored playoff shots into MongoDB Atlas for the ShotSense Scout agent.

Reuses the same xFG model + feature pipeline as `export_for_frontend.py` so the
Mongo `shots` collection carries identical xfg values to what the frontend
dashboard displays. No new model run.

Writes:
  - shots          one document per scored shot, _id = shot_id
  - players        one document per ranked player, _id = player_id

Each shot also gets a natural-language `summary` field used as the embedding
source by `build_embeddings.py`.

Idempotent: re-running upserts on _id, no duplicates.

Env:
  MONGODB_URI   Atlas connection string (required)
  MONGODB_DB    target database (default: nba_shot_quality)

Usage:
  python scripts/import_to_mongodb.py            # full reimport
  python scripts/import_to_mongodb.py --limit 50 # smoke test
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

_PKG_ROOT = Path(__file__).resolve().parents[1]
if str(_PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(_PKG_ROOT))

import pandas as pd  # noqa: E402

from nba_shot_quality.features import engineer_features  # noqa: E402
from nba_shot_quality.features.engineer import ALL_FEATURE_COLS  # noqa: E402
from nba_shot_quality.model import load_latest  # noqa: E402

from scripts.export_for_frontend import (  # noqa: E402
    _load_latest_ranking_csv,
    _load_all_shots,
    _load_games,
)

logger = logging.getLogger("import_to_mongodb")


def _shot_summary(row) -> str:
    """One-sentence natural-language description used as the embedding source.

    The summary determines what "semantically similar" means in vector search.
    Keep it short, specific, and built only from fields a viewer would notice.
    """
    made = "made" if int(row.SHOT_MADE_FLAG) else "missed"
    period = int(row.PERIOD)
    seconds_left = (
        int(row.MINUTES_REMAINING) * 60 + int(row.SECONDS_REMAINING)
        if "MINUTES_REMAINING" in row._fields
        else 0
    )
    clock_phrase = "clutch" if period >= 4 and seconds_left <= 120 else f"period {period}"
    distance = int(row.SHOT_DISTANCE)
    zone = str(row.SHOT_ZONE_BASIC).lower()
    action = str(row.ACTION_TYPE).lower()
    xfg_pct = round(float(row.xfg_pred) * 100)
    return (
        f"{row.PLAYER_NAME} {made} a {distance}-ft {action} from the {zone} "
        f"during {clock_phrase} with an estimated xFG of {xfg_pct} percent."
    )


def _shot_doc(row, summary: str) -> dict:
    """Map a scored shot row to the Mongo document schema."""
    shot_id = f"{row.GAME_ID}_{row.GAME_EVENT_ID}"
    is_three = int(row.SHOT_TYPE.startswith("3"))
    return {
        "_id": shot_id,
        "shot_id": shot_id,
        "game_id": str(row.GAME_ID),
        "player_id": int(row.PLAYER_ID),
        "player": str(row.PLAYER_NAME),
        "team_id": int(row.TEAM_ID),
        "team": str(row.TEAM_NAME),
        "period": int(row.PERIOD),
        "minutes_remaining": int(row.MINUTES_REMAINING),
        "seconds_remaining": int(row.SECONDS_REMAINING),
        "loc_x": int(row.LOC_X),
        "loc_y": int(row.LOC_Y),
        "shot_distance": int(row.SHOT_DISTANCE),
        "shot_zone": str(row.SHOT_ZONE_BASIC),
        "shot_zone_area": str(row.SHOT_ZONE_AREA),
        "action_type": str(row.ACTION_TYPE),
        "shot_type": str(row.SHOT_TYPE),
        "shot_made": bool(int(row.SHOT_MADE_FLAG)),
        "is_three_point": bool(is_three),
        "xfg": round(float(row.xfg_pred), 4),
        "fg_over_expected": round(
            float(row.SHOT_MADE_FLAG) - float(row.xfg_pred), 4
        ),
        "summary": summary,
    }


def _player_doc(row) -> dict:
    """Player ranking row → Mongo player document."""
    return {
        "_id": int(row["PLAYER_ID"]),
        "player_id": int(row["PLAYER_ID"]),
        "name": str(row["PLAYER_NAME"]),
        "team": str(row.get("TEAM_NAME", "")) if "TEAM_NAME" in row else None,
        "n_shots": int(row.get("N_SHOTS", 0)),
        "fg_pct": float(row.get("FG_PCT", 0.0)),
        "xfg_pct": float(row.get("XFG_PCT", 0.0)),
        "shrunk_delta": float(row.get("shrunk_delta", 0.0)),
    }


def _bulk_upsert(coll, docs: list[dict], batch_size: int = 500) -> tuple[int, int]:
    """Upsert in batches. Returns (matched, upserted) counts."""
    from pymongo import UpdateOne

    matched = 0
    upserted = 0
    for i in range(0, len(docs), batch_size):
        chunk = docs[i : i + batch_size]
        ops = [UpdateOne({"_id": d["_id"]}, {"$set": d}, upsert=True) for d in chunk]
        result = coll.bulk_write(ops, ordered=False)
        matched += result.matched_count
        upserted += result.upserted_count
        logger.info("  upserted batch %d-%d", i, i + len(chunk))
    return matched, upserted


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap on number of shots to import. Useful for smoke tests.",
    )
    parser.add_argument(
        "--skip-players",
        action="store_true",
        help="Skip importing the players collection.",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
    )

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        logger.error("MONGODB_URI is required. See .env.example.")
        return 2
    db_name = os.environ.get("MONGODB_DB", "nba_shot_quality")

    try:
        from pymongo import MongoClient
    except ImportError:
        logger.error("pymongo not installed. Run: pip install pymongo")
        return 2

    client = MongoClient(uri, serverSelectionTimeoutMS=15_000)
    client.admin.command("ping")  # fail fast on bad URI
    db = client[db_name]
    logger.info("Connected to %s.%s", db_name, "shots/players")

    # Reuse the same data + model pipeline as export_for_frontend
    logger.info("Loading ranking + raw shots + model...")
    _, ranking_df = _load_latest_ranking_csv()
    shots_raw = _load_all_shots()
    games = _load_games()
    engineered = engineer_features(shots_raw, games)
    model = load_latest()
    proba = model.predict_proba(engineered[list(ALL_FEATURE_COLS)])[:, 1]
    scored = engineered.assign(xfg_pred=proba)
    logger.info("Scored %d shots across %d players", len(scored), scored["PLAYER_ID"].nunique())

    if args.limit:
        scored = scored.head(args.limit)
        logger.info("Limited to %d shots for smoke test", len(scored))

    # Build shot docs
    logger.info("Building shot documents with summaries...")
    shot_docs: list[dict] = []
    for row in scored.itertuples():
        summary = _shot_summary(row)
        shot_docs.append(_shot_doc(row, summary))
    logger.info("Built %d shot docs", len(shot_docs))

    # Upsert
    logger.info("Upserting shots...")
    matched, upserted = _bulk_upsert(db["shots"], shot_docs)
    logger.info("shots: %d updated, %d inserted", matched, upserted)

    # Indexes that the agent's queries will hit
    db["shots"].create_index([("player_id", 1), ("xfg", 1)])
    db["shots"].create_index([("is_three_point", 1), ("shot_made", 1), ("xfg", 1)])
    db["shots"].create_index([("game_id", 1)])
    logger.info("Indexes ensured on shots")

    if not args.skip_players:
        logger.info("Upserting players...")
        player_docs = [_player_doc(r) for _, r in ranking_df.iterrows()]
        m, u = _bulk_upsert(db["players"], player_docs)
        logger.info("players: %d updated, %d inserted", m, u)

    logger.info("Import complete. Next step: python scripts/build_embeddings.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
