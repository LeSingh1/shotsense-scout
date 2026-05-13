/**
 * Single source of truth for ShotSense Scout agent tools.
 *
 * Each tool definition carries:
 *   - Zod schema for parameter validation
 *   - JSON Schema export for Agent Builder tool registration
 *   - Executable handler used by the BFF route
 *
 * The Agent Builder agent and the BFF route both read this file. There is no
 * way for them to drift: if a tool's params change here, both sides update.
 *
 * Locked in /plan-eng-review Issue 4A.
 */

import { z } from "zod";

// ---------- Shot document shape (mirrors scripts/import_to_mongodb.py) -------

export const ShotSchema = z.object({
  shot_id: z.string(),
  game_id: z.string(),
  player_id: z.number().int(),
  player: z.string(),
  team: z.string(),
  loc_x: z.number().int(),
  loc_y: z.number().int(),
  shot_distance: z.number().int(),
  shot_zone: z.string(),
  action_type: z.string(),
  shot_type: z.string(),
  shot_made: z.boolean(),
  is_three_point: z.boolean(),
  xfg: z.number(),
  fg_over_expected: z.number(),
  summary: z.string(),
  // Clock fields — present in imported docs, omitted by replay samples.
  period: z.number().int().optional(),
  minutes_left_in_period: z.number().int().optional(),
  seconds_left_in_period: z.number().int().optional(),
});
export type Shot = z.infer<typeof ShotSchema>;

// ---------- Tool definitions -------------------------------------------------

const queryShotsParams = z.object({
  player: z.string().optional().describe("Exact player full name, e.g. 'Jalen Brunson'"),
  is_three_point: z.boolean().optional(),
  shot_made: z.boolean().optional(),
  period_min: z.number().int().min(1).max(5).optional(),
  shot_zone: z.string().optional().describe("e.g. 'Above the Break 3'"),
  limit: z.number().int().min(1).max(50).default(10),
});

const runAggregationParams = z.object({
  player: z.string().optional(),
  is_three_point: z.boolean().optional(),
  shot_made: z.boolean().optional(),
  clutch_only: z.boolean().optional().describe(
    "If true, restrict to period >= 4 with <= 120 seconds left."
  ),
  sort_by: z.enum(["xfg_asc", "xfg_desc", "fg_over_expected_desc"]).default("xfg_asc"),
  limit: z.number().int().min(1).max(50).default(5),
});

const vectorSearchShotsParams = z.object({
  query_summary: z.string().describe(
    "Natural-language description of a shot. Embedded and compared against shot summary vectors."
  ),
  exclude_shot_id: z.string().optional().describe(
    "Shot id to exclude from results (used to avoid self-matches)."
  ),
  k: z.number().int().min(1).max(10).default(3),
});

const insertReportParams = z.object({
  title: z.string().describe("Short headline, e.g. 'Brunson · toughest playoff threes'"),
  player: z.string().optional(),
  body_markdown: z.string().describe("The scouting report body."),
  evidence_shot_ids: z.array(z.string()).describe(
    "Shot ids the report draws on. Used to render evidence cards."
  ),
  pipeline_used: z.unknown().optional().describe(
    "The MongoDB aggregation pipeline that produced the evidence. Stored for traceability."
  ),
});

// ---------- Registry --------------------------------------------------------

export type ToolName =
  | "queryShots"
  | "runAggregation"
  | "vectorSearchShots"
  | "insertReport";

export interface ToolDefinition<P extends z.ZodTypeAny, R> {
  name: ToolName;
  description: string;
  parameters: P;
  /** Pure JSON Schema for Agent Builder registration. */
  jsonSchema: object;
  /** Executable handler called by the BFF route after the agent invokes the tool. */
  handler: (
    params: z.infer<P>,
    ctx: ToolContext,
  ) => Promise<R>;
}

export interface ToolContext {
  /** MongoDB driver-like client. Production: `mongodb` package's `MongoClient`. */
  mongo: {
    db: (name: string) => {
      collection: (name: string) => {
        find: (filter: unknown, options?: unknown) => {
          toArray: () => Promise<unknown[]>;
        };
        findOne: (filter: unknown, options?: unknown) => Promise<unknown>;
        aggregate: (pipeline: unknown[]) => { toArray: () => Promise<unknown[]> };
        insertOne: (doc: unknown) => Promise<{ insertedId: unknown }>;
        countDocuments: (filter: unknown, options?: unknown) => Promise<number>;
      };
    };
  };
  /** Async function producing a 768-dim embedding for the given text. */
  embed: (text: string) => Promise<number[]>;
  /** Database name. */
  dbName: string;
}

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): object {
  // Lightweight, dependency-free conversion. Sufficient for Agent Builder.
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, sub] of Object.entries(shape)) {
    const description =
      "description" in sub._def ? (sub._def as { description?: string }).description : undefined;
    const type = inferJsonType(sub);
    properties[key] = description ? { ...type, description } : type;
    if (!sub.isOptional()) required.push(key);
  }
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function inferJsonType(node: z.ZodTypeAny): { type: string; enum?: unknown[]; items?: unknown } {
  const def = node._def;
  // Unwrap optional / default
  if (def.typeName === "ZodOptional" || def.typeName === "ZodDefault") {
    return inferJsonType(def.innerType);
  }
  if (def.typeName === "ZodString") return { type: "string" };
  if (def.typeName === "ZodNumber") return { type: "number" };
  if (def.typeName === "ZodBoolean") return { type: "boolean" };
  if (def.typeName === "ZodArray") {
    return { type: "array", items: inferJsonType(def.type) };
  }
  if (def.typeName === "ZodEnum") return { type: "string", enum: def.values };
  if (def.typeName === "ZodUnknown") return { type: "object" };
  return { type: "string" };
}

// ---------- Handlers --------------------------------------------------------

const queryShotsHandler: ToolDefinition<typeof queryShotsParams, { shots: Shot[]; filter: object }>["handler"] =
  async (params, ctx) => {
    const filter: Record<string, unknown> = {};
    if (params.player) filter.player = params.player;
    if (params.is_three_point !== undefined) filter.is_three_point = params.is_three_point;
    if (params.shot_made !== undefined) filter.shot_made = params.shot_made;
    if (params.period_min) filter.period = { $gte: params.period_min };
    if (params.shot_zone) filter.shot_zone = params.shot_zone;
    const cursor = ctx.mongo.db(ctx.dbName).collection("shots").find(filter, { limit: params.limit });
    const rows = await cursor.toArray();
    return { shots: rows as Shot[], filter };
  };

const runAggregationHandler: ToolDefinition<typeof runAggregationParams, { shots: Shot[]; pipeline: unknown[] }>["handler"] =
  async (params, ctx) => {
    const match: Record<string, unknown> = {};
    if (params.player) match.player = params.player;
    if (params.is_three_point !== undefined) match.is_three_point = params.is_three_point;
    if (params.shot_made !== undefined) match.shot_made = params.shot_made;
    if (params.clutch_only) {
      match.period = { $gte: 4 };
      match.seconds_left_in_period = { $lte: 120 };
    }
    const sortMap: Record<string, Record<string, 1 | -1>> = {
      xfg_asc: { xfg: 1 },
      xfg_desc: { xfg: -1 },
      fg_over_expected_desc: { fg_over_expected: -1 },
    };
    const pipeline = [
      { $match: match },
      { $sort: sortMap[params.sort_by] },
      { $limit: params.limit },
    ];
    const rows = await ctx.mongo.db(ctx.dbName).collection("shots").aggregate(pipeline).toArray();
    return { shots: rows as Shot[], pipeline };
  };

/** Below this embedded-shot count, vector search is replaced by a structured
 * MongoDB heuristic ranking. The hackathon flow runs entirely off the agent
 * being able to surface similar shots; we'd rather show a real Mongo pipeline
 * the user can read than show an empty result because embeddings aren't done. */
const MIN_EMBEDDED_FOR_VECTOR = 100;

type VectorSearchResult = {
  shots: Shot[];
  pipeline: unknown[];
  mode: "vector" | "heuristic";
  embedded_count: number;
};

const vectorSearchShotsHandler: ToolDefinition<
  typeof vectorSearchShotsParams,
  VectorSearchResult
>["handler"] = async (params, ctx) => {
  const shotsColl = ctx.mongo.db(ctx.dbName).collection("shots");

  // Count how many docs actually carry an embedding. If too few, vector search
  // will either fail or return nothing useful — go straight to heuristic.
  const embedded_count = await shotsColl.countDocuments(
    { summary_embedding: { $exists: true } },
    {},
  );

  if (embedded_count >= MIN_EMBEDDED_FOR_VECTOR) {
    try {
      const queryVector = await ctx.embed(params.query_summary);
      // The vector index only includes docs where summary_embedding is set, so
      // the $exists filter is implicit. We still scope the candidate count
      // proportionally to what's actually embedded so smaller corpora don't
      // over-spend on numCandidates.
      const numCandidates = Math.min(200, Math.max(20, embedded_count));
      const pipeline: unknown[] = [
        {
          $vectorSearch: {
            index: "shot_summary_vector_index",
            path: "summary_embedding",
            queryVector,
            numCandidates,
            limit: params.k + (params.exclude_shot_id ? 1 : 0),
          },
        },
      ];
      if (params.exclude_shot_id) {
        pipeline.push({ $match: { shot_id: { $ne: params.exclude_shot_id } } });
        pipeline.push({ $limit: params.k });
      }
      const rows = (await shotsColl.aggregate(pipeline).toArray()) as Shot[];
      // Vector path counts as successful only if it returns the full k. With
      // partial embedding coverage, $vectorSearch may return 0-1 results that
      // happened to land in the embedded subset; the structured heuristic
      // searches the FULL corpus and is the more relevant fallback.
      if (rows.length >= params.k) {
        const safePipeline: unknown[] = JSON.parse(JSON.stringify(pipeline));
        // @ts-expect-error mutating display copy
        safePipeline[0].$vectorSearch.queryVector = `<768-dim embedding of: "${params.query_summary}">`;
        return { shots: rows, pipeline: safePipeline, mode: "vector", embedded_count };
      }
      console.log(
        `vectorSearchShots: vector returned ${rows.length} of ${params.k} requested; falling back to heuristic over full corpus.`,
      );
      // Fall through to heuristic.
    } catch (err) {
      console.warn(
        "vectorSearchShots: vector path failed, falling back to heuristic:",
        err,
      );
    }
  }

  return await heuristicSimilarShots(params, ctx, embedded_count);
};

/** Structured MongoDB similarity ranking that doesn't need any embeddings.
 *
 * Looks up the seed shot by exclude_shot_id and ranks remaining shots by a
 * weighted distance over the fields the user explicitly cares about:
 * shot_distance, shot_zone, action_type, is_three_point, xfg. The pipeline
 * is a real aggregation the agent panel can render so judges still see
 * meaningful Mongo work.
 *
 * Filter is relaxed progressively if a strict match returns too few rows. */
async function heuristicSimilarShots(
  params: z.infer<typeof vectorSearchShotsParams>,
  ctx: ToolContext,
  embedded_count: number,
): Promise<VectorSearchResult> {
  const shotsColl = ctx.mongo.db(ctx.dbName).collection("shots");

  // Look up the seed shot if we have an exclude_shot_id (which IS the seed
  // in the BFF's calling pattern). If we don't, we can't run a meaningful
  // heuristic — return empty with the embedded_count so the caller knows.
  let seed: Shot | null = null;
  if (params.exclude_shot_id) {
    seed = (await shotsColl.findOne({ shot_id: params.exclude_shot_id })) as Shot | null;
  }
  if (!seed) {
    return { shots: [], pipeline: [], mode: "heuristic", embedded_count };
  }

  // Progressive filter relaxation: strictest first, broaden until we have k.
  const baseFilter: Record<string, unknown> = {
    shot_id: { $ne: seed.shot_id },
    is_three_point: seed.is_three_point ?? false,
  };
  const filterTiers: Array<Record<string, unknown>> = [
    { ...baseFilter, shot_zone: seed.shot_zone, action_type: seed.action_type },
    { ...baseFilter, shot_zone: seed.shot_zone },
    { ...baseFilter },
    { shot_id: { $ne: seed.shot_id } },
  ];

  const seedDist = seed.shot_distance ?? 0;
  const seedXfg = seed.xfg ?? 0;

  let chosenFilter: Record<string, unknown> = filterTiers[0];
  let rows: Shot[] = [];
  let pipeline: unknown[] = [];

  for (const f of filterTiers) {
    pipeline = [
      { $match: f },
      {
        $addFields: {
          _similarity: {
            $add: [
              { $abs: { $subtract: ["$shot_distance", seedDist] } },
              { $multiply: [{ $abs: { $subtract: ["$xfg", seedXfg] } }, 100] },
            ],
          },
        },
      },
      { $sort: { _similarity: 1 } },
      { $limit: params.k },
      { $project: { _similarity: 0 } },
    ];
    rows = (await shotsColl.aggregate(pipeline).toArray()) as Shot[];
    chosenFilter = f;
    if (rows.length >= params.k) break;
  }

  // Echo back the pipeline that actually ran, with a comment block at the
  // top describing the seed so the judge-facing JSON tells the whole story.
  const annotated: unknown[] = [
    {
      $comment: `heuristic similar-shot ranking (embeddings: ${embedded_count} docs, threshold ${MIN_EMBEDDED_FOR_VECTOR})`,
    },
    ...pipeline,
  ];
  void chosenFilter; // surfaced via the $match in the pipeline already
  return { shots: rows, pipeline: annotated, mode: "heuristic", embedded_count };
}

const insertReportHandler: ToolDefinition<typeof insertReportParams, { report_id: string }>["handler"] =
  async (params, ctx) => {
    const doc = {
      title: params.title,
      player: params.player ?? null,
      body_markdown: params.body_markdown,
      evidence_shot_ids: params.evidence_shot_ids,
      pipeline_used: params.pipeline_used ?? null,
      created_at: new Date(),
    };
    const result = await ctx.mongo.db(ctx.dbName).collection("reports").insertOne(doc);
    return { report_id: String(result.insertedId) };
  };

// ---------- Exported registry -----------------------------------------------

export const tools = {
  queryShots: {
    name: "queryShots",
    description:
      "Find shots matching simple equality filters. Use for direct lookups like 'all of player X's makes'. For sorted-by-difficulty or clutch queries, use runAggregation.",
    parameters: queryShotsParams,
    jsonSchema: zodToJsonSchema(queryShotsParams),
    handler: queryShotsHandler,
  } as ToolDefinition<typeof queryShotsParams, { shots: Shot[]; filter: object }>,

  runAggregation: {
    name: "runAggregation",
    description:
      "Run a parameterized MongoDB aggregation pipeline. Best tool for ranking shots by difficulty (xfg ascending), clutch-time filters, and over-expected leaders. Always prefer this for any 'find the toughest / hardest / most impressive' question.",
    parameters: runAggregationParams,
    jsonSchema: zodToJsonSchema(runAggregationParams),
    handler: runAggregationHandler,
  } as ToolDefinition<typeof runAggregationParams, { shots: Shot[]; pipeline: unknown[] }>,

  vectorSearchShots: {
    name: "vectorSearchShots",
    description:
      "Find shots similar to a natural-language description. Uses Atlas Vector Search when enough shots are embedded; transparently falls back to a structured MongoDB heuristic (shot_distance + shot_zone + action_type + is_three_point + xfg) when embeddings are partial. Use after surfacing a notable shot to show related plays.",
    parameters: vectorSearchShotsParams,
    jsonSchema: zodToJsonSchema(vectorSearchShotsParams),
    handler: vectorSearchShotsHandler,
  } as ToolDefinition<typeof vectorSearchShotsParams, VectorSearchResult>,

  insertReport: {
    name: "insertReport",
    description:
      "Persist a scouting report to MongoDB. Call this ONLY when the user explicitly asks to save, store, or write a report. Do NOT call for plain look-up requests.",
    parameters: insertReportParams,
    jsonSchema: zodToJsonSchema(insertReportParams),
    handler: insertReportHandler,
  } as ToolDefinition<typeof insertReportParams, { report_id: string }>,
} as const;

/** Export ready to register with Google Cloud Agent Builder. */
export function toolsAsOpenAPI(): Array<{ name: string; description: string; parameters: object }> {
  return Object.values(tools).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.jsonSchema,
  }));
}

/** Execute a tool by name with raw (unvalidated) params from the agent. */
export async function invokeTool(
  name: ToolName,
  rawParams: unknown,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = tools[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  const parsed = tool.parameters.parse(rawParams);
  // @ts-expect-error tool handler signature is correlated with parameters at the type level
  return tool.handler(parsed, ctx);
}
