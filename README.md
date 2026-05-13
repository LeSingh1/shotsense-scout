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

1. **Create a free Atlas cluster.** Note the connection string.
2. **Create the database and collections:**

   ```
   Database: shotsense
   Collections:
     shots
     players
     reports
     agent_memory
   ```

3. **Create the Vector Search index** on `shots.summary_embedding`:

   ```
   Index name:   shot_summary_vector_index
   Collection:   shots
   Field:        summary_embedding
   Dimensions:   768
   Similarity:   cosine
   ```

   The `vectorSearchShots` agent tool reads from this exact index name.

4. **Fill `.env`:**

   ```bash
   cp .env.example .env
   ```

   Set:

   ```
   MONGODB_URI=<your atlas connection string>
   MONGODB_DB=shotsense
   GEMINI_API_KEY=<your Gemini API key>
   ```

5. **Import shots + players:**

   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -e .
   pip install pymongo google-generativeai
   python scripts/import_to_mongodb.py
   ```

   The import is idempotent (upserts on `shot_id`). It also creates the
   necessary indexes on `shots` (player + xfg, three-point hot path, game_id).

6. **Generate embeddings:**

   ```bash
   python scripts/build_embeddings.py
   ```

   Batched up to 100 summaries per Gemini request, exponential backoff on
   429/5xx, checkpoint file every 500 shots so re-runs resume from where
   they stopped.

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
- **Embeddings:** Gemini `text-embedding-004` (768 dims, cosine).
- **Model:** XGBoost xFG model trained on playoff shot tracking data
  (pre-existing artifact from the `nba_shot_quality/` Python package).

---

## License

MIT — see [LICENSE](./LICENSE). Open source, hackathon-track compliant.
