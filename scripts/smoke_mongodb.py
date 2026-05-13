"""Smoke-test MongoDB Atlas before any heavy import.

Reports:
  1. Connection status (after loading .env)
  2. Database name + collection presence
  3. Per-collection document counts
  4. Sample shot field names + a redacted one-line preview of the first shot
  5. Vector Search index status, if discoverable from the driver
  6. Embedding coverage on shots (% of docs with summary_embedding)

Never prints the raw MONGODB_URI or any credentials. The credential portion of
the URI is redacted in all output.

Env:
  MONGODB_URI    Atlas connection string (required, loaded from .env or shell)
  MONGODB_DB     target database name (default: shotsense)

Usage:
  python scripts/smoke_mongodb.py
  make smoke
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPECTED_COLLECTIONS = ("shots", "players", "reports", "agent_memory")
EXPECTED_VECTOR_INDEX = "shot_summary_vector_index"


def _redact(uri: str) -> str:
    """Hide username:password from a Mongo URI for safe terminal printing."""
    if "://" not in uri:
        return "<unparseable URI>"
    scheme, rest = uri.split("://", 1)
    if "@" in rest:
        _creds, host = rest.split("@", 1)
        return f"{scheme}://<redacted>@{host.split('?')[0]}"
    return f"{scheme}://{rest.split('?')[0]}"


def _die(msg: str, hint: str = "") -> int:
    print(f"\n  X {msg}", file=sys.stderr)
    if hint:
        print(f"    {hint}", file=sys.stderr)
    return 2


def _ok(label: str, value: str = "") -> None:
    print(f"  + {label}{('  ' + value) if value else ''}")


def _warn(label: str, value: str = "") -> None:
    print(f"  ! {label}{('  ' + value) if value else ''}")


def _info(label: str, value: str = "") -> None:
    print(f"    {label}{('  ' + value) if value else ''}")


def main() -> int:
    # --- 1. Load .env ---
    try:
        from dotenv import load_dotenv
        load_dotenv(REPO_ROOT / ".env")
    except ImportError:
        return _die(
            "python-dotenv not installed.",
            "Run: pip install -r requirements-agent.txt",
        )

    uri = os.environ.get("MONGODB_URI", "").strip()
    db_name = os.environ.get("MONGODB_DB", "").strip() or "shotsense"

    print("\nShotSense Scout - MongoDB smoke test")
    print("=" * 50)

    if not uri:
        return _die(
            "MONGODB_URI is not set.",
            "Copy .env.example to .env and fill in your Atlas connection string.",
        )

    print(f"\n  URI:       {_redact(uri)}")
    print(f"  Database:  {db_name}")

    # --- 2. Driver + connect ---
    try:
        from pymongo import MongoClient
        from pymongo.errors import ServerSelectionTimeoutError, OperationFailure
    except ImportError:
        return _die(
            "pymongo not installed.",
            "Run: pip install -r requirements-agent.txt",
        )

    print()
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=10_000, appname="shotsense-smoke")
        client.admin.command("ping")
    except ServerSelectionTimeoutError as e:
        return _die(
            "Cannot reach Atlas (timeout).",
            f"Check the URI host, IP allowlist, and network. Details: {e}",
        )
    except OperationFailure as e:
        return _die(
            "Atlas auth failed.",
            f"Check the username/password in MONGODB_URI. Details: {e.details}",
        )
    except Exception as e:
        return _die(f"Unexpected error connecting to Atlas: {e}")

    _ok("Atlas ping OK")

    db = client[db_name]
    existing = set(db.list_collection_names())

    # --- 3. Collections + counts ---
    print("\nCollections:")
    for name in EXPECTED_COLLECTIONS:
        if name in existing:
            count = db[name].estimated_document_count()
            _ok(f"{name:<14}", f"{count:>7,} docs")
        else:
            _warn(f"{name:<14}", "MISSING (will be created on first write)")

    stray = sorted(c for c in existing if c not in EXPECTED_COLLECTIONS and not c.startswith("system."))
    if stray:
        print()
        _warn("unexpected collections:", ", ".join(stray))

    # --- 4. Sample shot fields ---
    print("\nSample shot:")
    if "shots" not in existing or db["shots"].estimated_document_count() == 0:
        _warn("shots collection is empty.", "Run: make import")
    else:
        sample = db["shots"].find_one({}, {"summary_embedding": 0})
        if sample:
            keys = sorted(k for k in sample.keys() if k != "_id")
            _info("fields:", ", ".join(keys))
            preview = (
                f"{sample.get('player', '?')} "
                f"({sample.get('team', '?')}) - "
                f"{sample.get('shot_distance', '?')}ft "
                f"{sample.get('action_type', '?')} - "
                f"made={sample.get('shot_made')} - "
                f"xfg={sample.get('xfg')}"
            )
            _info("preview:", preview)

    # --- 5. Vector Search index ---
    print("\nVector Search index:")
    if "shots" not in existing or db["shots"].estimated_document_count() == 0:
        _warn("N/A - shots empty.", "Import first, then create the index in Atlas UI.")
    else:
        index_status = _check_vector_index(db)
        if index_status == "PRESENT":
            _ok(f"{EXPECTED_VECTOR_INDEX}", "PRESENT")
        elif index_status == "MISSING":
            _warn(
                f"{EXPECTED_VECTOR_INDEX}",
                "MISSING - create in Atlas UI (768 dims, cosine).",
            )
        else:
            _info("unable to query search-index API:", index_status)

    # --- 6. Embedding coverage ---
    # Partial embeddings are acceptable for demo mode. The vectorSearchShots
    # tool transparently falls back to a structured MongoDB heuristic when
    # fewer than 100 shots are embedded, so the demo always renders a real
    # Mongo pipeline either way.
    MIN_VECTOR_THRESHOLD = 100
    print("\nEmbeddings:")
    if "shots" not in existing or db["shots"].estimated_document_count() == 0:
        _warn("N/A - shots empty.")
    else:
        total = db["shots"].estimated_document_count()
        embedded = db["shots"].count_documents({"summary_embedding": {"$exists": True}})
        pct = (embedded / total * 100) if total else 0.0
        label = f"{embedded:,} / {total:,} shots embedded"
        if embedded == 0:
            _warn(label, "demo will use HEURISTIC mode (no embeddings yet)")
        elif embedded < MIN_VECTOR_THRESHOLD:
            _warn(
                label,
                f"{pct:.1f}% - demo will use HEURISTIC mode (need >={MIN_VECTOR_THRESHOLD} for vector)",
            )
        elif embedded < total:
            _ok(
                label,
                f"{pct:.1f}% - PARTIAL vector mode active (demo works as-is)",
            )
        else:
            _ok(label, "(100%) - full vector mode")
        print()
        _info(
            "Demo modes:",
            "vector >= 100 embedded shots; heuristic < 100. Both render real Mongo pipelines.",
        )

    print()
    print("=" * 50)
    print("Done. Anything marked ! is action-required.")
    print()
    return 0


def _check_vector_index(db: Any) -> str:
    try:
        indexes = list(db["shots"].list_search_indexes())
    except Exception as e:
        return f"driver/tier limitation ({type(e).__name__})"
    names = [idx.get("name") for idx in indexes]
    return "PRESENT" if EXPECTED_VECTOR_INDEX in names else "MISSING"


if __name__ == "__main__":
    sys.exit(main())
