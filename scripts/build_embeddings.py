"""Batched embeddings for the shots.summary field.

Two providers (select with EMBEDDING_PROVIDER):

  gemini (default)
    Calls the Gemini Developer API (gemini-embedding-001, 768 dims). Subject
    to free-tier quotas (~100 RPM, daily token caps). Best embedding quality.

  local_sentence_transformers
    Runs sentence-transformers/all-mpnet-base-v2 locally on CPU/GPU. 768 dims,
    matches the Atlas Vector Search index. No external API, no quotas, no key.
    Slower per call but no rate-limit pauses; ~10-15 min for 10,503 shots on
    a modern laptop CPU.

Important: the BFF route embeds queries at runtime. Both sides MUST use the
same provider or the vector spaces don't align. Each shot's embedding gets
tagged with `embedding_provider` so the BFF can detect a mismatch and fall
back to the structured heuristic.

Common operations:
  - Skip shots that already have summary_embedding (default).
  - Batch summaries per request and checkpoint progress every N shots.
  - On Gemini 429: parse retry hint, sleep, retry. On persistent quota
    exhaustion, save checkpoint and exit cleanly so a rerun resumes.

After this completes, create the Atlas Vector Search index on
`summary_embedding` (768 dimensions, cosine similarity) named
`shot_summary_vector_index`.

Env:
  MONGODB_URI                   Atlas connection string (required)
  MONGODB_DB                    target database (default: shotsense)
  EMBEDDING_PROVIDER            'gemini' or 'local_sentence_transformers'
  GEMINI_API_KEY                required when provider=gemini
  EMBEDDING_BATCH_SIZE          shots per request (default: 50)
  EMBEDDING_CHECKPOINT_EVERY    flush every N shots (default: 500)
  EMBEDDING_SLEEP_SECONDS       Gemini: pause between batches (default: 90)
  EMBEDDING_429_SLEEP_SECONDS   Gemini: fallback 429 sleep (default: 70)
  EMBEDDING_OVERWRITE           if 'true', re-embed ALL shots even if they
                                already have summary_embedding. Use this when
                                switching providers — mixing two providers in
                                the same vector index silently breaks search.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
import sys
import time
from pathlib import Path
from typing import Iterable

logger = logging.getLogger("build_embeddings")

CHECKPOINT_PATH = Path(__file__).resolve().parent / ".embedding-checkpoint.json"
EMBEDDING_DIMS = 768  # must match Atlas Vector Search index

# --- Provider configuration -------------------------------------------------
PROVIDER_GEMINI = "gemini"
PROVIDER_LOCAL = "local_sentence_transformers"
VALID_PROVIDERS = (PROVIDER_GEMINI, PROVIDER_LOCAL)

# Gemini
GEMINI_MODEL = "gemini-embedding-001"
# Local sentence-transformers
LOCAL_MODEL = "sentence-transformers/all-mpnet-base-v2"  # 768 dims native

# --- Retry / pacing ---------------------------------------------------------
MAX_RETRIES = 8
BASE_BACKOFF_S = 1.0
BACKOFF_CAP_S = 32.0
# Free-tier Gemini quota = 100 embed RPM. 50/batch + 90s pacing gives margin.
DEFAULT_BATCH_SIZE = 50
DEFAULT_INTER_BATCH_SLEEP_S = 90
DEFAULT_429_SLEEP_S = 70
# Local provider has no rate limit; bigger batches + no pacing are fine.
LOCAL_DEFAULT_BATCH_SIZE = 128
LOCAL_DEFAULT_SLEEP_S = 0


class QuotaExhausted(RuntimeError):
    """Raised when 429s persist past MAX_RETRIES. Caller should checkpoint
    and exit cleanly so the user can resume after the quota window resets."""


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


def _get_gemini_client(api_key: str):
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


def _get_local_model():
    """Load sentence-transformers/all-mpnet-base-v2 once. Returns the model."""
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as e:
        raise RuntimeError(
            "sentence-transformers not installed. Run: "
            "pip install -r requirements-agent.txt"
        ) from e
    logger.info("Loading local model %s (first run downloads ~420MB)", LOCAL_MODEL)
    return SentenceTransformer(LOCAL_MODEL)


def _embed_batch_local(summaries: list[str], model) -> list[list[float]]:
    """Run sentence-transformers locally. No rate limit, deterministic."""
    import numpy as np  # noqa: E402 — only imported when local provider runs

    # encode returns a numpy array of shape (batch, 768)
    arr = model.encode(
        summaries,
        batch_size=min(64, len(summaries)),
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True,  # cosine-friendly
    )
    if arr.shape[1] != EMBEDDING_DIMS:
        raise RuntimeError(
            f"Unexpected local embedding dimension: {arr.shape[1]} (want {EMBEDDING_DIMS})"
        )
    return [list(map(float, v)) for v in arr]


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


def _is_rate_limit(exc: Exception) -> bool:
    """Detect a quota / 429 exhaustion from the google-genai error surface."""
    msg = str(exc)
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "rate limit" in msg.lower():
        return True
    code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if code == 429:
        return True
    return False


def _parse_retry_delay_seconds(exc: Exception) -> float | None:
    """Try to pull a retry-delay hint out of a google-genai error.

    Gemini returns details like:
      {"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"42s"}
    embedded in the error message. Pull the first such value if present.
    """
    msg = str(exc)
    match = re.search(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"', msg)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def _embed_batch_gemini(summaries: list[str], client, default_429_sleep_s: float) -> list[list[float]]:
    """Call Gemini batch embedding via google-genai. One vector per input.

    On 429 RESOURCE_EXHAUSTED: parse the server-suggested retry delay if
    present, otherwise sleep `default_429_sleep_s`, then retry. Other
    transient errors get capped exponential backoff. Persistent failure
    raises so the caller can checkpoint progress and exit cleanly.
    """
    from google.genai import types

    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.embed_content(
                model=GEMINI_MODEL,
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
            if _is_rate_limit(e):
                if is_last:
                    # Stop instead of looping forever. Caller handles the
                    # clean-exit + rerun-instruction path.
                    raise QuotaExhausted(str(e)) from e
                hint = _parse_retry_delay_seconds(e)
                # +5s buffer over the server-suggested retry delay to make
                # sure we're past the quota window before the next call.
                sleep_s = (hint + 5.0) if hint is not None else default_429_sleep_s
                logger.warning(
                    "Quota hit (429). Sleeping %.1fs%s before retry (attempt %d/%d).",
                    sleep_s,
                    " per server retry hint + 5s buffer" if hint is not None else "",
                    attempt + 1,
                    MAX_RETRIES,
                )
                time.sleep(sleep_s)
                continue
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
    provider = (
        os.environ.get("EMBEDDING_PROVIDER", "").strip().lower() or PROVIDER_GEMINI
    )
    overwrite = os.environ.get("EMBEDDING_OVERWRITE", "").strip().lower() in (
        "1", "true", "yes",
    )
    if provider not in VALID_PROVIDERS:
        print(
            f"\n  X EMBEDDING_PROVIDER='{provider}' is not recognized.\n"
            f"    Valid: {', '.join(VALID_PROVIDERS)}\n",
            file=sys.stderr,
        )
        return 2

    if not uri:
        print(
            "\n  X MONGODB_URI is not set.\n"
            "    1. Copy .env.example to .env\n"
            "    2. Fill in your Atlas connection string\n"
            "    3. Re-run: make embeddings\n",
            file=sys.stderr,
        )
        return 2

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if provider == PROVIDER_GEMINI and not api_key:
        print(
            "\n  X GEMINI_API_KEY is not set (required for provider=gemini).\n"
            "    Get one at https://aistudio.google.com/app/apikey\n"
            "    Then add it to .env: GEMINI_API_KEY=...\n"
            "    Or switch to local: EMBEDDING_PROVIDER=local_sentence_transformers\n",
            file=sys.stderr,
        )
        return 2

    db_name = os.environ.get("MONGODB_DB", "").strip() or "shotsense"
    # Local provider runs on the same machine — no rate limit, bigger batches.
    if provider == PROVIDER_LOCAL:
        default_batch = LOCAL_DEFAULT_BATCH_SIZE
        default_sleep = LOCAL_DEFAULT_SLEEP_S
    else:
        default_batch = DEFAULT_BATCH_SIZE
        default_sleep = DEFAULT_INTER_BATCH_SLEEP_S
    batch_size = int(os.environ.get("EMBEDDING_BATCH_SIZE", default_batch))
    checkpoint_every = int(os.environ.get("EMBEDDING_CHECKPOINT_EVERY", 500))
    inter_batch_sleep_s = float(
        os.environ.get("EMBEDDING_SLEEP_SECONDS", default_sleep)
    )
    fallback_429_sleep_s = float(
        os.environ.get("EMBEDDING_429_SLEEP_SECONDS", DEFAULT_429_SLEEP_S)
    )

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

    # Build the embedding backend once per run.
    gemini_client = None
    local_model = None
    if provider == PROVIDER_GEMINI:
        try:
            gemini_client = _get_gemini_client(api_key)
        except RuntimeError as e:
            print(f"\n  X {e}\n", file=sys.stderr)
            return 2
    else:  # PROVIDER_LOCAL
        try:
            local_model = _get_local_model()
        except RuntimeError as e:
            print(f"\n  X {e}\n", file=sys.stderr)
            return 2

    logger.info("Provider: %s", provider)
    if overwrite:
        logger.warning(
            "EMBEDDING_OVERWRITE=true — recomputing every shot's summary_embedding."
        )

    # When overwriting, clear the checkpoint so we walk the whole corpus again.
    done = set() if (args.force or overwrite) else _read_checkpoint()
    if done:
        logger.info("Resuming. %d shots already done per checkpoint.", len(done))

    # Pull shots that need an embedding
    needs_filter: dict = {"_id": {"$nin": list(done)}} if done else {}
    if not (args.force or overwrite):
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

    total_to_do = len(todo)
    completed = 0
    embedded_since_checkpoint = 0
    batches = list(_chunks(todo, batch_size))
    if inter_batch_sleep_s > 0:
        logger.info(
            "Pacing: sleeping %.0fs between batches (~%d batches, ~%.1f min)",
            inter_batch_sleep_s,
            len(batches),
            (len(batches) * inter_batch_sleep_s) / 60.0,
        )
    else:
        logger.info("No inter-batch pacing (provider has no rate limit).")

    for batch_idx, batch in enumerate(batches):
        summaries = [d["summary"] for d in batch]
        try:
            if provider == PROVIDER_GEMINI:
                vectors = _embed_batch_gemini(summaries, gemini_client, fallback_429_sleep_s)
            else:
                vectors = _embed_batch_local(summaries, local_model)
        except KeyboardInterrupt:
            logger.warning("Interrupted. Flushing checkpoint with %d shots done.", len(done))
            _write_checkpoint(done)
            return 130
        except QuotaExhausted as e:
            # Quota truly depleted past our retry budget. Don't crash — save
            # progress, print where we are, and tell the user how to resume.
            _write_checkpoint(done)
            try:
                embedded_now = coll.count_documents({"summary_embedding": {"$exists": True}})
                remaining = coll.count_documents({"summary_embedding": {"$exists": False}})
            except Exception:
                embedded_now = len(done)
                remaining = total_to_do - completed
            print()
            print("=" * 60)
            print("  ! Gemini quota exhausted. Stopping cleanly.")
            print("=" * 60)
            print(f"  Embedded this run:  {completed:,} shots")
            print(f"  Total in Atlas:     {embedded_now:,} shots have summary_embedding")
            print(f"  Still to embed:     {remaining:,} shots")
            print(f"  Last error:         {e}")
            print()
            print("  Free-tier quota is 100 embed RPM. The window typically")
            print("  resets after about a minute. Wait ~2 minutes, then resume:")
            print()
            print("    make embeddings    # picks up where this left off")
            print()
            print("  Or, if this keeps happening, slow it down further:")
            print("    EMBEDDING_BATCH_SIZE=25 EMBEDDING_SLEEP_SECONDS=120 make embeddings")
            print("=" * 60)
            return 0
        except Exception as e:
            logger.error("Batch %d failed: %s", batch_idx, e)
            logger.warning("Flushing checkpoint (%d done) and exiting. Re-run to resume.", len(done))
            _write_checkpoint(done)
            return 1

        ops = [
            UpdateOne(
                {"_id": d["_id"]},
                {
                    "$set": {
                        "summary_embedding": v,
                        "embedding_provider": provider,
                        "embedding_model": (
                            GEMINI_MODEL if provider == PROVIDER_GEMINI else LOCAL_MODEL
                        ),
                    }
                },
            )
            for d, v in zip(batch, vectors)
        ]
        coll.bulk_write(ops, ordered=False)
        for d in batch:
            done.add(d["_id"])
        completed += len(batch)
        embedded_since_checkpoint += len(batch)
        logger.info(
            "Batch %d/%d: embedded %d (this run: %d / %d, %.1f%%)",
            batch_idx + 1,
            len(batches),
            len(batch),
            completed,
            total_to_do,
            completed * 100.0 / total_to_do,
        )
        if embedded_since_checkpoint >= checkpoint_every:
            _write_checkpoint(done)
            embedded_since_checkpoint = 0
            logger.info("Checkpoint flushed (%d done overall).", len(done))

        # Stay under free-tier RPM quota. Skip the sleep after the last batch.
        is_last_batch = batch_idx == len(batches) - 1
        if inter_batch_sleep_s > 0 and not is_last_batch:
            logger.info("Sleeping %.0fs to stay under embedding RPM quota...", inter_batch_sleep_s)
            try:
                time.sleep(inter_batch_sleep_s)
            except KeyboardInterrupt:
                logger.warning("Interrupted during quota sleep. Checkpoint already saved.")
                _write_checkpoint(done)
                return 130

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
