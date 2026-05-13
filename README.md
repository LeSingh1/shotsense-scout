# ShotSense Scout

A MongoDB-powered NBA playoff shot quality agent. Ask in plain English, the agent
runs real Atlas aggregations + vector search, generates scouting reports, and
saves them back to Mongo as agent memory.

Built for the Gemini + Google Cloud Agent Builder + MongoDB Atlas hackathon
partner track.

---

## What it does

Type a prompt like:

> *find Brunson's toughest made threes in the playoffs and save a scouting report*

The agent then:

1. Calls a MongoDB aggregation pipeline that filters made 3-pt shots by player,
   sorts ascending by xFG (lowest = hardest shot).
2. Returns the top 5 with the actual pipeline JSON visible in the UI.
3. Generates a Gemini-written scouting report.
4. Inserts the report into the `reports` collection.
5. Surfaces 3 semantically similar shots via Atlas Vector Search over shot
   summary embeddings.

Everything is real: real shot data, real xFG model, real aggregations, real
embeddings, real Mongo writes. The frontend renders the executed query so
judges can see it's not narrative theater.

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

The BFF route is the single integration point. It captures tool-call traces from
the agent response and forwards them to the frontend so the UI can render the
actual MongoDB pipeline that ran.

The `tools/agent-tools.ts` file is the single source of truth for both
Agent Builder tool registration (exported as OpenAPI JSON) and the BFF route
handlers. No drift possible.

The BFF supports `?replay=<session>` mode that returns a frozen response from
a previously captured live run, so the 3-minute demo video is recordable
without any live-API flakiness.

---

## Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4,
  Motion, Three Fiber for 3D shot replay, Zod for tool schemas.
- **Agent:** Google Cloud Agent Builder + Gemini.
- **Data layer:** MongoDB Atlas with Vector Search.
- **Embeddings:** Gemini `text-embedding-004`.
- **Model layer:** XGBoost xFG model trained on playoff shot tracking data
  (pre-existing artifact from the `nba_shot_quality/` Python package).

---

## Repo layout

```
nba_shot_quality/     XGBoost xFG model, features, evaluation
scripts/              Data import, embedding generation, pipeline runners
  import_to_mongodb.py    one-shot import of shots → Atlas
  build_embeddings.py     batched Gemini embeddings → vectorSearch index
frontend/
  app/api/agent/        BFF route (captures tool_calls, replay mode)
  components/AgentPanel.tsx   the agent UI section
  lib/agent-tools.ts    single source of truth for agent tools
tests/                Python tests for the model + data layer
```

---

## Quickstart

### 1. Provision

- MongoDB Atlas free cluster. Note the connection string.
- Create database `nba_shot_quality` with collections: `shots`, `players`,
  `reports`, `agent_memory`.
- Atlas Vector Search index on `shots.summary_embedding` (768 dimensions,
  cosine similarity).
- Google Cloud project with Agent Builder enabled. Gemini API key.

### 2. Local setup

```bash
cp .env.example .env
# Fill in MONGODB_URI, GEMINI_API_KEY, AGENT_BUILDER_ENDPOINT

# Python side
python -m venv .venv && source .venv/bin/activate
pip install -e .
python scripts/import_to_mongodb.py
python scripts/build_embeddings.py

# Frontend side
cd frontend
npm install
npm run dev  # http://localhost:3000
```

### 3. Try it

Open `http://localhost:3000`, scroll to section `02 / Ask the Scout`, type a
prompt. The agent panel will show the answer, the actual MongoDB pipeline that
ran, evidence shots, and a save-report button.

For demo recording with the canned response:
`http://localhost:3000?replay=brunson-toughest`

---

## License

MIT. See `LICENSE`.
