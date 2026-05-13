"""Smoke-test MongoDB Atlas connectivity and report collection state.

Run this BEFORE the heavy import to confirm:
  1. MONGODB_URI is set and reachable
  2. The target database is accessible
  3. All four expected collections exist (or will be created)
  4. Current document counts per collection
  5. Whether the Vector Search index exists yet

Env:
  MONGODB_URI (required)
  MONGODB_DB  (default: shotsense)

Usage:
  python scripts/check_atlas.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPECTED_COLLECTIONS = ("shots", "players", "reports", "agent_memory")
EXPECTED_VECTOR_INDEX = "shot_summary_vector_index"


def main() -> int:
    try:
        from dotenv import load_dotenv
        load_dotenv(REPO_ROOT / ".env")
    except ImportError:
        pass

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("FAIL: MONGODB_URI not set. See .env.example.", file=sys.stderr)
        return 2
    db_name = os.environ.get("MONGODB_DB", "shotsense")

    try:
        from pymongo import MongoClient
    except ImportError:
        print("FAIL: pymongo not installed. Run: pip install pymongo python-dotenv", file=sys.stderr)
        return 2

    print(f"URI:      {_redact(uri)}")
    print(f"Database: {db_name}")
    print()

    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=10_000)
        client.admin.command("ping")
    except Exception as e:
        print(f"FAIL: cannot reach Atlas: {e}", file=sys.stderr)
        return 1

    print("Atlas:    PING OK")
    db = client[db_name]
    existing = set(db.list_collection_names())

    print()
    print("Collections:")
    for name in EXPECTED_COLLECTIONS:
        if name in existing:
            count = db[name].estimated_document_count()
            print(f"  {name:<14} present | {count:>7,} docs")
        else:
            print(f"  {name:<14} MISSING (will be created on first write)")

    # Stray collections
    stray = sorted(c for c in existing if c not in EXPECTED_COLLECTIONS and not c.startswith("system."))
    if stray:
        print()
        print(f"  Stray collections (unexpected): {', '.join(stray)}")

    # Vector index status (only meaningful if shots has docs + an index has been created)
    print()
    print("Vector Search index:")
    if "shots" in existing and db["shots"].estimated_document_count() > 0:
        try:
            search_indexes = list(db["shots"].list_search_indexes())
            names = [idx.get("name") for idx in search_indexes]
            if EXPECTED_VECTOR_INDEX in names:
                idx = next(i for i in search_indexes if i.get("name") == EXPECTED_VECTOR_INDEX)
                status = idx.get("status") or idx.get("queryable", "unknown")
                print(f"  {EXPECTED_VECTOR_INDEX}: PRESENT (status={status})")
            elif names:
                print(f"  {EXPECTED_VECTOR_INDEX}: MISSING (found instead: {', '.join(names)})")
            else:
                print(f"  {EXPECTED_VECTOR_INDEX}: MISSING (no search indexes on shots)")
        except Exception as e:
            # Older Atlas / free tier may not support list_search_indexes via driver
            print(f"  unable to list (driver/tier limitation): {e}")
    else:
        print("  N/A — shots collection is empty. Run import_to_mongodb.py first.")

    # Sample embedded doc check
    if "shots" in existing and db["shots"].estimated_document_count() > 0:
        sample_total = db["shots"].estimated_document_count()
        sample_embedded = db["shots"].count_documents({"summary_embedding": {"$exists": True}}, limit=sample_total + 1)
        print()
        print(f"Embeddings:  {sample_embedded:,} / {sample_total:,} shots have summary_embedding")

    print()
    print("All systems checked. If anything says MISSING, follow the README setup.")
    return 0


def _redact(uri: str) -> str:
    # Hide credentials when echoing back to the terminal
    if "@" in uri and "://" in uri:
        scheme, rest = uri.split("://", 1)
        if "@" in rest:
            creds, host = rest.split("@", 1)
            return f"{scheme}://<redacted>@{host}"
    return uri


if __name__ == "__main__":
    sys.exit(main())
