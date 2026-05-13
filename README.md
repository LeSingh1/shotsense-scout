# ShotSense Scout

**An agent that searches, explains, compares, and saves NBA playoff shot
quality insights using MongoDB Atlas as its memory and semantic retrieval
layer.**

Hackathon track: **MongoDB**. Built with Gemini + Google Cloud Agent Builder
+ MongoDB Atlas (Vector Search + MCP Server).

License: **MIT** — see [LICENSE](./LICENSE).

---

## Demo

**Live demo:** _coming soon_ — replace with deployed Vercel URL.

**Demo video (≈3 min):** _coming soon_ — replace with YouTube link.

**Run it locally in replay mode** (no MongoDB, no agent credentials required —
the canned response ships with the repo so judges can see the full demo
without any setup):

```bash
cd frontend
npm install
npm run dev
```

Open: <http://localhost:3000/?replay=brunson-toughest>

The agent panel auto-populates immediately:
- The user prompt is pre-filled in the editorial display-input
- The agent answer is rendered in body type
- The actual MongoDB aggregation pipeline that ran is visible in mono
- 5 evidence shots (Brunson's toughest playoff threes by xFG)
- 3 similar shots from Atlas Vector Search (Curry, Edwards, SGA)
- The saved scouting report appears in the saved-reports list
- A `▶ replay · brunson-toughest` chip marks the page as a canned response

This replay path is the demo we record on. Live mode (no `?replay=`) calls
the real Mongo + Agent Builder stack.

---

## What it does

Type something like:

> *find Brunson's toughest made threes in the playoffs and save a scouting report*

The agent:

1. Calls a MongoDB aggregation pipeline that filters made 3-pt shots by player
   and sorts ascending by xFG (lowest xFG = hardest shot).
2. Returns the top 5 with the actual pipeline JSON shown to the user.
3. Generates a Gemini-written scouting report.
4. Inserts the report into the `reports` collection.
5. Surfaces 3 semantically similar shots via Atlas Vector Search over shot
   summary embeddings.

Everything is real: real shot data, real xFG model, real aggregations, real
embeddings, real Mongo writes. The frontend renders the executed query so
judges can verify the agent is acting on the database, not narrating.

---

## Architecture

```
┌───────────────────┐      ┌──────────────────────┐      ┌────────────────┐
│  Next.js (Vercel) │ ───▶ │  /api/agent  (BFF)   │ ───▶ │  Gemini agent  │
│  AgentPanel.tsx   │ ◀─── │  captures tool_calls │ ◀─── │  Agent Builder │
└───────────────────┘      └──────────────────────┘      └────────┬───────┘
                                                                  │
                                              tools call          ▼
                                          ┌──────────────────────────────┐
                                          │  MongoDB Atlas               │
                                          │  - shots, players, reports   │
                                          │  - vector index on summaries │
                                          └──────────────────────────────┘
```

The BFF route is the single integration point. It captures tool-call traces
from the agent response and forwards them to the frontend so the UI can render
the actual MongoDB pipeline that ran.

`frontend/lib/agent-tools.ts` is the single source of truth for the four
agent tools — `queryShots`, `runAggregation`, `vectorSearchShots`, and
`insertReport`. It exports both an OpenAPI schema for Agent Builder
registration and executable handlers for the BFF route. No drift possible.

The BFF supports `?replay=<session>` mode that returns a frozen response
captured from a previously executed live run, so a 3-minute demo video is
recordable without any live-API risk.

---

## MongoDB Atlas setup

The repo ships with `make` targets so the whole flow is five commands. The
order matters — don't skip the smoke test, it catches 95% of setup mistakes
before they cost you twenty minutes of import time.

### Atlas checklist (one-time, ~10 minutes)

1. **Create a free Atlas cluster.** Project name `ShotSense Scout`, M0 free
   shared cluster. Copy the connection string when prompted.
2. **Create database + collections** named exactly:
   ```
   Database:    shotsense
   Collections: shots, players, reports, agent_memory
   ```
   (You can skip this — the import will create them on first write.)
3. **Add a database user** with read+write on the `shotsense` DB. Whitelist
   your IP (or `0.0.0.0/0` for hackathon dev).
4. **Fill `.env`:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env`:
   ```
   MONGODB_URI=mongodb+srv://<user>:<pw>@<cluster>.mongodb.net/?retryWrites=true
   MONGODB_DB=shotsense
   GEMINI_API_KEY=<from https://aistudio.google.com/app/apikey>
   ```
5. **Create the Vector Search index** (Atlas UI → Atlas Search → Create
   Search Index → JSON Editor). Do this AFTER `make import` so the field
   exists:
   ```
   Index name:   shot_summary_vector_index
   Collection:   shotsense.shots
   Type:         Vector Search
   Field:        summary_embedding
   Dimensions:   768
   Similarity:   cosine
   ```
   The `vectorSearchShots` agent tool reads from this exact index name.

### Commands in order

```bash
make install          # 1. Python deps into .venv (one-time)
make smoke            # 2. Validate URI + auth + IP allowlist
make import           # 3. Insert 10,503 shots + 217 players into Atlas
make smoke            # 4. Confirm shots collection populated
# --- now create the Vector Search index in Atlas UI (step 5 above) ---
make embeddings       # 5. Generate Gemini embeddings (can stop early — see below)
make smoke            # 6. Confirm partial or full embedding coverage
make dev              # 7. Run Next.js dev server
make replay           # 8. Open the replay-mode demo URL
```

Every `make smoke` is read-only and safe to run as often as you want. Each
script also has friendly errors if `MONGODB_URI`, `MONGODB_DB`, or
`GEMINI_API_KEY` is missing — the message tells you exactly what to do next.

### Two embedding providers

`make embeddings` reads `EMBEDDING_PROVIDER` from `.env`:

| Provider | Pros | Cons |
|---|---|---|
| `gemini` (default) | Best embedding quality; no local resource use. | Free-tier quota (~100 RPM, daily token caps) often caps a full run partway through 10,503 shots. |
| `local_sentence_transformers` | No API quotas, no key, no internet after first download. Embeds all 10,503 shots in ~10-15 min on a modern CPU. | One-time ~420MB model download (`sentence-transformers/all-mpnet-base-v2`); larger `pip install` (torch). Different vector space from Gemini. |

Both produce 768-dim vectors so the same Atlas Vector Search index works.

**Switching providers requires a full re-embed** because the two vector
spaces don't align — mixing them silently breaks similarity search:

```bash
# Switch in .env first:
#   EMBEDDING_PROVIDER=local_sentence_transformers
#   EMBEDDING_OVERWRITE=true
make embeddings   # rebuilds all 10,503 from scratch with the local model
make smoke
# Then unset EMBEDDING_OVERWRITE=false so future runs only fill gaps.
```

The BFF route detects which provider produced the corpus (each shot is
tagged with `embedding_provider` at write time). If the corpus provider
doesn't match the runtime provider (currently always `gemini`), the agent
skips Vector Search and uses the structured Mongo heuristic. So:

| Corpus provider | Runtime | Similar-shot beat uses |
|---|---|---|
| `gemini` | `gemini` | Atlas Vector Search (real semantic similarity) |
| `local_sentence_transformers` | `gemini` | Heuristic only (real Mongo aggregation over distance / zone / xfg) |

Both render real, readable Mongo pipelines in the agent panel. To enable
true vector search with the local provider, the BFF would need a matching
local embedding service — out of scope for the hackathon.

### Partial embeddings are fine for the demo

Gemini free-tier quotas (100 RPM, daily token caps) often make embedding
all 10,503 shots impractical. The demo is designed to work with whatever
coverage you get:

| Embedded shots | Similar-shot beat |
|---|---|
| `0` to `99` | **Heuristic mode** — Mongo aggregation ranks candidates by `shot_distance`, `shot_zone`, `action_type`, `is_three_point`, and `xfg` similarity to the seed shot. No embeddings needed. Real pipeline JSON still renders. |
| `100` to `total-1` | **Partial vector mode** — Atlas Vector Search over whatever's been embedded. Candidate count auto-scales. |
| `total` | **Full vector mode** — vanilla Atlas Vector Search across the corpus. |

Both modes return real shots from real MongoDB aggregations, and the agent
panel renders the actual pipeline that ran. Stop `make embeddings` whenever
you hit a quota wall — the existing checkpoint resumes cleanly later, and
the demo works in the meantime.

The live prompt `find the toughest clutch makes and save a scouting report`
works against any of the three modes because the primary `runAggregation`
+ `insertReport` flow doesn't depend on embeddings at all.

---

## Agent Builder / MCP setup

_Placeholder — wiring up to live Gemini Agent Builder is the next milestone._

The integration seam is a single function:
[`callAgentBuilder()` in `frontend/app/api/agent/route.ts`](frontend/app/api/agent/route.ts).
Until `AGENT_BUILDER_ENDPOINT` is set in the environment, the BFF falls back
to a deterministic stub that produces a plausible tool-call plan for any
prompt mentioning a player and the word "tough/hard/difficult/clutch".

To go live:

1. Register the four tools from `toolsAsOpenAPI()` (in
   `frontend/lib/agent-tools.ts`) with your Agent Builder agent. The
   handlers in the same file are what the BFF executes on the agent's
   behalf — same parameters on both sides, so drift is impossible.
2. Decide MCP transport. Three options were spike'd in plan review:
   - **A** — Self-host the official MongoDB MCP Server on Cloud Run with
     HTTP transport. Cleanest "uses MCP server" story.
   - **B** — Thin FastAPI shim with OpenAPI tools (skips MCP protocol).
   - **C** — Atlas Data API directly (skips a server entirely).
   The right choice depends on the partner-track rules wording for
   MongoDB MCP Server compliance.
3. Set `AGENT_BUILDER_ENDPOINT` in `.env` to the resulting agent URL.

---

## Repo layout

```
nba_shot_quality/     XGBoost xFG model, features, evaluation
scripts/
  import_to_mongodb.py    one-shot import of shots → Atlas
  build_embeddings.py     batched Gemini embeddings → vectorSearch index
  export_for_frontend.py  static JSON for the existing dashboard
frontend/
  app/page.tsx                       Hero → AgentPanel → existing sections
  app/api/agent/route.ts             BFF (captures tool_calls, replay mode)
  components/AgentPanel.tsx          the agent UI section (locked design spec)
  lib/agent-tools.ts                 single source of truth for agent tools
  lib/replay-samples/                checked-in demo sessions for ?replay=
tests/                Python tests for the model + data layer
```

---

## Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4,
  Motion, Three Fiber for 3D shot replays, Zod for tool schemas.
- **Agent:** Google Cloud Agent Builder + Gemini.
- **Data layer:** MongoDB Atlas with Vector Search.
- **Embeddings:** Gemini `gemini-embedding-001` (768 dims, cosine, via `google-genai`).
- **Model:** XGBoost xFG model trained on playoff shot tracking data
  (pre-existing artifact from the `nba_shot_quality/` Python package).

---

## License

MIT — see [LICENSE](./LICENSE). Open source, hackathon-track compliant.
