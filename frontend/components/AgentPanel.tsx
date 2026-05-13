"use client";

/**
 * AgentPanel — section 02 / Ask the Scout.
 *
 * Warm court theme (cream / walnut / burnt orange) scoped to this section via
 * inline CSS variables. Backend wiring is unchanged; only visual layer rebuilt:
 *   - Hero answer card with 4-step agent timeline
 *   - Rich evidence shot cards (player, team, distance, zone, xFG, made/miss)
 *   - Compact "Query used" card with expandable JSON
 *   - Similar shots with one-line reasons
 *   - Saved scouting report as an artifact card
 *   - All 7 interaction states preserved (idle/typing/loading/success/empty/error/replay)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";

type Shot = {
  shot_id: string;
  player: string;
  team: string;
  shot_distance: number;
  shot_zone: string;
  action_type: string;
  shot_made: boolean;
  xfg: number;
  fg_over_expected: number;
  summary: string;
  period?: number;
  minutes_left_in_period?: number;
  seconds_left_in_period?: number;
};

type ToolCallRecord = {
  name: "queryShots" | "runAggregation" | "vectorSearchShots" | "insertReport";
  params: Record<string, unknown>;
  pipeline?: unknown;
  filter?: unknown;
  result_summary: string;
};

type AgentResponse = {
  prompt?: string;
  answer: string;
  tool_calls: ToolCallRecord[];
  evidence_shots: Shot[];
  similar_shots: Shot[] | null;
  saved_report_id: string | null;
  replay: boolean;
  replay_session?: string;
};

type UiState =
  | { kind: "idle" }
  | { kind: "typing"; prompt: string }
  | { kind: "loading"; prompt: string }
  | { kind: "success"; prompt: string; data: AgentResponse; justSavedId: string | null }
  | { kind: "empty"; prompt: string; data: AgentResponse }
  | { kind: "error"; prompt: string; message: string };

type SavedReport = {
  id: string;
  title: string;
  player?: string;
  body?: string;
  saved_at: string;
};

const PLACEHOLDER = "find the toughest playoff threes...";
const HINT = "try: find Brunson's toughest makes in the playoffs";

const courtTheme: CSSProperties & Record<string, string> = {
  // Scoped dark palette that matches the rest of the site (Nike-pink #FF2D6F brand).
  ["--court-paper" as string]: "#0a0a0a",
  ["--court-paper-2" as string]: "#111111",
  ["--court-paper-3" as string]: "#181818",
  ["--court-ink" as string]: "#fafafa",
  ["--court-walnut" as string]: "#2a2a2a",
  ["--court-walnut-2" as string]: "#3a3a3a",
  ["--court-burnt" as string]: "#FF2D6F",
  ["--court-burnt-2" as string]: "#ff5a8a",
  ["--court-muted" as string]: "#a1a1a1",
  ["--court-good" as string]: "#9fff6b",
  ["--court-bad" as string]: "#ff6b6b",
  ["--court-mono-bg" as string]: "#070707",
  ["--court-mono-text" as string]: "#e5e5e5",
  background: "#0a0a0a",
  color: "#fafafa",
};

export function AgentPanel() {
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<UiState>({ kind: "idle" });
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [replaySession, setReplaySession] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const r = url.searchParams.get("replay");
    if (!r) {
      const timer = setTimeout(() => setShowHint(true), 200);
      return () => clearTimeout(timer);
    }
    setReplaySession(r);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agent?replay=${encodeURIComponent(r)}`, { method: "GET" });
        if (!res.ok) throw new Error(`replay load failed: ${res.status}`);
        const data = (await res.json()) as AgentResponse;
        if (cancelled) return;
        const promptText = data.prompt ?? "";
        if (inputRef.current && promptText) {
          inputRef.current.value = promptText;
        }
        const kind: UiState["kind"] = data.evidence_shots.length === 0 ? "empty" : "success";
        setState(
          kind === "empty"
            ? { kind: "empty", prompt: promptText, data }
            : { kind: "success", prompt: promptText, data, justSavedId: data.saved_report_id },
        );
        recordSavedReportFrom(data);
      } catch (e) {
        if (cancelled) return;
        setState({
          kind: "error",
          prompt: "",
          message: e instanceof Error ? e.message : "Replay load failed.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordSavedReportFrom = useCallback((data: AgentResponse) => {
    if (!data.saved_report_id) return;
    const insert = data.tool_calls.find((c) => c.name === "insertReport");
    const params = (insert?.params ?? {}) as {
      title?: string;
      player?: string;
      body_markdown?: string;
    };
    setSavedReports((prev) => {
      if (prev.find((r) => r.id === data.saved_report_id)) return prev;
      return [
        {
          id: data.saved_report_id!,
          title: params.title ?? "Scouting report",
          player: params.player,
          body: params.body_markdown,
          saved_at: "just now",
        },
        ...prev,
      ];
    });
  }, []);

  const submit = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return;
      setState({ kind: "loading", prompt });
      try {
        const endpoint = replaySession ? `/api/agent?replay=${replaySession}` : "/api/agent";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Scout request failed (${res.status}).`);
        }
        const data = (await res.json()) as AgentResponse;
        if (data.evidence_shots.length === 0) {
          setState({ kind: "empty", prompt, data });
        } else {
          setState({ kind: "success", prompt, data, justSavedId: data.saved_report_id });
          recordSavedReportFrom(data);
        }
        setTimeout(() => answerRef.current?.focus(), 50);
      } catch (e) {
        setState({
          kind: "error",
          prompt,
          message: e instanceof Error ? e.message : "Scout request failed.",
        });
      }
    },
    [replaySession, recordSavedReportFrom],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit((e.target as HTMLInputElement).value);
    } else if (e.key === "Escape") {
      if (inputRef.current) inputRef.current.value = "";
      setState({ kind: "idle" });
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowHint(false);
    const value = e.target.value;
    if (state.kind === "idle" || state.kind === "typing") {
      setState(value === "" ? { kind: "idle" } : { kind: "typing", prompt: value });
    }
  };

  const showingResults = state.kind === "success" || state.kind === "empty";
  const data = showingResults ? state.data : null;
  const pipelineCall = data?.tool_calls.find(
    (c) => c.name === "queryShots" || c.name === "runAggregation",
  );
  const vectorCall = data?.tool_calls.find((c) => c.name === "vectorSearchShots");
  const insertCall = data?.tool_calls.find((c) => c.name === "insertReport");
  const hasSorted = useMemo(() => {
    if (!pipelineCall) return false;
    const p = pipelineCall.params as { sort_by?: string };
    if (p?.sort_by) return true;
    try {
      const j = JSON.stringify(pipelineCall.pipeline ?? "");
      return j.includes('"$sort"');
    } catch {
      return false;
    }
  }, [pipelineCall]);

  const pipelineText = useMemo(() => {
    if (!pipelineCall) return "";
    try {
      return JSON.stringify(pipelineCall.pipeline ?? pipelineCall.filter ?? {}, null, 2);
    } catch {
      return "";
    }
  }, [pipelineCall]);

  const inputAccent =
    inputFocused || state.kind === "typing" || state.kind === "loading"
      ? "var(--court-burnt)"
      : "var(--court-walnut-2)";

  return (
    <section
      id="ask-the-scout"
      style={courtTheme}
      className="relative px-6 pt-16 pb-16 md:px-16 md:pt-20 md:pb-24"
      aria-labelledby="scout-heading"
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span
            className="font-mono text-[12px] uppercase tracking-[0.12em]"
            style={{ color: "var(--court-walnut-2)" }}
          >
            02 / Ask the Scout
          </span>
          <motion.h2
            id="scout-heading"
            className="mt-3 font-display text-[44px] font-medium leading-[0.95] tracking-[-0.035em] md:text-[64px]"
            style={{ color: "var(--court-ink)" }}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Ask the scout.
          </motion.h2>
          <p
            className="mt-2 font-mono text-[12px] uppercase tracking-[0.12em]"
            style={{ color: "var(--court-walnut-2)" }}
          >
            Live agent · MongoDB Atlas aggregation + vector search
          </p>
        </div>
        <div className="flex items-center gap-2">
          {replaySession && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em]"
              style={{
                background: "var(--court-burnt)",
                color: "var(--court-paper-2)",
                border: "1px solid var(--court-walnut)",
              }}
              role="status"
            >
              ▶ replay · {replaySession}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em]"
            style={{ borderColor: "var(--court-walnut-2)", color: "var(--court-walnut)" }}
          >
            Saved · {String(savedReports.length).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Editorial display-input (warm) */}
      <div className="relative mt-10">
        <label htmlFor="scout-prompt" className="sr-only">
          Ask the scout
        </label>
        <div
          className="flex items-end gap-4 pb-2 transition-[border-color,border-width] duration-150"
          style={{
            borderBottom: `${
              inputFocused || state.kind === "typing" || state.kind === "loading" ? "3px" : "1.5px"
            } solid ${inputAccent}`,
          }}
        >
          <input
            ref={inputRef}
            id="scout-prompt"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder={state.kind === "idle" ? PLACEHOLDER : ""}
            disabled={state.kind === "loading"}
            onKeyDown={onKeyDown}
            onChange={onChange}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            className="font-display flex-1 bg-transparent text-[26px] font-medium leading-[1.05] tracking-[-0.025em] outline-none md:text-[34px] lg:text-[40px]"
            style={{ caretColor: "var(--court-burnt)", color: "var(--court-ink)" }}
            aria-describedby="scout-hint"
          />
          <button
            type="button"
            onClick={() => submit(inputRef.current?.value ?? "")}
            disabled={state.kind === "loading"}
            className="rounded-none px-3 py-2 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors"
            style={{
              background:
                state.kind === "typing" || state.kind === "loading"
                  ? "var(--court-burnt)"
                  : "transparent",
              color:
                state.kind === "typing" || state.kind === "loading"
                  ? "var(--court-paper-2)"
                  : "var(--court-walnut)",
              border: `1px solid ${
                state.kind === "typing" || state.kind === "loading"
                  ? "var(--court-burnt)"
                  : "var(--court-walnut-2)"
              }`,
            }}
            aria-label="Submit prompt"
          >
            Ask ↵
          </button>
        </div>
        <AnimatePresence>
          {state.kind === "idle" && showHint && (
            <motion.span
              id="scout-hint"
              initial={reduce ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute -bottom-6 left-0 font-mono text-[12px] uppercase tracking-[0.12em]"
              style={{ color: "var(--court-walnut-2)" }}
            >
              {HINT}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Idle hint / loading / error live region */}
      <div
        ref={answerRef}
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="false"
        aria-busy={state.kind === "loading"}
        className="mt-10 outline-none"
      >
        {state.kind === "loading" && <LoadingStrip reduce={!!reduce} />}
        {state.kind === "error" && (
          <div
            role="alert"
            className="border p-5"
            style={{
              borderColor: "var(--court-bad)",
              background: "var(--court-paper-2)",
            }}
          >
            <div
              className="font-mono text-[12px] uppercase tracking-[0.12em]"
              style={{ color: "var(--court-bad)" }}
            >
              Scout request failed
            </div>
            <p
              className="mt-2 font-mono text-[13px]"
              style={{ color: "var(--court-walnut)" }}
            >
              {state.message}
            </p>
            <button
              type="button"
              onClick={() => submit(state.prompt)}
              className="mt-4 border px-4 py-2 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors"
              style={{
                borderColor: "var(--court-burnt)",
                color: "var(--court-burnt)",
              }}
            >
              [ retry ]
            </button>
          </div>
        )}

        {/* Hero answer card */}
        {(state.kind === "success" || state.kind === "empty") && (
          <AnswerHero
            answer={state.kind === "empty" ? "No shots matched that filter." : state.data.answer}
            reduce={!!reduce}
            timeline={{
              query: !!pipelineCall,
              rank: hasSorted,
              similar: !!vectorCall,
              save: !!data?.saved_report_id,
            }}
            empty={state.kind === "empty"}
          />
        )}
      </div>

      {/* Results grid */}
      {(state.kind === "success" || state.kind === "empty") && data && (
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[3fr_2fr] lg:gap-12">
          {/* LEFT — Evidence shots (rich) */}
          <div>
            <SectionLabel>Evidence shots</SectionLabel>
            {state.kind === "empty" ? (
              <p
                className="mt-3 font-mono text-[13px]"
                style={{ color: "var(--court-muted)" }}
              >
                0 shots — try widening the filter (period, player, or shot type).
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {state.data.evidence_shots.slice(0, 5).map((s, i) => (
                  <RichShotCard key={s.shot_id} shot={s} index={i + 1} reduce={!!reduce} />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT — Query, Similar, Saved */}
          <div className="flex flex-col gap-6">
            {/* Query used */}
            <article
              className="border"
              style={{
                background: "var(--court-paper-2)",
                borderColor: "var(--court-walnut)",
              }}
            >
              <header
                className="flex items-center justify-between gap-3 border-b px-4 py-3"
                style={{ borderColor: "var(--court-walnut-2)" }}
              >
                <div className="flex items-center gap-2">
                  <SectionLabel inline>Query used</SectionLabel>
                  <Chip variant="orange">Atlas aggregation</Chip>
                </div>
                <button
                  type="button"
                  onClick={() => setJsonOpen((v) => !v)}
                  className="font-mono text-[11px] uppercase tracking-[0.12em] underline-offset-2 hover:underline"
                  style={{ color: "var(--court-walnut)" }}
                  aria-expanded={jsonOpen}
                  aria-controls="query-json-full"
                >
                  {jsonOpen ? "− Collapse" : "+ Expand JSON"}
                </button>
              </header>
              <div className="px-4 py-3">
                <p
                  className="font-mono text-[12px] leading-[1.45]"
                  style={{ color: "var(--court-walnut-2)" }}
                >
                  {summarizePipeline(pipelineCall)}
                </p>
                <AnimatePresence initial={false}>
                  {jsonOpen && pipelineText && (
                    <motion.pre
                      id="query-json-full"
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      tabIndex={0}
                      className="mt-3 overflow-x-auto p-3 font-mono text-[12px] leading-[1.55]"
                      style={{
                        background: "var(--court-mono-bg)",
                        color: "var(--court-mono-text)",
                        border: "1px solid var(--court-walnut)",
                      }}
                    >
                      {pipelineText}
                    </motion.pre>
                  )}
                </AnimatePresence>
              </div>
            </article>

            {/* Similar shots */}
            {state.kind === "success" && state.data.similar_shots && state.data.similar_shots.length > 0 && (
              <article
                className="border"
                style={{
                  background: "var(--court-paper-2)",
                  borderColor: "var(--court-walnut)",
                }}
              >
                <header
                  className="flex items-center justify-between gap-3 border-b px-4 py-3"
                  style={{ borderColor: "var(--court-walnut-2)" }}
                >
                  <SectionLabel inline>Similar shots</SectionLabel>
                  <Chip variant="walnut">
                    {vectorCall ? similarityChipLabel(vectorCall) : "Similarity"}
                  </Chip>
                </header>
                <ul className="divide-y" style={{ borderColor: "var(--court-walnut-2)" }}>
                  {state.data.similar_shots.slice(0, 3).map((s) => (
                    <SimilarCard
                      key={s.shot_id}
                      shot={s}
                      facts={similarityFacts(s, state.data.evidence_shots[0])}
                    />
                  ))}
                </ul>
              </article>
            )}

            {/* Saved scouting report (artifact card) */}
            {state.kind === "success" && state.data.saved_report_id && insertCall && (
              <SavedReportCard
                id={state.data.saved_report_id}
                title={(insertCall.params.title as string) ?? "Scouting report"}
                player={insertCall.params.player as string | undefined}
                body={insertCall.params.body_markdown as string | undefined}
                reduce={!!reduce}
              />
            )}
          </div>
        </div>
      )}

      {/* Saved reports list (kept compact) */}
      {savedReports.length > 0 && (
        <div className="mt-12">
          <SectionLabel>Saved scouting reports · {String(savedReports.length).padStart(2, "0")}</SectionLabel>
          <ul
            className="mt-4 divide-y border"
            style={{ borderColor: "var(--court-walnut-2)", background: "var(--court-paper-2)" }}
          >
            <AnimatePresence initial={false}>
              {savedReports.map((r) => (
                <motion.li
                  key={r.id}
                  initial={reduce ? false : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-baseline justify-between px-4 py-3"
                  style={{ borderColor: "var(--court-walnut-2)" }}
                >
                  <span className="font-body text-[15px]" style={{ color: "var(--court-ink)" }}>
                    {r.title}
                  </span>
                  <span
                    className="font-mono text-[11px] uppercase tracking-[0.12em]"
                    style={{ color: "var(--court-walnut-2)" }}
                  >
                    {r.saved_at} · {r.id.slice(-6)}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <output role="status" className="sr-only">
            {savedReports.length > 0 ? "Report saved." : ""}
          </output>
        </div>
      )}
    </section>
  );
}

/* ---------- Sub-components ---------- */

function SectionLabel({
  children,
  inline = false,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <span
      className={`${inline ? "inline-block" : "block"} font-mono text-[11px] uppercase tracking-[0.14em]`}
      style={{ color: "var(--court-walnut)" }}
    >
      {children}
    </span>
  );
}

function Chip({
  children,
  variant = "walnut",
}: {
  children: React.ReactNode;
  variant?: "orange" | "walnut" | "good";
}) {
  const styles =
    variant === "orange"
      ? { background: "var(--court-burnt)", color: "var(--court-paper-2)", border: "1px solid var(--court-burnt)" }
      : variant === "good"
        ? { background: "var(--court-good)", color: "var(--court-paper-2)", border: "1px solid var(--court-good)" }
        : { background: "transparent", color: "var(--court-walnut)", border: "1px solid var(--court-walnut-2)" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]"
      style={styles}
    >
      {children}
    </span>
  );
}

function AnswerHero({
  answer,
  reduce,
  timeline,
  empty,
}: {
  answer: string;
  reduce: boolean;
  timeline: { query: boolean; rank: boolean; similar: boolean; save: boolean };
  empty: boolean;
}) {
  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="relative border"
      style={{
        background: "var(--court-paper-2)",
        borderColor: "var(--court-walnut)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3"
        style={{ borderColor: "var(--court-walnut-2)" }}
      >
        <div className="flex items-center gap-2">
          <SectionLabel inline>Agent answer</SectionLabel>
          {!empty && <Chip variant="orange">Atlas aggregation</Chip>}
          {!empty && timeline.save && <Chip variant="good">Saved to reports</Chip>}
        </div>
        <span
          className="font-mono text-[11px] uppercase tracking-[0.12em]"
          style={{ color: "var(--court-walnut-2)" }}
        >
          xfg model · 2025-26 playoffs
        </span>
      </header>
      <div className="px-5 py-6 md:px-7 md:py-7">
        <p
          className={`font-display ${empty ? "text-[20px] md:text-[22px]" : "text-[22px] leading-[1.35] md:text-[28px] md:leading-[1.3]"}`}
          style={{
            color: empty ? "var(--court-muted)" : "var(--court-ink)",
            letterSpacing: "-0.015em",
          }}
        >
          {answer}
        </p>
      </div>
      {!empty && (
        <footer
          className="border-t px-5 py-4"
          style={{ borderColor: "var(--court-walnut-2)" }}
        >
          <TimelineStrip steps={timeline} />
        </footer>
      )}
    </motion.article>
  );
}

function TimelineStrip({
  steps,
}: {
  steps: { query: boolean; rank: boolean; similar: boolean; save: boolean };
}) {
  const items: { label: string; done: boolean }[] = [
    { label: "Query MongoDB", done: steps.query },
    { label: "Rank tough makes", done: steps.rank },
    { label: "Find similar shots", done: steps.similar },
    { label: "Save report", done: steps.save },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {items.map((it, idx) => (
        <li key={it.label} className="flex items-center gap-3">
          <span
            className="flex items-center gap-2 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em]"
            style={{
              background: it.done ? "var(--court-walnut)" : "transparent",
              color: it.done ? "var(--court-paper-2)" : "var(--court-walnut-2)",
              border: `1px solid ${it.done ? "var(--court-walnut)" : "var(--court-walnut-2)"}`,
            }}
          >
            <span
              aria-hidden
              style={{ color: it.done ? "var(--court-burnt-2)" : "var(--court-walnut-2)" }}
            >
              {it.done ? "✓" : "○"}
            </span>
            {String(idx + 1).padStart(2, "0")} · {it.label}
          </span>
          {idx < items.length - 1 && (
            <span
              aria-hidden
              className="h-px w-4"
              style={{ background: "var(--court-walnut-2)" }}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function LoadingStrip({ reduce }: { reduce: boolean }) {
  return (
    <div
      className="border px-5 py-6"
      style={{ background: "var(--court-paper-2)", borderColor: "var(--court-walnut-2)" }}
    >
      <div className="flex items-center gap-3">
        <motion.span
          aria-hidden
          animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity }}
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: "var(--court-burnt)" }}
        />
        <span
          className="font-mono text-[12px] uppercase tracking-[0.14em]"
          style={{ color: "var(--court-walnut)" }}
        >
          Scout querying Atlas…
        </span>
      </div>
      <div className="mt-4 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            animate={reduce ? undefined : { opacity: [0.25, 0.6, 0.25] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
            className="h-1.5 flex-1"
            style={{ background: "var(--court-walnut-2)" }}
          />
        ))}
      </div>
    </div>
  );
}

function RichShotCard({
  shot,
  index,
  reduce,
}: {
  shot: Shot;
  index: number;
  reduce: boolean;
}) {
  const xfgPct = Math.round(shot.xfg * 100);
  const foePts = Math.round(shot.fg_over_expected * 100);
  const time = formatPeriodTime(shot);
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : index * 0.05 }}
      className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border px-4 py-3 md:px-5 md:py-4"
      style={{
        background: "var(--court-paper-2)",
        borderColor: "var(--court-walnut-2)",
      }}
    >
      {/* Rank */}
      <div
        className="flex h-12 w-12 items-center justify-center font-mono text-[14px] uppercase tracking-[0.08em]"
        style={{
          background: "var(--court-paper-3)",
          color: "var(--court-walnut)",
          border: "1px solid var(--court-walnut-2)",
        }}
      >
        {String(index).padStart(2, "0")}
      </div>

      {/* Meta */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4
            className="truncate font-display text-[18px] font-medium leading-tight tracking-[-0.01em] md:text-[20px]"
            style={{ color: "var(--court-ink)" }}
          >
            {shot.player}
          </h4>
          <span
            className="font-mono text-[11px] uppercase tracking-[0.12em]"
            style={{ color: "var(--court-walnut-2)" }}
          >
            {teamAbbrev(shot.team)}
          </span>
          {shot.shot_made ? (
            <Chip variant="good">MADE</Chip>
          ) : (
            <Chip variant="walnut">MISS</Chip>
          )}
        </div>
        <p
          className="mt-1 font-body text-[13px] leading-[1.4]"
          style={{ color: "var(--court-walnut)" }}
        >
          {shot.shot_distance}ft · {shot.shot_zone} · {shot.action_type}
          {time && (
            <>
              {" "}
              <span style={{ color: "var(--court-walnut-2)" }}>· {time}</span>
            </>
          )}
        </p>
      </div>

      {/* xFG badge */}
      <div className="text-right">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--court-walnut-2)" }}
        >
          xFG
        </div>
        <div
          className="font-display text-[28px] font-medium leading-none tracking-[-0.02em] md:text-[32px]"
          style={{ color: "var(--court-burnt)" }}
        >
          {xfgPct}
          <span className="text-[14px] md:text-[16px]" style={{ color: "var(--court-walnut-2)" }}>
            %
          </span>
        </div>
        <div
          className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--court-muted)" }}
        >
          {foePts >= 0 ? `+${foePts}` : foePts} fg/exp
        </div>
      </div>
    </motion.div>
  );
}

function SimilarCard({
  shot,
  facts,
}: {
  shot: Shot;
  facts: { label: string; match: boolean }[];
}) {
  const xfgPct = Math.round(shot.xfg * 100);
  return (
    <li
      className="flex items-center justify-between gap-4 px-4 py-3"
      style={{ borderColor: "var(--court-walnut-2)" }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="truncate font-body text-[14px] font-medium"
          style={{ color: "var(--court-ink)" }}
        >
          {shot.player}{" "}
          <span
            className="font-mono text-[11px] uppercase tracking-[0.12em]"
            style={{ color: "var(--court-muted)" }}
          >
            · {teamAbbrev(shot.team)}
          </span>
        </div>
        <div
          className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em]"
          style={{ color: "var(--court-muted)" }}
        >
          {shot.shot_distance}ft · {shot.shot_zone}
        </div>
        {facts.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {facts.map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]"
                style={{
                  background: f.match ? "var(--court-burnt)" : "transparent",
                  color: f.match ? "var(--court-paper)" : "var(--court-muted)",
                  border: `1px solid ${f.match ? "var(--court-burnt)" : "var(--court-walnut-2)"}`,
                }}
              >
                {f.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right">
        <div
          className="font-display text-[22px] font-medium leading-none tracking-[-0.02em]"
          style={{ color: "var(--court-burnt)" }}
        >
          {xfgPct}
          <span className="text-[12px]" style={{ color: "var(--court-muted)" }}>
            %
          </span>
        </div>
        <div
          className="font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--court-muted)" }}
        >
          xFG
        </div>
      </div>
    </li>
  );
}

function SavedReportCard({
  id,
  title,
  player,
  body,
  reduce,
}: {
  id: string;
  title: string;
  player?: string;
  body?: string;
  reduce: boolean;
}) {
  const excerpt = body ? (body.length > 220 ? body.slice(0, 220).trimEnd() + "…" : body) : null;
  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative border"
      style={{
        background: "var(--court-paper-2)",
        borderColor: "var(--court-walnut)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <header
        className="flex items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--court-walnut-2)" }}
      >
        <div className="flex items-center gap-2">
          <SectionLabel inline>Saved report</SectionLabel>
          <Chip variant="good">Saved to reports collection</Chip>
        </div>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--court-walnut-2)" }}
        >
          _id · {id.slice(-8)}
        </span>
      </header>
      <div className="px-4 py-4">
        <h5
          className="font-display text-[18px] font-medium leading-tight tracking-[-0.015em]"
          style={{ color: "var(--court-ink)" }}
        >
          {title}
        </h5>
        {player && (
          <div
            className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em]"
            style={{ color: "var(--court-walnut-2)" }}
          >
            subject · {player}
          </div>
        )}
        {excerpt && (
          <p
            className="mt-3 font-body text-[13px] leading-[1.5]"
            style={{ color: "var(--court-walnut)" }}
          >
            {excerpt}
          </p>
        )}
      </div>
    </motion.article>
  );
}

/* ---------- helpers ---------- */

function formatPeriodTime(shot: Shot): string | null {
  if (typeof shot.period !== "number") return null;
  const mins = shot.minutes_left_in_period;
  const secs = shot.seconds_left_in_period;
  if (typeof secs === "number") {
    // seconds_left_in_period stored as total seconds (0..720)
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `Q${shot.period} ${m}:${String(s).padStart(2, "0")}`;
  }
  if (typeof mins === "number") {
    return `Q${shot.period} ${mins}:00`;
  }
  return `Q${shot.period}`;
}

function teamAbbrev(team: string): string {
  if (!team) return "";
  if (team.length <= 4) return team.toUpperCase();
  // Map common full names to 3-letter abbrev — fallback to last word's first 3 chars.
  const map: Record<string, string> = {
    "Atlanta Hawks": "ATL",
    "Boston Celtics": "BOS",
    "Brooklyn Nets": "BKN",
    "Charlotte Hornets": "CHA",
    "Chicago Bulls": "CHI",
    "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL",
    "Denver Nuggets": "DEN",
    "Detroit Pistons": "DET",
    "Golden State Warriors": "GSW",
    "Houston Rockets": "HOU",
    "Indiana Pacers": "IND",
    "Los Angeles Clippers": "LAC",
    "Los Angeles Lakers": "LAL",
    "Memphis Grizzlies": "MEM",
    "Miami Heat": "MIA",
    "Milwaukee Bucks": "MIL",
    "Minnesota Timberwolves": "MIN",
    "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK",
    "Oklahoma City Thunder": "OKC",
    "Orlando Magic": "ORL",
    "Philadelphia 76ers": "PHI",
    "Phoenix Suns": "PHX",
    "Portland Trail Blazers": "POR",
    "Sacramento Kings": "SAC",
    "San Antonio Spurs": "SAS",
    "Toronto Raptors": "TOR",
    "Utah Jazz": "UTA",
    "Washington Wizards": "WAS",
  };
  if (map[team]) return map[team];
  return team
    .split(" ")
    .pop()!
    .slice(0, 3)
    .toUpperCase();
}

function summarizePipeline(call?: ToolCallRecord): string {
  if (!call) return "—";
  const p = (call.params ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (p.player) parts.push(`player=${String(p.player)}`);
  if (p.is_three_point) parts.push("is_three_point=true");
  if (p.shot_made) parts.push("shot_made=true");
  if (p.clutch_only) parts.push("clutch_only=true");
  if (p.period_min) parts.push(`period>=${p.period_min}`);
  if (p.shot_zone) parts.push(`zone="${p.shot_zone}"`);
  if (p.sort_by) parts.push(`sort=${p.sort_by}`);
  if (p.limit) parts.push(`limit=${p.limit}`);
  const tool = call.name === "queryShots" ? "find()" : "aggregate()";
  return `${tool} · ${parts.join(" · ") || "no filters"} → ${call.result_summary}`;
}

function similarityChipLabel(call: ToolCallRecord): string {
  const summary = call.result_summary?.toLowerCase() ?? "";
  if (summary.includes("heuristic")) return "Similarity search fallback";
  return "Atlas Vector Search";
}

/**
 * Structured field-comparison facts for a similar shot vs. the seed.
 * Every entry is mechanically derived from the document — no narrative.
 */
function similarityFacts(
  s: Shot,
  seed?: Shot,
): { label: string; match: boolean }[] {
  const facts: { label: string; match: boolean }[] = [];
  if (seed) {
    facts.push({ label: "ZONE", match: s.shot_zone === seed.shot_zone });
    facts.push({ label: "ACTION", match: s.action_type === seed.action_type });
    const ddist = Math.abs(s.shot_distance - seed.shot_distance);
    facts.push({ label: `Δdist ${ddist}ft`, match: ddist <= 2 });
    const dxfg = Math.round(Math.abs(s.xfg - seed.xfg) * 100);
    facts.push({ label: `Δxfg ${dxfg}pp`, match: dxfg <= 5 });
  }
  return facts;
}
