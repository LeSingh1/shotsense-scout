"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { buildFeaturedRoster, type FeaturedPlayer } from "@/lib/featured";
import {
  SCENARIOS,
  type Scenario,
  type ShotType,
  filterScenario,
  filterShotType,
  computeMetrics,
} from "@/lib/scenarios";
import type { ShotsMap, RankingRow, Meta } from "@/lib/types";
import { HeroBackdrop } from "./HeroBackdrop";
import { CountUp } from "./CountUp";
import { PlayerImage } from "./PlayerImage";
import { MagneticButton } from "./MagneticButton";
import { Sparkline } from "./HudCard";

const AUTO_ROTATE_MS = 8000;

export function PlayerHero({
  shots,
  ranking,
  meta,
}: {
  shots: ShotsMap;
  ranking: RankingRow[];
  meta: Meta;
}) {
  // The roster is derived from the actual playoff shot data — no hardcoded
  // list, no zero-shot players sneak in.
  const roster = useMemo(() => buildFeaturedRoster(ranking), [ranking]);

  const [playerIdx, setPlayerIdx] = useState(0);
  const [scenario, setScenario] = useState<Scenario>("overall");
  const [shotType, setShotType] = useState<ShotType>("ALL");
  const [hovered, setHovered] = useState(false);

  // Defensive: if metadata is incomplete and the roster came up empty, fall
  // back to the first player from the ranking with shots. Won't happen with
  // the current data + meta coverage but means we never blow up.
  const player: FeaturedPlayer | null = roster[playerIdx] ?? roster[0] ?? null;

  const { metrics, allShots, hasData } = useMemo(() => {
    if (!player) return { metrics: computeMetrics([]), allShots: [], hasData: false };
    const entry = shots[String(player.id)];
    const raw = entry?.shots ?? [];
    let s = filterScenario(raw, scenario);
    s = filterShotType(s, shotType);
    return { metrics: computeMetrics(s), allShots: raw, hasData: !!entry && raw.length > 0 };
  }, [player, scenario, shotType, shots]);

  const sparkSeries = useMemo(() => {
    if (allShots.length < 6) return [];
    const buckets = 12;
    const size = Math.max(1, Math.floor(allShots.length / buckets));
    const out: number[] = [];
    for (let i = 0; i < allShots.length; i += size) {
      const slice = allShots.slice(i, i + size);
      out.push(slice.reduce((a, s) => a + s.xfg, 0) / slice.length);
    }
    return out;
  }, [allShots]);

  const overall = useMemo(() => computeMetrics(allShots), [allShots]);
  const overExpected = (overall.fg - overall.xfg) * 100;
  const splits = useMemo(() => computeSplits(allShots), [allShots]);

  const go = (delta: number) => {
    if (roster.length === 0) return;
    setPlayerIdx((i) => (i + delta + roster.length) % roster.length);
  };

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster.length]);

  // Auto-rotate
  useEffect(() => {
    if (hovered || roster.length === 0) return;
    const t = setTimeout(() => go(1), AUTO_ROTATE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerIdx, hovered, roster.length]);

  if (!player) {
    // Total absence of roster data — shouldn't happen, but render a graceful
    // empty state rather than crash.
    return (
      <section id="hero" className="min-h-screen grid place-items-center bg-[#0a0a0a] text-white/60 px-8 text-center">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] mb-3">No playoff data loaded</div>
          <p>Run <code>python scripts/run_pipeline.py</code> and then <code>npm run export-data</code> to populate the dataset.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="hero"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative min-h-screen overflow-hidden"
      style={
        {
          "--nike-accent": player.primary,
          "--nike-secondary": player.secondary,
          background:
            "radial-gradient(ellipse at center, #2a2a2a 0%, #1a1a1a 55%, #0a0a0a 100%)",
          transition: "background 600ms cubic-bezier(0.16, 1, 0.3, 1)",
        } as React.CSSProperties
      }
    >
      <HeroBackdrop key={player.id} lastName={player.lastName || player.firstName} />

      {/* Vignette */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/* Data scope banner — visible chip in the header */}
      <div className="absolute top-[88px] left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md px-4 py-1.5"
        >
          <span className="text-[10px] uppercase tracking-[0.28em] text-white/75">
            Data scope · 2025-26 NBA Playoffs
          </span>
          <span className="text-white/30 text-[10px]">·</span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/45 font-mono">
            updated {meta.run_timestamp.slice(0, 10)}
          </span>
        </motion.div>
      </div>

      {/* MAIN 5-COLUMN GRID
          lg+ : [arrow 60px] [rail 320px] [center 1fr] [rail 320px] [arrow 60px]
          below lg : single column stack, arrows pinned to bottom-center */}
      <div
        className="
          relative z-10 min-h-[calc(100vh-88px)]
          grid grid-cols-1 lg:grid-cols-[60px_minmax(280px,340px)_1fr_minmax(280px,340px)_60px]
          pt-[140px] pb-[210px]
        "
      >
        {/* LEFT arrow gutter (desktop) */}
        <div className="hidden lg:flex items-center justify-center">
          <SideArrow side="left" onClick={() => go(-1)} />
        </div>

        {/* LEFT RAIL */}
        <div className="relative lg:pl-0 lg:pr-2 px-6">
          <AnimatePresence mode="wait">
            <RailLeft key={`L-${player.id}`} player={player} metrics={metrics} hasData={hasData} />
          </AnimatePresence>
        </div>

        {/* CENTER PLAYER */}
        <div className="relative flex items-end justify-center min-h-[420px] lg:min-h-0">
          <div className="w-full max-w-[640px] h-full">
            <PlayerImage player={player} />
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className="relative lg:pl-2 lg:pr-0 px-6">
          <AnimatePresence mode="wait">
            <RailRight
              key={`R-${player.id}`}
              player={player}
              hasData={hasData}
              overallNShots={overall.nShots}
              overExpected={overExpected}
              sparkSeries={sparkSeries}
              splits={splits}
            />
          </AnimatePresence>
        </div>

        {/* RIGHT arrow gutter (desktop) */}
        <div className="hidden lg:flex items-center justify-center">
          <SideArrow side="right" onClick={() => go(1)} />
        </div>
      </div>

      {/* MOBILE arrow row (below the player) */}
      <div className="lg:hidden absolute bottom-[200px] left-0 right-0 z-30 flex justify-center gap-4">
        <SideArrow side="left" onClick={() => go(-1)} inline />
        <SideArrow side="right" onClick={() => go(1)} inline />
      </div>

      {/* BOTTOM control bar */}
      <div className="absolute bottom-0 left-0 right-0 pb-7 pointer-events-none z-30">
        <div className="flex flex-col items-center gap-4 pointer-events-none">
          <div
            className="pointer-events-auto rounded-full border border-white/10 bg-black/55 backdrop-blur-md px-3 py-2 flex items-center gap-6 max-w-[min(940px,92vw)] flex-wrap justify-center"
            style={{ boxShadow: "0 18px 50px rgba(0,0,0,0.45)" }}
          >
            <PillGroup label="Scenario">
              {SCENARIOS.map((s) => (
                <Pill
                  key={s.id}
                  active={scenario === s.id}
                  onClick={() => setScenario(s.id)}
                  layoutId="scenario-pill"
                  title={s.blurb}
                >
                  {s.label}
                </Pill>
              ))}
            </PillGroup>

            <div className="w-px h-6 bg-white/10" />

            <PillGroup label="Type">
              {(["ALL", "2PT", "3PT", "MID", "RIM"] as ShotType[]).map((t) => (
                <Pill
                  key={t}
                  active={shotType === t}
                  onClick={() => setShotType(t)}
                  layoutId="shottype-pill"
                  size="sm"
                >
                  {t}
                </Pill>
              ))}
            </PillGroup>
          </div>

          <div className="pointer-events-auto">
            <MagneticButton
              href="#where-they-shot"
              className="relative inline-flex items-center justify-center w-[280px] h-14 rounded-full font-bold tracking-[0.22em] text-sm uppercase text-white overflow-hidden cursor-pointer"
            >
              <span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background: "var(--nike-accent)",
                  boxShadow:
                    "0 18px 50px color-mix(in srgb, var(--nike-accent) 60%, transparent)",
                  transition: "background 600ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full"
                animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                style={{ border: "2px solid var(--nike-accent)" }}
              />
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full"
                animate={{ backgroundPositionX: ["-200%", "200%"] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
                style={{
                  background:
                    "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)",
                  backgroundSize: "200% 100%",
                  mixBlendMode: "overlay",
                }}
              />
              <span className="relative z-10">Analyze</span>
              <motion.svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className="relative z-10 ml-2"
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <path d="M12 5v14M5 12l7 7 7-7" />
              </motion.svg>
            </MagneticButton>
          </div>

          <div className="pointer-events-auto flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.28em] text-white/45">
              Roster · {playerIdx + 1}/{roster.length}
            </span>
            <div className="flex gap-1.5">
              {roster.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setPlayerIdx(i)}
                  aria-label={`Select ${p.fullName}`}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === playerIdx ? 28 : 10,
                    background: i === playerIdx ? "var(--nike-accent)" : "rgba(255,255,255,0.22)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────── rails */

function RailLeft({
  player, metrics, hasData,
}: {
  player: FeaturedPlayer;
  metrics: { xpps: number; delta: number; xfg: number };
  hasData: boolean;
}) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="
        h-full flex flex-col justify-between gap-6
        rounded-r-3xl lg:rounded-l-none
        px-6 py-8
        border border-white/5 lg:border-l-0
        backdrop-blur-md
      "
      style={{
        background:
          "linear-gradient(to right, rgba(10,10,10,0.78) 0%, rgba(10,10,10,0.45) 70%, rgba(10,10,10,0) 100%)",
      }}
    >
      {/* Eyebrow + team badge */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/60 mb-3">
          NBA Playoffs · 2025-26
        </div>
        <div
          className="inline-flex items-center px-3 py-1 rounded-full border border-white/15 bg-white/5"
          style={{ backdropFilter: "blur(4px)" }}
        >
          <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-white">
            Team {player.team}
          </span>
        </div>
      </div>

      {/* Name + xPPS */}
      <div>
        <h1
          className="font-black tracking-tight text-white leading-[0.86] break-words hyphens-auto"
          style={{
            fontFamily: "var(--font-display)",
            // Scale down for long surnames so they don't overflow the 280-340px rail.
            fontSize: `clamp(32px, ${Math.max(2.4, 4.8 - player.lastName.length * 0.18)}vw, ${player.lastName.length > 8 ? 56 : 72}px)`,
            letterSpacing: "-0.02em",
            textShadow: "0 6px 30px rgba(0,0,0,0.85)",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }}
        >
          {player.firstName}
          <br />
          <span style={{ color: "rgba(255,255,255,0.32)" }}>{player.lastName}</span>
        </h1>

        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/55 mb-1">xPPS</div>
          <Value
            hasData={hasData}
            big
            display={
              <span
                className="font-black tabular-nums leading-none"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(56px, 7vw, 108px)",
                  color: "#fff",
                  textShadow:
                    "0 4px 40px color-mix(in srgb, var(--nike-accent) 55%, transparent), 0 0 8px rgba(0,0,0,0.6)",
                }}
              >
                <CountUp value={metrics.xpps} decimals={2} />
              </span>
            }
          />
          <div
            className="mt-1 inline-block w-16 h-[3px] rounded-full"
            style={{
              background: "var(--nike-accent)",
              transition: "background 600ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
          <div className="mt-2 text-xs font-mono">
            {hasData ? (
              <span style={{ color: metrics.delta >= 0 ? "rgb(120,255,180)" : "rgb(255,120,140)" }}>
                {metrics.delta >= 0 ? "+" : "−"}{Math.abs(metrics.delta * 100).toFixed(1)}% Δ
              </span>
            ) : (
              <span className="text-white/30">No data</span>
            )}
          </div>
        </div>
      </div>

      {/* Shot quality indicator */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/55 mb-2">
          Mean xFG%
        </div>
        {hasData ? (
          <div className="flex items-baseline gap-2">
            <span
              className="font-black tabular-nums"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(28px, 3vw, 44px)",
                color: "var(--nike-accent)",
              }}
            >
              {(metrics.xfg * 100).toFixed(1)}%
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
              expected FG
            </span>
          </div>
        ) : (
          <span className="text-white/30 text-sm font-bold uppercase tracking-wider">No data</span>
        )}
      </div>
    </motion.aside>
  );
}

function RailRight({
  player, hasData, overallNShots, overExpected, sparkSeries, splits,
}: {
  player: FeaturedPlayer;
  hasData: boolean;
  overallNShots: number;
  overExpected: number;
  sparkSeries: number[];
  splits: { label: string; value: string }[];
}) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="
        h-full flex flex-col justify-between gap-6 text-right
        rounded-l-3xl lg:rounded-r-none
        px-6 py-8
        border border-white/5 lg:border-r-0
        backdrop-blur-md
      "
      style={{
        background:
          "linear-gradient(to left, rgba(10,10,10,0.78) 0%, rgba(10,10,10,0.45) 70%, rgba(10,10,10,0) 100%)",
      }}
    >
      {/* SHOTS card with sparkline */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/55">Shots</div>
        <Value
          hasData={hasData}
          big
          display={
            <span
              className="font-black tabular-nums leading-none"
              style={{ fontFamily: "var(--font-display)", fontSize: "clamp(40px, 4.6vw, 68px)" }}
            >
              {overallNShots}
            </span>
          }
        />
        <div className="mt-3 flex justify-end">
          {hasData && sparkSeries.length > 1 ? (
            <Sparkline values={sparkSeries} width={140} height={30} />
          ) : (
            <span className="text-white/25 text-[10px] uppercase tracking-wider">No trend</span>
          )}
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/40 mt-2">
          xFG% trend · 12 buckets
        </div>
      </div>

      {/* FG% over expected */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/55">
          FG% over expected
        </div>
        <Value
          hasData={hasData}
          big
          display={
            <div className="flex items-baseline justify-end gap-1.5 mt-1">
              <span
                className="font-black tabular-nums"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(32px, 3.6vw, 50px)",
                  color: overExpected >= 0 ? "rgb(120,255,180)" : "rgb(255,120,140)",
                  textShadow:
                    overExpected >= 0
                      ? "0 4px 30px rgba(120,255,180,0.35)"
                      : "0 4px 30px rgba(255,120,140,0.35)",
                }}
              >
                {overExpected >= 0 ? "+" : "−"}{Math.abs(overExpected).toFixed(1)}%
              </span>
              <motion.svg
                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ color: overExpected >= 0 ? "rgb(120,255,180)" : "rgb(255,120,140)" }}
                animate={{ y: overExpected >= 0 ? [0, -3, 0] : [0, 3, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <path d={overExpected >= 0 ? "M5 15l7-7 7 7" : "M5 9l7 7 7-7"} />
              </motion.svg>
            </div>
          }
        />
      </div>

      {/* Shooting splits */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/55 mb-3">
          Shooting splits
        </div>
        {hasData ? (
          <div className="flex justify-end gap-4 font-mono text-[11px] uppercase tracking-wider">
            {splits.map((s) => (
              <div key={s.label} className="text-right">
                <div style={{ color: "var(--nike-accent)" }} className="text-[9px]">{s.label}</div>
                <div className="text-white font-bold mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-white/25 text-[10px] uppercase tracking-wider">No splits</span>
        )}
      </div>
    </motion.aside>
  );
}

/* ─────────────────────────────────────────────────────────────── primitives */

function Value({
  hasData, display, big = false,
}: {
  hasData: boolean;
  display: React.ReactNode;
  big?: boolean;
}) {
  if (hasData) return <>{display}</>;
  return (
    <span
      className={`text-white/30 ${big ? "text-3xl" : "text-base"} font-bold uppercase tracking-wider`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      No data
    </span>
  );
}

function PillGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] uppercase tracking-[0.28em] text-white/40 hidden sm:inline">
        {label}
      </span>
      <div className="flex gap-1.5">{children}</div>
    </div>
  );
}

function Pill({
  children, active, onClick, title, layoutId, size = "md",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title?: string;
  layoutId: string;
  size?: "sm" | "md";
}) {
  const padding =
    size === "sm" ? "px-3 py-1.5 text-[10px]" : "px-4 py-1.5 text-[11px]";
  return (
    <motion.button
      onClick={onClick}
      title={title}
      whileTap={{ scale: 0.94 }}
      whileHover={{ y: -1 }}
      className={`relative ${padding} rounded-full font-semibold tracking-[0.16em] uppercase transition`}
      style={{ color: active ? "#fff" : "rgba(255,255,255,0.6)" }}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-full"
          style={{
            background: "var(--nike-accent)",
            boxShadow:
              "0 6px 20px color-mix(in srgb, var(--nike-accent) 50%, transparent)",
          }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}

function SideArrow({
  side, onClick, inline = false,
}: {
  side: "left" | "right";
  onClick: () => void;
  /** When true, render in normal flow (used in the mobile bottom row). */
  inline?: boolean;
}) {
  const isLeft = side === "left";
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.1, boxShadow: "0 0 28px color-mix(in srgb, var(--nike-accent) 60%, transparent)" }}
      whileTap={{ scale: 0.92 }}
      aria-label={isLeft ? "Previous player" : "Next player"}
      className={`${inline ? "relative" : ""} z-40 grid place-items-center rounded-full backdrop-blur-md`}
      style={{
        width: 50,
        height: 50,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.18)",
        color: "white",
      }}
    >
      <motion.svg
        width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        animate={{ x: isLeft ? [-2, 0, -2] : [2, 0, 2] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <path d={isLeft ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
      </motion.svg>
    </motion.button>
  );
}

function computeSplits(shots: { x: number; y: number; made: 0 | 1; xfg: number }[]) {
  if (shots.length === 0) {
    return [
      { label: "FG", value: "—" },
      { label: "3PT", value: "—" },
      { label: "MID", value: "—" },
      { label: "RIM", value: "—" },
    ];
  }
  const dist = (x: number, y: number) => Math.hypot(x, y) / 10;
  const inRange = (lo: number, hi: number) =>
    shots.filter((s) => {
      const d = dist(s.x, s.y);
      return d >= lo && d < hi;
    });
  const pct = (arr: typeof shots) =>
    arr.length === 0
      ? "—"
      : `${Math.round((arr.filter((s) => s.made === 1).length / arr.length) * 100)}%`;
  const threes = shots.filter((s) => dist(s.x, s.y) >= 22);
  const mids = inRange(10, 22);
  const rims = inRange(0, 4);
  return [
    { label: "FG", value: pct(shots) },
    { label: "3PT", value: pct(threes) },
    { label: "MID", value: pct(mids) },
    { label: "RIM", value: pct(rims) },
  ];
}
