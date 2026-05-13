"""Batched Gemini embeddings for the shots.summary field.

Strategy (locked in /plan-eng-review Issue 5A):
  - Batch up to EMBEDDING_BATCH_SIZE summaries per Gemini request.
  - Exponential backoff on 429 / 5xx.
  - Checkpoint progress every EMBEDDING_CHECKPOINT_EVERY shots so re-runs resume.
  - Skip shots that already have an up-to-date summary_embedding.

After this completes, create the Atlas Vector Search index on the field
`summary_embedding` (768 dimensions, cosine similarity) named
`shot_summary_vector_index`. The agent's vectorSearchShots tool reads from
that exact index name.

Env:
  MONGODB_URI                   Atlas connection string (required)
  MONGODB_DB                    target database (default: nba_shot_quality)
  GEMINI_API_KEY                Gemini API key (required)
  EMBEDDING_BATCH_SIZE          shots per request (default: 100)
  EMBEDDING_CHECKPOINT_EVERY    flush + log every N shots (default: 500)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
import time
from pathlib import Path
from typing import Iterable

logger = logging.getLogger("build_embeddings")

CHECKPOINT_PATH = Path(__file__).resolve().parent / ".embedding-checkpoint.json"
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMS = 768  # must match Atlas Vector Search index
MAX_RETRIES = 6
BASE_BACKOFF_S = 1.0
BACKOFF_CAP_S = 32.0


def _read_checkpoint() -> set[str]:
    if not CHECKPOINT_PATH.exists():
        return set()
    try:
        data = json.loads(CHECKPOINT_PATH.read_text())
        return set(data.get("done", []))
    except Exception:
        logger.warning("Checkpoint file unreadable, starting fresh")
        return set()


def _write_checkpoint(done: set[str]) -> None:
    CHECKPOINT_PATH.write_text(json.dumps({"done": sorted(done)}))


def _chunks(seq: list, size: int) -> Iterable[list]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def _get_genai_client(api_key: str):
    """Build a google-genai client pinned to the Gemini Developer API.

    google-genai supports two backends: the Gemini Developer API (API-key auth)
    and Vertex AI (project/location + ADC). If GOOGLE_GENAI_USE_VERTEXAI is set
    in the env, the client silently routes to Vertex AI and an API-key call
    fails with 401 from aiplatform.googleapis.com. For this hackathon we want
    the Developer API, so pop that flag before constructing the client.
    """
    os.environ.pop("GOOGLE_GENAI_USE_VERTEXAI", None)
    try:
        from google import genai
    except ImportError as e:
        raise RuntimeError(
            "google-genai not installed. Run: pip install -r requirements-agent.txt"
        ) from e
    return genai.Client(api_key=api_key)


def _vector_from_embedding(emb) -> list[float]:
    """Extract the float list from a google-genai ContentEmbedding object.

    The SDK returns objects with a `.values` attribute (list of floats). Older
    response shapes used dicts with a 'values' key. Handle both defensively.
    """
    if hasattr(emb, "values"):
        return list(emb.values)
    if isinstance(emb, dict) and "values" in emb:
        return list(emb["values"])
    if isinstance(emb, (list, tuple)):
        return list(emb)
    raise RuntimeError(f"Cannot extract vector from embedding object: {type(emb).__name__}")


def _embed_batch(summaries: list[str], client) -> list[list[float]]:
    """Call Gemini batch embedding via google-genai. One vector per input.

    Retries with exponential backoff on transient errors. Raises on persistent
    failure so the caller can decide whether to checkpoint and exit.
    """
    from google.genai import types

    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=summaries,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=EMBEDDING_DIMS,
                ),
            )
            embeddings = getattr(response, "embeddings", None)
            if embeddings is None and isinstance(response, dict):
                embeddings = response.get("embeddings")
            if not embeddings or len(embeddings) != len(summaries):
                raise RuntimeError(
                    f"Embedding count mismatch: requested {len(summaries)}, got "
                    f"{0 if not embeddings else len(embeddings)}"
                )
            vectors = [_vector_from_embedding(e) for e in embeddings]
            if len(vectors[0]) != EMBEDDING_DIMS:
                raise RuntimeError(
                    f"Unexpected embedding dimension: {len(vectors[0])} (want {EMBEDDING_DIMS})"
                )
            return vectors
        except Exception as e:  # broad: covers transport, rate-limit, transient 5xx
            is_last = attempt == MAX_RETRIES - 1
            if is_last:
                logger.error("Gemini embed failed after %d retries: %s", MAX_RETRIES, e)
                raise
            sleep_s = min(BACKOFF_CAP_S, BASE_BACKOFF_S * (2**attempt)) + random.uniform(0, 0.5)
            logger.warning(
                "Gemini embed attempt %d failed (%s). Sleeping %.1fs before retry.",
                attempt + 1,
                e,
                sleep_s,
            )
            time.sleep(sleep_s)
    raise RuntimeError("unreachable")  # for type checkers


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit", type=int, default=None, help="Cap on shots to embed (smoke test)."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-embed shots that already have summary_embedding (ignores checkpoint).",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
    )

    # Load .env BEFORE the required-var check so .env actually works.
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    except ImportError:
        print(
            "\n  X python-dotenv not installed.\n"
            "    Run: pip install -r requirements-agent.txt\n",
            file=sys.stderr,
        )
        return 2

    uri = os.environ.get("MONGODB_URI", "").strip()
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not uri:
        print(
            "\n  X MONGODB_URI is not set.\n"
            "    1. Copy .env.example to .env\n"
            "    2. Fill in your Atlas connection string\n"
            "    3. Re-run: make embeddings\n",
            file=sys.stderr,
        )
        return 2
    if not api_key:
        print(
            "\n  X GEMINI_API_KEY is not set.\n"
            "    Get one at https://aistudio.google.com/app/apikey\n"
            "    Then add it to .env: GEMINI_API_KEY=...\n",
            file=sys.stderr,
        )
        return 2
    db_name = os.environ.get("MONGODB_DB", "").strip() or "shotsense"
    batch_size = int(os.environ.get("EMBEDDING_BATCH_SIZE", 100))
    checkpoint_every = int(os.environ.get("EMBEDDING_CHECKPOINT_EVERY", 500))

    try:
        from pymongo import MongoClient, UpdateOne
    except ImportError:
        print(
            "\n  X pymongo not installed.\n"
            "    Run: pip install -r requirements-agent.txt\n",
            file=sys.stderr,
        )
        return 2

    client = MongoClient(uri, serverSelectionTimeoutMS=15_000, appname="shotsense-embed")
    client.admin.command("ping")
    coll = client[db_name]["shots"]

    # Build the Gemini client once per run, not per batch.
    try:
        genai_client = _get_genai_client(api_key)
    except RuntimeError as e:
        print(f"\n  X {e}\n", file=sys.stderr)
        return 2

    done = set() if args.force else _read_checkpoint()
    if done:
        logger.info("Resuming. %d shots already done per checkpoint.", len(done))

    # Pull shots that need an embedding
    needs_filter: dict = {"_id": {"$nin": list(done)}} if done else {}
    if not args.force:
        # also skip shots that have an embedding already (post-hoc safety net)
        needs_filter["summary_embedding"] = {"$exists": False}

    projection = {"_id": 1, "summary": 1}
    cursor = coll.find(needs_filter, projection=projection)
    if args.limit:
        cursor = cursor.limit(args.limit)
    todo = list(cursor)
    logger.info("Embedding %d shots in batches of %d", len(todo), batch_size)

    if not todo:
        logger.info("Nothing to do. Vector index step is next.")
        return 0

    embedded_since_checkpoint = 0
    for batch in _chunks(todo, batch_size):
        summaries = [d["summary"] for d in batch]
        vectors = _embed_batch(summaries, genai_client)
        ops = [
            UpdateOne({"_id": d["_id"]}, {"$set": {"summary_embedding": v}})
            for d, v in zip(batch, vectors)
        ]
        coll.bulk_write(ops, ordered=False)
        for d in batch:
            done.add(d["_id"])
        embedded_since_checkpoint += len(batch)
        logger.info(
            "Embedded batch of %d (running total: %d / %d)",
            len(batch),
            len(done),
            len(todo) + (len(done) - len(batch)),
        )
        if embedded_since_checkpoint >= checkpoint_every:
            _write_checkpoint(done)
            embedded_since_checkpoint = 0
            logger.info("Checkpoint flushed (%d done).", len(done))

    _write_checkpoint(done)
    logger.info("All embeddings complete. %d shots embedded.", len(done))

    logger.info(
        "Next step: create an Atlas Vector Search index on field 'summary_embedding' "
        "named 'shot_summary_vector_index' (%d dims, cosine similarity).",
        EMBEDDING_DIMS,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
