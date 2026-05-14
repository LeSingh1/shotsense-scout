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
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import {
  invokeTool,
  toolsAsOpenAPI,
  type ToolContext,
  type ToolName,
  type Shot,
} from "@/lib/agent-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- Env loading -----------------------------------------------------
// Next.js auto-loads .env from the project root (here: frontend/). The repo
// convention puts .env at the workspace root one level up so the same file
// serves both Python scripts and this Node BFF. Load it explicitly on cold
// start so MONGODB_URI / GEMINI_API_KEY / AGENT_BUILDER_ENDPOINT are always
// available regardless of where next dev was invoked from.
(function loadParentEnv() {
  if (process.env.MONGODB_URI) return;
  const candidates = [
    path.join(process.cwd(), "..", ".env"),  // dev: cd frontend && npm run dev
    path.join(process.cwd(), ".env"),         // also try cwd
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const dotenv = require("dotenv") as { config: (o: { path: string }) => void };
      dotenv.config({ path: file });
      if (process.env.MONGODB_URI) {
        console.log(`[shotsense] loaded env from ${file}`);
        return;
      }
    } catch {
      // dotenv not installed — fall back to a tiny manual parse
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require("node:fs") as { readFileSync: (p: string, e: string) => string };
        const content = fs.readFileSync(file, "utf8");
        for (const line of content.split("\n")) {
          const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
          if (!m) continue;
          const key = m[1];
          if (process.env[key]) continue;
          process.env[key] = m[2].replace(/^["']|["']$/g, "");
        }
        if (process.env.MONGODB_URI) {
          console.log(`[shotsense] loaded env from ${file} (manual parse)`);
          return;
        }
      } catch { /* keep going */ }
    }
  }
})();

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
  if (endpoint) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error(`Agent Builder ${res.status}: ${await res.text()}`);
    return (await res.json()) as AgentBuilderResult;
  }
  // Until Agent Builder is wired, use Gemini function-calling directly with the
  // same tool schemas. Falls back to the heuristic stub on any error so a missing
  // key or quota wall still leaves the demo working.
  if (process.env.GEMINI_API_KEY) {
    try {
      return await callGeminiAgent(prompt);
    } catch (e) {
      console.warn(
        "[shotsense] Gemini agent failed, using heuristic stub:",
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  return stubAgent(prompt);
}

// Free-tier quotas (per project per model):
//   gemini-2.5-flash       5 RPM   (thinking tokens eat output budget)
//   gemini-2.5-flash-lite  15 RPM  (no thinking, faster, cheaper)
//   gemini-2.0-flash       15 RPM
// flash-lite gives 3x headroom and ~half the latency for our 2-call flow.
const GEMINI_MODEL = process.env.GEMINI_AGENT_MODEL ?? "gemini-2.5-flash-lite";

const SYSTEM_INSTRUCTION = `You are ShotSense Scout, an NBA playoff shot-quality scout backed by a MongoDB Atlas corpus of 2025-26 NBA playoff shots with an xFG (expected field-goal %) value on every shot. Lower xFG = harder shot.

Translate the user's question into a sequence of tool calls. Rules:

1. For ranking shots by difficulty (toughest/hardest/most-impressive makes, biggest over-expected, clutch shots) call runAggregation with sort_by="xfg_asc". For most-open or easiest-shot questions use sort_by="xfg_desc". For biggest-over-expected use sort_by="fg_over_expected_desc".
2. For direct lookups like "all of Curry's threes" call queryShots with the appropriate equality filters.
3. Use exact full player names as they appear on NBA rosters (e.g. "Jalen Brunson", "Shai Gilgeous-Alexander", "Anthony Edwards").
4. Set is_three_point=true ONLY when the user explicitly says "three", "3-pt", "3pt", "three-point", or "from beyond the arc".
5. Set shot_made=true unless the user explicitly asks for misses.
6. Set clutch_only=true if the user says "clutch", "late", "final minutes", "down the stretch", "Q4 with under 2".
7. Call insertReport ONLY when the user explicitly says "save", "store", "write", "generate", or "create" a report.
8. Always include limit (default 5 if not specified, max 10).
9. Do NOT call vectorSearchShots — the backend triggers that automatically as a similar-shots beat after your main query.

Reply with tool calls only. After the tools run, you will be given the results and asked to write a 1-2 sentence answer.`;

async function callGeminiAgent(prompt: string): Promise<AgentBuilderResult> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const tools = [
    {
      functionDeclarations: toolsAsOpenAPI()
        .filter((t) => t.name !== "vectorSearchShots")
        .map((t) => ({
          name: t.name,
          description: t.description,
          parameters: sanitizeSchemaForGemini(t.parameters as Record<string, unknown>),
        })),
    },
  ];

  const planRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        tools,
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
      }),
    },
  );
  if (!planRes.ok) {
    throw new Error(`Gemini plan failed: ${planRes.status} ${await planRes.text()}`);
  }
  const planData = (await planRes.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ functionCall?: { name: string; args?: unknown } }> };
    }>;
  };
  const parts = planData.candidates?.[0]?.content?.parts ?? [];
  const calls: AgentBuilderToolCall[] = parts
    .filter((p) => p.functionCall)
    .map((p) => ({
      name: p.functionCall!.name as ToolName,
      arguments: p.functionCall!.args ?? {},
    }));
  if (calls.length === 0) {
    throw new Error("Gemini returned no tool calls");
  }
  // Catch save intent that flash-lite sometimes drops when it's already
  // committed to a single data call. The intent is unambiguous from the prompt;
  // we shouldn't lose it to model variance.
  const wantsSave = /\b(save|store|write|generate|create)\b[^.?!]*\breport\b/i.test(prompt);
  const alreadySaving = calls.some((c) => c.name === "insertReport");
  if (wantsSave && !alreadySaving) {
    calls.push({
      name: "insertReport",
      arguments: {
        title: extractReportTitle(prompt),
        body_markdown: "Auto-generated scouting report from the user query.",
        evidence_shot_ids: [],
      },
    });
  }
  // Answer text is generated post-execution by `geminiSummarize` (called from the
  // POST handler once the tools have actually run). For now stamp a placeholder.
  return { text: "", tool_calls: calls };
}

function extractReportTitle(prompt: string): string {
  const lower = prompt.toLowerCase();
  const player = STUB_PLAYERS.find(([rx]) => rx.test(lower))?.[1];
  const kind = /\bmisses?\b/.test(lower)
    ? "toughest misses"
    : /\bclutch\b/.test(lower)
      ? "clutch shots"
      : /\bthrees?\b|\b3pt\b/.test(lower)
        ? "toughest threes"
        : "scouting notes";
  return player ? `${player} · ${kind}` : `Playoff · ${kind}`;
}

/**
 * Strip JSON-Schema keywords Gemini's function-calling endpoint rejects.
 * Keeps the shape recursive-safe and conservative — defaults / $schema / $ref
 * removed; "format" kept (Gemini accepts a subset); union types unwrapped to
 * their first concrete type.
 */
function sanitizeSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "$schema" || k === "$ref" || k === "default" || k === "additionalProperties") continue;
    if (k === "type" && Array.isArray(v)) {
      out.type = (v.find((t) => t !== "null") ?? v[0]) as string;
      continue;
    }
    if (k === "properties" && v && typeof v === "object") {
      const props: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        props[pk] = sanitizeSchemaForGemini(pv as Record<string, unknown>);
      }
      out.properties = props;
      continue;
    }
    if (k === "items" && v && typeof v === "object") {
      out.items = sanitizeSchemaForGemini(v as Record<string, unknown>);
      continue;
    }
    out[k] = v;
  }
  return out;
}

/** Second Gemini round-trip: read the actual tool results and write the answer. */
async function geminiSummarize(
  prompt: string,
  records: ToolCallRecord[],
  evidence: Shot[],
  saved_report_id: string | null,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  // Compact the results so we don't blow context — top 5 shots, just the fields
  // the model needs to write a one-liner.
  const compactShots = evidence.slice(0, 5).map((s) => ({
    player: s.player,
    team: s.team,
    distance_ft: s.shot_distance,
    zone: s.shot_zone,
    action: s.action_type,
    made: s.shot_made,
    xfg_pct: Math.round(s.xfg * 100),
    fg_over_expected_pp: Math.round(s.fg_over_expected * 100),
  }));
  const toolSummary = records.map((r) => ({
    name: r.name,
    params: r.params,
    result: r.result_summary,
  }));
  const userText = `Original question:
"${prompt}"

Tool results from MongoDB (Atlas xFG model, 2025-26 playoffs):
${JSON.stringify(toolSummary)}

Top evidence shots (already shown to the user as cards):
${JSON.stringify(compactShots)}

Write a single 1-2 sentence answer for the user. Lead with the most striking finding (player, the lowest xFG, the shot type). Don't repeat the cards verbatim. Don't speculate beyond the data. ${
    saved_report_id
      ? "End the answer with: 'Saved as a scouting report.'"
      : "Do NOT mention saving a report — none was saved on this query."
  }`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    console.warn("[shotsense] Gemini summarize failed:", e);
    return null;
  }
}

/**
 * Heuristic stub fallback. Only fires when Gemini is unreachable AND no
 * AGENT_BUILDER_ENDPOINT is set. Best-effort: parses a few keywords so the demo
 * stays alive offline, even if the wording is generic.
 */
const STUB_PLAYERS: Array<[RegExp, string]> = [
  [/\bjalen\s+brunson\b|\bbrunson\b/, "Jalen Brunson"],
  [/\banthony\s+edwards\b|\bedwards\b/, "Anthony Edwards"],
  [/\bstephen\s+curry\b|\bsteph\b|\bcurry\b/, "Stephen Curry"],
  [/\bluka\s+doncic\b|\bdoncic\b|\bluka\b/, "Luka Doncic"],
  [/\bshai\s+gilgeous|\bsga\b|\bgilgeous-?alexander\b/, "Shai Gilgeous-Alexander"],
  [/\blebron(\s+james)?\b/, "LeBron James"],
  [/\bjayson\s+tatum\b|\btatum\b/, "Jayson Tatum"],
  [/\bjaylen\s+brown\b/, "Jaylen Brown"],
  [/\bnikola\s+jokic\b|\bjokic\b/, "Nikola Jokic"],
  [/\bjamal\s+murray\b|\bmurray\b/, "Jamal Murray"],
  [/\bdamian\s+lillard\b|\bdame\b|\blillard\b/, "Damian Lillard"],
  [/\bgiannis(\s+antetokounmpo)?\b|\bantetokounmpo\b/, "Giannis Antetokounmpo"],
  [/\bkevin\s+durant\b|\bdurant\b|\bkd\b/, "Kevin Durant"],
  [/\bdevin\s+booker\b|\bbooker\b/, "Devin Booker"],
  [/\bdonovan\s+mitchell\b|\bmitchell\b/, "Donovan Mitchell"],
  [/\btyrese\s+haliburton\b|\bhaliburton\b/, "Tyrese Haliburton"],
  [/\bpaolo\s+banchero\b|\bbanchero\b/, "Paolo Banchero"],
  [/\bcade\s+cunningham\b|\bcunningham\b/, "Cade Cunningham"],
  [/\bvictor\s+wembanyama\b|\bwembanyama\b|\bwemby\b/, "Victor Wembanyama"],
  [/\bbuddy\s+hield\b|\bhield\b/, "Buddy Hield"],
];

function stubAgent(prompt: string): AgentBuilderResult {
  const lower = prompt.toLowerCase();
  const saveIntent = /\b(save|store|write|generate|create)\b.*\breport\b/.test(lower);
  const player = STUB_PLAYERS.find(([rx]) => rx.test(lower))?.[1] ?? null;
  const isThree = /\bthrees?\b|\b3[- ]?pt\b|\bthree[- ]?point\b|\barc\b|\bdeep\b/.test(lower);
  const clutch = /\bclutch\b|\blate\b|\bfinal minute|\bdown the stretch\b|\bfourth quarter\b|\bq4\b/.test(
    lower,
  );
  const wantsMiss = /\bmiss(ed|es)?\b|\bbrick(s|ed)?\b/.test(lower);
  const wantsOverExpected = /\bover[\s-]?expected\b|\bbiggest surprise|\bclutch makes\b/.test(lower);
  const easiest = /\beasiest\b|\bmost open\b|\bopen look\b/.test(lower);
  const limitMatch = lower.match(/\btop\s+(\d{1,2})\b|\b(\d{1,2})\s+(?:shots|makes|threes|misses)\b/);
  const limit = limitMatch ? Math.min(10, Math.max(1, Number(limitMatch[1] ?? limitMatch[2]))) : 5;

  const sort_by = wantsOverExpected
    ? "fg_over_expected_desc"
    : easiest
      ? "xfg_desc"
      : "xfg_asc";

  const calls: AgentBuilderToolCall[] = [
    {
      name: "runAggregation",
      arguments: {
        player: player ?? undefined,
        is_three_point: isThree || undefined,
        shot_made: !wantsMiss,
        clutch_only: clutch || undefined,
        sort_by,
        limit,
      },
    },
  ];
  if (saveIntent) {
    calls.push({
      name: "insertReport",
      arguments: {
        title: `${player ?? "Playoff"} · ${wantsMiss ? "toughest misses" : "toughest makes"}`,
        player: player ?? undefined,
        body_markdown: "(stub) generated scouting report",
        evidence_shot_ids: [],
      },
    });
  }
  const subject = player ?? "Top playoff scorers";
  const kind = wantsMiss
    ? "biggest misses"
    : wantsOverExpected
      ? "biggest over-expected shots"
      : easiest
        ? "most-open looks"
        : isThree
          ? "toughest threes"
          : "toughest shots";
  return {
    text: `${subject}: ${kind}${clutch ? " in clutch time" : ""}${saveIntent ? " — saved as a scouting report." : "."}`,
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
    // Skip saving a report when there's no evidence — an empty scouting card
    // is worse than no card at all.
    if (call.name === "insertReport" && evidence.length === 0) {
      continue;
    }
    // For insertReport, splice the evidence shot_ids in from what we already
    // collected so the agent doesn't have to thread them through itself.
    let params = call.arguments;
    if (call.name === "insertReport" && evidence.length > 0) {
      params = {
        ...(call.arguments as object),
        evidence_shot_ids: evidence.map((s) => s.shot_id),
      };
    }
    const result = (await invokeTool(call.name, coerceArgs(params), ctx)) as Record<string, unknown>;
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

/**
 * Gemini occasionally returns boolean/number arguments as strings (e.g. "true",
 * "5") even when the schema declares the correct type. Coerce them here so the
 * downstream zod schemas accept the call.
 */
function coerceArgs(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(coerceArgs);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = coerceArgs(v);
    }
    return out;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (trimmed === "null") return null;
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
    if (/^-?\d*\.\d+$/.test(trimmed)) return Number(trimmed);
  }
  return value;
}

/**
 * Last-resort answer builder: pure read of the top evidence shot. Used only
 * when no LLM is reachable. Honest, mechanical, no narrative.
 */
function synthesizeFallbackAnswer(evidence: Shot[], saved_report_id: string | null): string {
  if (evidence.length === 0) return "No shots matched that filter.";
  const top = evidence[0];
  const xfgPct = Math.round(top.xfg * 100);
  const parts = [
    `${top.player} (${top.team})`,
    `${top.shot_distance}ft ${top.action_type}`,
    `xFG ${xfgPct}%`,
    top.shot_made ? "made" : "missed",
  ];
  const tail = saved_report_id ? " — saved as a scouting report." : ".";
  return `${parts.join(" · ")}. ${evidence.length} shot${evidence.length === 1 ? "" : "s"} returned${tail}`;
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

// ---------- Route handlers ---------------------------------------------------
// (vector-search health: handled inside the vectorSearchShots tool itself,
//  which transparently falls back to a structured Mongo heuristic when fewer
//  than 100 shots are embedded. The BFF just always tries the beat.)

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

    // Similar-shot beat: vector search if enough shots are embedded,
    // otherwise a structured Mongo heuristic. Either way the agent panel
    // gets a real pipeline to render and judges see meaningful Mongo work.
    let similar: Shot[] | null = null;
    if (evidence.length > 0) {
      try {
        const seed = evidence[0];
        const similarResult = (await invokeTool(
          "vectorSearchShots",
          { query_summary: seed.summary, exclude_shot_id: seed.shot_id, k: 3 },
          ctx,
        )) as { shots: Shot[]; pipeline: unknown; mode?: string; embedded_count?: number };
        similar = similarResult.shots;
        if (similarResult.mode === "heuristic") {
          console.log(
            `vectorSearchShots: heuristic mode (only ${similarResult.embedded_count} shots embedded)`,
          );
        }
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

    // Final natural-language answer. Prefer a Gemini summary that reads the
    // ACTUAL tool results; if that fails (no key / quota / network), fall back
    // to either the planning-phase text (when the live agent provided one) or
    // a mechanical one-liner derived from the top evidence shot.
    let answer = await geminiSummarize(prompt, records, evidence, saved_report_id);
    if (!answer) {
      answer = agentResult.text || synthesizeFallbackAnswer(evidence, saved_report_id);
    }

    const response: AgentResponse = {
      answer,
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
