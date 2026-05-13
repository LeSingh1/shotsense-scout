"use client";

/**
 * AgentPanel — section 02 / Ask the Scout.
 *
 * Locked design spec (from /plan-design-review):
 *   - Layout α: three-row split (input/answer hero, pipeline+evidence, saved reports).
 *   - Editorial display-input (3A): no box, accent underline, accent block caret.
 *   - All 7 interaction states: idle, typing, loading, success, empty, error, replay.
 *   - Zero new design primitives: reuses globals.css tokens + motion/react patterns.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";

// Mirror the response shape from /api/agent without importing server-only code.
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
};

type ToolCallRecord = {
  name: "queryShots" | "runAggregation" | "vectorSearchShots" | "insertReport";
  params: unknown;
  pipeline?: unknown;
  filter?: unknown;
  result_summary: string;
};

type AgentResponse = {
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

type SavedReport = { id: string; title: string; saved_at: string };

const PLACEHOLDER = "find the toughest playoff threes...";
const HINT = "try: find Brunson's toughest makes in the playoffs";

export function AgentPanel() {
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<UiState>({ kind: "idle" });
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [replaySession, setReplaySession] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  // Detect ?replay= on mount
  useEffect(() => {
    const url = new URL(window.location.href);
    const r = url.searchParams.get("replay");
    if (r) setReplaySession(r);
    const timer = setTimeout(() => setShowHint(true), 200);
    return () => clearTimeout(timer);
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
          if (data.saved_report_id) {
            const title =
              (data.tool_calls.find((c) => c.name === "insertReport")?.params as {
                title?: string;
              } | undefined)?.title ?? "Scouting report";
            setSavedReports((prev) => [
              { id: data.saved_report_id!, title, saved_at: "just now" },
              ...prev,
            ]);
          }
        }
        // Focus the answer region for screen readers
        setTimeout(() => answerRef.current?.focus(), 50);
      } catch (e) {
        setState({
          kind: "error",
          prompt,
          message: e instanceof Error ? e.message : "Scout request failed.",
        });
      }
    },
    [replaySession],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const prompt = (e.target as HTMLInputElement).value;
      submit(prompt);
    } else if (e.key === "Escape") {
      if (inputRef.current) inputRef.current.value = "";
      setState({ kind: "idle" });
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowHint(false);
    const value = e.target.value;
    if (state.kind === "idle" || state.kind === "typing") {
      if (value === "") setState({ kind: "idle" });
      else setState({ kind: "typing", prompt: value });
    }
  };

  const showingResults = state.kind === "success" || state.kind === "empty";
  const data = showingResults ? state.data : null;
  const pipelineCall = data?.tool_calls.find(
    (c) => c.name === "queryShots" || c.name === "runAggregation",
  );

  return (
    <section
      id="ask-the-scout"
      className="relative px-6 pt-24 pb-20 md:px-20 md:pt-32 md:pb-28"
      aria-labelledby="scout-heading"
    >
      {/* Replay-mode chip (state 7) */}
      {replaySession && (
        <div
          className="mb-6 inline-block bg-accent px-3 py-1 font-mono text-[12px] uppercase tracking-[0.08em] text-bg"
          role="status"
        >
          ▶ replay · {replaySession}
        </div>
      )}

      {/* Section number */}
      <span className="num font-mono text-[13px] font-medium uppercase tracking-[0.08em] text-muted">
        02 / Ask the Scout
      </span>

      {/* Headline */}
      <div className="mt-10 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <motion.h2
          id="scout-heading"
          className="font-display text-[56px] font-medium leading-[0.94] tracking-[-0.04em] md:text-[88px] lg:text-[104px]"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          Ask the scout.
        </motion.h2>
        <div className="font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
          Saved reports · {String(savedReports.length).padStart(2, "0")}
        </div>
      </div>

      <p className="mt-3 font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
        Live agent over MongoDB Atlas. Real queries, saved reports.
      </p>

      {/* Row 1 — editorial display-input */}
      <div className="relative mt-16">
        <label htmlFor="scout-prompt" className="sr-only">
          Ask the scout
        </label>
        <div
          className={`flex items-end gap-4 border-b ${
            state.kind === "typing" || state.kind === "loading"
              ? "border-b-[3px] border-accent"
              : "border-b border-border"
          } pb-2 transition-[border-width] duration-150`}
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
            className="font-display flex-1 bg-transparent text-[40px] font-medium leading-[1.05] tracking-[-0.03em] text-text outline-none placeholder:text-muted md:text-[48px] lg:text-[56px]"
            style={{ caretColor: "var(--color-accent)" }}
            aria-describedby="scout-hint"
          />
          <button
            type="button"
            onClick={() => submit(inputRef.current?.value ?? "")}
            disabled={state.kind === "loading"}
            className={`pb-2 font-mono text-[13px] uppercase tracking-[0.08em] transition-colors ${
              state.kind === "typing" || state.kind === "loading"
                ? "text-accent"
                : "text-muted hover:text-accent"
            }`}
            aria-label="Submit prompt"
          >
            ↵
          </button>
        </div>
        {/* Hint chip — appears only in idle, vanishes on first keystroke */}
        <AnimatePresence>
          {state.kind === "idle" && showHint && (
            <motion.span
              id="scout-hint"
              initial={reduce ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute -bottom-7 left-0 font-mono text-[12px] uppercase tracking-[0.08em] text-muted"
            >
              {HINT}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Row 1.5 — Answer */}
      <div
        ref={answerRef}
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="false"
        aria-busy={state.kind === "loading"}
        className="mt-20 min-h-[8rem] outline-none"
      >
        {state.kind === "loading" && (
          <div className="font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
            scout is searching<LoadingDots />
          </div>
        )}
        {state.kind === "success" && (
          <>
            <div className="font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
              Answer
            </div>
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-3 font-body text-[20px] leading-[1.4] md:text-[24px]"
            >
              {state.data.answer}
            </motion.p>
          </>
        )}
        {state.kind === "empty" && (
          <>
            <div className="font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
              Answer
            </div>
            <p className="mt-3 font-body text-[20px] leading-[1.4] text-muted md:text-[24px]">
              No shots matched that filter.
            </p>
          </>
        )}
        {state.kind === "error" && (
          <div role="alert">
            <div className="font-mono text-[13px] uppercase tracking-[0.08em] text-neg">
              Scout request failed.
            </div>
            <p className="mt-2 font-mono text-[13px] text-muted">{state.message}</p>
            <button
              type="button"
              onClick={() => submit(state.prompt)}
              className="mt-4 border border-accent px-4 py-2 font-mono text-[13px] uppercase tracking-[0.08em] text-accent hover:bg-accent hover:text-bg"
            >
              [ retry ]
            </button>
          </div>
        )}
      </div>

      {/* Row 2 — Pipeline JSON + Evidence shots */}
      {(state.kind === "loading" || state.kind === "success" || state.kind === "empty") && (
        <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-[3fr_2fr] lg:gap-12">
          {/* Pipeline panel */}
          <div className="flex flex-col">
            <div className="mb-3 font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
              <span className="text-accent">:</span> MongoDB pipeline
            </div>
            <pre
              aria-label="MongoDB aggregation pipeline executed by the agent"
              tabIndex={0}
              className="overflow-x-auto border border-border bg-surface p-4 font-mono text-[13px] leading-[1.5] text-text"
            >
              {state.kind === "loading"
                ? "running aggregation..."
                : pipelineCall
                  ? JSON.stringify(pipelineCall.pipeline ?? pipelineCall.filter, null, 2)
                  : "—"}
            </pre>
          </div>
          {/* Evidence */}
          <div className="flex flex-col">
            <div className="mb-3 font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
              Evidence shots
            </div>
            {state.kind === "loading" && (
              <div className="font-mono text-[13px] text-muted">—</div>
            )}
            {state.kind === "success" && (
              <EvidenceGrid shots={state.data.evidence_shots} />
            )}
            {state.kind === "empty" && (
              <p className="font-mono text-[13px] text-muted">
                0 shots — try widening the filter (period, player, or shot type).
              </p>
            )}
            {state.kind === "success" && state.data.similar_shots && (
              <div className="mt-6">
                <div className="mb-3 font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
                  Similar shots <span className="text-accent">→</span>
                </div>
                <EvidenceGrid shots={state.data.similar_shots} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row 3 — Saved scouting reports */}
      {savedReports.length > 0 && (
        <div className="mt-20">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
              Saved scouting reports
            </h3>
            <span className="font-mono text-[13px] text-muted">
              {String(savedReports.length).padStart(2, "0")}
            </span>
          </div>
          <ul className="divide-y divide-border border-y border-border">
            <AnimatePresence initial={false}>
              {savedReports.map((r) => (
                <motion.li
                  key={r.id}
                  initial={reduce ? false : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-baseline justify-between py-4"
                >
                  <span className="font-body text-[16px]">{r.title}</span>
                  <span className="font-mono text-[13px] text-muted">{r.saved_at}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {/* Save-status announcement for screen readers */}
          <output role="status" className="sr-only">
            {savedReports.length > 0 ? "Report saved." : ""}
          </output>
        </div>
      )}
    </section>
  );
}

function EvidenceGrid({ shots }: { shots: Shot[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="grid grid-cols-3 gap-3 md:gap-4">
      {shots.slice(0, 6).map((s, idx) => (
        <motion.button
          key={s.shot_id}
          type="button"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: reduce ? 0 : idx * 0.08 }}
          className="flex min-h-[96px] flex-col items-start justify-between border border-border bg-surface p-3 text-left hover:border-accent"
        >
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            {s.player.split(" ").slice(-1)[0]} · {s.shot_distance}ft
          </div>
          <div className="font-mono text-[28px] font-medium text-text">
            {Math.round(s.xfg * 100)}
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            {s.shot_made ? "made" : "miss"} · xfg
          </div>
        </motion.button>
      ))}
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex w-6 justify-start">
      <motion.span
        animate={{ opacity: [0.2, 1, 0.2] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      >
        .
      </motion.span>
      <motion.span
        animate={{ opacity: [0.2, 1, 0.2] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
      >
        .
      </motion.span>
      <motion.span
        animate={{ opacity: [0.2, 1, 0.2] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
      >
        .
      </motion.span>
    </span>
  );
}
