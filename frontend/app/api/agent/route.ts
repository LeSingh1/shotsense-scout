/**
 * Agent BFF route.
 *
 * Locked in /plan-eng-review Issue 2A (trace surfacing) and 3A (replay mode).
 *
 * Request:  POST /api/agent { prompt: string }
 *           GET  /api/agent?replay=<session-id>   (replay mode)
 *
 * Response: {
 *   answer: string,
 *   tool_calls: Array<{ name, params, pipeline?, result_summary }>,
 *   evidence_shots: Shot[],
 *   similar_shots: Shot[] | null,
 *   saved_report_id: string | null,
 *   replay: boolean,
 *   replay_session?: string,
 * }
 *
 * The route captures tool-call records from the Agent Builder response and
 * forwards them to the frontend so AgentPanel can render the actual MongoDB
 * pipeline that ran. Replay mode short-circuits to a frozen JSON captured from
 * a live run, so the 3-minute demo recording can't be ruined by cold-start or
 * rate-limit blips.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { invokeTool, type ToolContext, type ToolName, type Shot } from "@/lib/agent-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolCallRecord = {
  name: ToolName;
  params: unknown;
  pipeline?: unknown;
  filter?: unknown;
  result_summary: string;
};

type AgentResponse = {
  /** The user's prompt. Optional on live responses; present on replay sessions
   * so the frontend can render the input pre-filled when judges land on the page. */
  prompt?: string;
  answer: string;
  tool_calls: ToolCallRecord[];
  evidence_shots: Shot[];
  similar_shots: Shot[] | null;
  saved_report_id: string | null;
  replay: boolean;
  replay_session?: string;
};

// ---------- Replay mode ------------------------------------------------------

const REPLAY_DIRS = [
  // Live-recorded sessions live here, gitignored.
  path.join(process.cwd(), "scripts", ".replay-sessions"),
  // Checked-in demo samples live here. Frontend ships with these.
  path.join(process.cwd(), "lib", "replay-samples"),
  // When dev server runs from frontend/, scripts/ is one level up.
  path.join(process.cwd(), "..", "scripts", ".replay-sessions"),
];

async function loadReplay(sessionId: string): Promise<AgentResponse | null> {
  for (const dir of REPLAY_DIRS) {
    const file = path.join(dir, `${sessionId}.json`);
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as AgentResponse;
      return { ...parsed, replay: true, replay_session: sessionId };
    } catch {
      // try the next directory
    }
  }
  return null;
}

// ---------- Live agent path --------------------------------------------------

async function buildToolContext(): Promise<ToolContext> {
  // MongoDB
  const { MongoClient } = await import("mongodb");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  const client = new MongoClient(uri);
  await client.connect();
  const dbName = process.env.MONGODB_DB ?? "nba_shot_quality";

  // Gemini embeddings — must use the same model + dims as the offline batch
  // script (gemini-embedding-001 at 768 dims) so the query vector lives in the
  // same space as the indexed shot embeddings.
  const embed = async (text: string): Promise<number[]> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: 768,
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini embed failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { embedding?: { values: number[] } };
    if (!data.embedding) throw new Error("Gemini embed returned no embedding");
    return data.embedding.values;
  };

  return {
    mongo: client as unknown as ToolContext["mongo"],
    embed,
    dbName,
  };
}

type AgentBuilderToolCall = { name: ToolName; arguments: unknown };

interface AgentBuilderResult {
  text: string;
  tool_calls: AgentBuilderToolCall[];
}

/**
 * Call Google Cloud Agent Builder. The exact transport depends on the partner-track
 * decision (1A/B/C from /plan-eng-review). This is the seam: swap the body of this
 * function once that decision lands and nothing else changes.
 */
async function callAgentBuilder(prompt: string): Promise<AgentBuilderResult> {
  const endpoint = process.env.AGENT_BUILDER_ENDPOINT;
  if (!endpoint) {
    // Until Agent Builder is wired, fall back to a deterministic stub so the
    // frontend can build against the contract. Remove once the live agent ships.
    return stubAgent(prompt);
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`Agent Builder ${res.status}: ${await res.text()}`);
  return (await res.json()) as AgentBuilderResult;
}

/**
 * Stub that returns a plausible tool-call plan for any prompt mentioning a player
 * and the word "tough/hard/difficult". Used only when AGENT_BUILDER_ENDPOINT is
 * unset (early dev). The frontend treats the stub response identically to live.
 */
function stubAgent(prompt: string): AgentBuilderResult {
  const lower = prompt.toLowerCase();
  const saveIntent = /\b(save|store|write|generate)\b.*\breport\b/.test(lower);
  const player =
    /\bbrunson\b/.test(lower) ? "Jalen Brunson" :
    /\bedwards\b/.test(lower) ? "Anthony Edwards" :
    /\bcurry\b/.test(lower) ? "Stephen Curry" :
    /\bdoncic\b|\bluka\b/.test(lower) ? "Luka Doncic" :
    /\bsga\b|\bgilgeous\b/.test(lower) ? "Shai Gilgeous-Alexander" :
    null;
  const isThree = /\bthrees?\b|\b3[- ]?pt\b|\bthree[- ]?point\b/.test(lower);
  const clutch = /\bclutch\b|\blate\b|\bfinal minute\b/.test(lower);

  const calls: AgentBuilderToolCall[] = [
    {
      name: "runAggregation",
      arguments: {
        player: player ?? undefined,
        is_three_point: isThree || undefined,
        shot_made: true,
        clutch_only: clutch || undefined,
        sort_by: "xfg_asc",
        limit: 5,
      },
    },
  ];
  if (saveIntent) {
    calls.push({
      name: "insertReport",
      arguments: {
        title: `${player ?? "Playoff"} · toughest makes`,
        player: player ?? undefined,
        body_markdown: "(stub) generated scouting report",
        evidence_shot_ids: [],
      },
    });
  }
  return {
    text: `${player ?? "These players"} produced ${
      saveIntent ? "the toughest makes in this run, saved as a report." : "these notable makes."
    }`,
    tool_calls: calls,
  };
}

// ---------- Tool execution loop ---------------------------------------------

async function executeToolCalls(
  agentResult: AgentBuilderResult,
  ctx: ToolContext,
): Promise<{
  records: ToolCallRecord[];
  evidence: Shot[];
  saved_report_id: string | null;
}> {
  const records: ToolCallRecord[] = [];
  let evidence: Shot[] = [];
  let saved_report_id: string | null = null;

  for (const call of agentResult.tool_calls) {
    // For insertReport, splice the evidence shot_ids in from what we already
    // collected so the agent doesn't have to thread them through itself.
    let params = call.arguments;
    if (call.name === "insertReport" && evidence.length > 0) {
      params = {
        ...(call.arguments as object),
        evidence_shot_ids: evidence.map((s) => s.shot_id),
      };
    }
    const result = (await invokeTool(call.name, params, ctx)) as Record<string, unknown>;
    const record: ToolCallRecord = {
      name: call.name,
      params,
      pipeline: result.pipeline,
      filter: result.filter,
      result_summary: summarizeResult(call.name, result),
    };
    records.push(record);
    if (call.name === "queryShots" || call.name === "runAggregation") {
      evidence = (result.shots as Shot[]) ?? [];
    }
    if (call.name === "insertReport") {
      saved_report_id = (result.report_id as string) ?? null;
    }
  }

  return { records, evidence, saved_report_id };
}

function summarizeResult(name: ToolName, result: Record<string, unknown>): string {
  if (name === "queryShots" || name === "runAggregation") {
    const n = Array.isArray(result.shots) ? result.shots.length : 0;
    return `${n} shot${n === 1 ? "" : "s"} returned`;
  }
  if (name === "vectorSearchShots") {
    const n = Array.isArray(result.shots) ? result.shots.length : 0;
    return `${n} similar shot${n === 1 ? "" : "s"} found`;
  }
  if (name === "insertReport") {
    return `report saved with id ${String(result.report_id)}`;
  }
  return "ok";
}

// ---------- Vector index health check (eng review critical gap) -------------

let vectorIndexHealthy: boolean | null = null;

async function ensureVectorIndexHealthy(ctx: ToolContext): Promise<boolean> {
  if (vectorIndexHealthy !== null) return vectorIndexHealthy;
  try {
    // Run a known-good probe. If it returns 0 results, the index is missing.
    const probe = (await invokeTool(
      "vectorSearchShots",
      { query_summary: "a contested jump shot from the perimeter", k: 1 },
      ctx,
    )) as { shots: Shot[] };
    vectorIndexHealthy = (probe.shots?.length ?? 0) > 0;
  } catch {
    vectorIndexHealthy = false;
  }
  if (!vectorIndexHealthy) {
    console.error(
      "VECTOR_INDEX_NOT_READY: Atlas Vector Search index 'shot_summary_vector_index' " +
        "returned 0 results on a known-good probe. Create the index or re-run build_embeddings.py.",
    );
  }
  return vectorIndexHealthy;
}

// ---------- Route handlers ---------------------------------------------------

export async function GET(req: NextRequest) {
  const replaySession = req.nextUrl.searchParams.get("replay");
  if (!replaySession) {
    return NextResponse.json(
      { error: "GET /api/agent requires a ?replay=<session> query parameter." },
      { status: 400 },
    );
  }
  const replayed = await loadReplay(replaySession);
  if (!replayed) {
    return NextResponse.json(
      { error: `No replay session '${replaySession}' found in scripts/.replay-sessions/` },
      { status: 404 },
    );
  }
  return NextResponse.json(replayed);
}

export async function POST(req: NextRequest) {
  const replaySession = req.nextUrl.searchParams.get("replay");
  if (replaySession) {
    const replayed = await loadReplay(replaySession);
    if (replayed) return NextResponse.json(replayed);
    // Fall through to live path on a missing replay file rather than 404 on POST.
  }

  let prompt = "";
  try {
    const body = (await req.json()) as { prompt?: string };
    prompt = (body.prompt ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  try {
    const ctx = await buildToolContext();
    const agentResult = await callAgentBuilder(prompt);
    const { records, evidence, saved_report_id } = await executeToolCalls(agentResult, ctx);

    // Optional similar-shot beat: if we have evidence and Vector Search is up,
    // surface 3 similar shots based on the toughest evidence shot's summary.
    let similar: Shot[] | null = null;
    if (evidence.length > 0 && (await ensureVectorIndexHealthy(ctx))) {
      try {
        const seed = evidence[0];
        const similarResult = (await invokeTool(
          "vectorSearchShots",
          { query_summary: seed.summary, exclude_shot_id: seed.shot_id, k: 3 },
          ctx,
        )) as { shots: Shot[]; pipeline: unknown };
        similar = similarResult.shots;
        records.push({
          name: "vectorSearchShots",
          params: { query_summary: seed.summary, exclude_shot_id: seed.shot_id, k: 3 },
          pipeline: similarResult.pipeline,
          result_summary: summarizeResult("vectorSearchShots", similarResult),
        });
      } catch (e) {
        console.warn("vectorSearchShots beat failed:", e);
      }
    }

    const response: AgentResponse = {
      answer: agentResult.text,
      tool_calls: records,
      evidence_shots: evidence,
      similar_shots: similar,
      saved_report_id,
      replay: false,
    };
    return NextResponse.json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/agent error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
