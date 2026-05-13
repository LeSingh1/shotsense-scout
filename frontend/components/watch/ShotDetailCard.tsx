"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { WatchClip } from "@/lib/watchClips";
import { WatchMiniCourt } from "./WatchMiniCourt";

type Props = {
  clip: WatchClip;
  library: readonly WatchClip[];
  onPick: (next: WatchClip) => void;
};

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Detail "scout card" for the current clip.
 *
 * Two-column composition:
 *   LEFT  — half-court diagram with the shot location plotted as a glowing
 *           dot. Makes the card read as a designed object, not a labeled grid.
 *   RIGHT — top strip (result + series + shuffle), oversized player name,
 *           shot-type subtitle, a clean 4-row spec sheet of the model inputs,
 *           and a single integrated verdict line.
 *
 * The right-rail ReleaseProfile still owns the headline xFG number, so this
 * card stays focused on context and copy.
 */
export function ShotDetailCard({ clip, library, onPick }: Props) {
  const reduce = useReducedMotion();
  const [libraryOpen, setLibraryOpen] = useState(false);

  const tone = clip.made
    ? {
        chipBorder: "rgba(52,211,153,0.55)",
        chipBg: "rgba(52,211,153,0.10)",
        chipFg: "#34D399",
        accent: "#34D399",
        verb: "drained it",
      }
    : {
        chipBorder: "color-mix(in srgb, var(--nike-accent) 55%, transparent)",
        chipBg: "color-mix(in srgb, var(--nike-accent) 10%, transparent)",
        chipFg: "var(--nike-accent)",
        accent: "var(--nike-accent)",
        verb: "rimmed out",
      };

  const pct = Math.round(clip.modelXfg * 100);

  const specs: Spec[] = [
    { label: "Where", value: clip.inputs.where },
    { label: "How", value: clip.inputs.how },
    { label: "When", value: clip.inputs.when },
    { label: "Spacing", value: clip.inputs.situation },
  ];

  return (
      <motion.article
        key={clip.id}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="
          relative overflow-hidden rounded-2xl
          border border-white/10
          bg-white/[0.02]
        "
      >

        <div className="relative grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6 md:gap-10 p-6 md:p-8">
          {/* LEFT — court diagram */}
          <div className="flex flex-col gap-4">
            <div className="text-[10px] uppercase tracking-[0.28em] font-mono text-white/40">
              Shot map
            </div>
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.08, ease: EASE }}
              className="
                rounded-xl border border-white/8
                bg-black/30 backdrop-blur-sm
                p-4
              "
            >
              <WatchMiniCourt
                x={clip.shotLocation.x}
                y={clip.shotLocation.y}
                made={clip.made}
                tone={tone.accent}
              />
            </motion.div>

            {/* Floor stats under the diagram */}
            <motion.dl
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
              className="flex items-baseline justify-between px-1"
            >
              <FloorStat
                label="Distance"
                value={`${Math.round(Math.hypot(clip.shotLocation.x, clip.shotLocation.y) / 10)} ft`}
              />
              <FloorStat
                label="Angle"
                value={`${Math.abs(Math.round((Math.atan2(clip.shotLocation.x, clip.shotLocation.y) * 180) / Math.PI))}°`}
              />
              <FloorStat label="Result" value={clip.made ? "Make" : "Miss"} valueColor={tone.accent} />
            </motion.dl>
          </div>

          {/* RIGHT — content */}
          <div className="flex flex-col">
            {/* Top strip */}
            <div className="flex items-start gap-3 flex-wrap">
              <ResultChip made={clip.made} tone={tone} />
              <SeriesLabel series={clip.series} />
              <div className="ml-auto flex flex-col items-end gap-2">
                <ShuffleButton
                  onClick={() => {
                    // Pick a random clip from the library other than the
                    // currently displayed one.
                    const others = library.filter((c) => c.id !== clip.id);
                    const next = others[Math.floor(Math.random() * others.length)];
                    if (next) onPick(next);
                  }}
                />
                <LibraryButton
                  count={library.length}
                  open={libraryOpen}
                  onClick={() => setLibraryOpen((v) => !v)}
                />
              </div>
            </div>

            {/* Headline */}
            <motion.h3
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1, ease: EASE }}
              className="mt-5 font-black leading-[0.92] tracking-[-0.025em] text-white"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(34px, 4vw, 56px)",
              }}
            >
              {clip.player}
            </motion.h3>
            <motion.div
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.18, ease: EASE }}
              className="mt-2 text-white/55 text-[14px]"
            >
              {clip.action}
            </motion.div>

            {/* Spec sheet */}
            <div className="mt-6 border-t border-white/8">
              <div className="text-[10px] uppercase tracking-[0.28em] font-mono text-white/40 pt-4 mb-1">
                What the model saw
              </div>
              <ul className="divide-y divide-white/[0.06]">
                {specs.map((spec, i) => (
                  <SpecRow
                    key={spec.label}
                    spec={spec}
                    delay={reduce ? 0 : 0.22 + i * 0.06}
                  />
                ))}
              </ul>
            </div>

            {/* Verdict */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.55, ease: EASE }}
              className="mt-6 pt-5 border-t border-white/8"
            >
              <div className="flex items-baseline justify-between gap-4 mb-3">
                <span className="text-[10px] uppercase tracking-[0.28em] font-mono text-white/45">
                  Model verdict
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-white/45 tabular-nums">
                  xFG · {pct}%
                </span>
              </div>
              {/* Probability bar */}
              <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={reduce ? { width: `${pct}%` } : { width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{
                    type: "spring",
                    stiffness: 60,
                    damping: 18,
                    delay: 0.65,
                  }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background: tone.accent,
                    boxShadow: `0 0 12px ${tone.accent}88`,
                  }}
                />
              </div>
              <p className="mt-3 text-[14px] leading-[1.55] text-white/75">
                Expected to fall{" "}
                <span
                  className="font-bold tabular-nums"
                  style={{ color: tone.accent }}
                >
                  {pct}%
                </span>{" "}
                of the time ·{" "}
                <span style={{ color: tone.accent }} className="font-semibold">
                  {clip.player.split(" ").pop()} {tone.verb}.
                </span>
              </p>
            </motion.div>
          </div>
        </div>

        {libraryOpen && (
          <LibraryPanel
            library={library}
            currentId={clip.id}
            onPick={(c) => {
              onPick(c);
              setLibraryOpen(false);
            }}
          />
        )}
      </motion.article>
  );
}

/* ───────────────────────────────────────────────────────── presenters */

type Spec = { label: string; value: string };

type Tone = {
  chipBorder: string;
  chipBg: string;
  chipFg: string;
  accent: string;
  verb: string;
};

function SpecRow({ spec, delay }: { spec: Spec; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      className="group flex items-baseline gap-6 py-3 px-1 hover:bg-white/[0.02] transition-colors -mx-1 rounded"
    >
      <dt className="w-[92px] shrink-0 text-[10px] uppercase tracking-[0.22em] font-mono text-white/45 group-hover:text-white/65 transition-colors">
        {spec.label}
      </dt>
      <dd className="text-[14px] text-white/90 leading-snug">{spec.value}</dd>
    </motion.li>
  );
}

function FloorStat({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[9px] uppercase tracking-[0.22em] font-mono text-white/40">
        {label}
      </dt>
      <dd
        className="text-[16px] font-bold tabular-nums mt-0.5"
        style={{
          color: valueColor ?? "#fff",
          fontFamily: "var(--font-display)",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </dd>
    </div>
  );
}

function GradeChip({ grade }: { grade: string }) {
  // Quick visual cue: green for A/A+, lime B, amber C, red D/F.
  const fg =
    grade === "A+" || grade === "A"
      ? "#34D399"
      : grade === "B"
      ? "#A3E635"
      : grade === "C"
      ? "#FBBF24"
      : grade === "D"
      ? "#F87171"
      : "#EF4444";
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-[0.22em]"
      style={{
        border: `1px solid ${fg}55`,
        background: `${fg}14`,
        color: fg,
      }}
      aria-label={`Shot grade ${grade}`}
    >
      Grade {grade}
    </motion.span>
  );
}

function ResultChip({ made, tone }: { made: boolean; tone: Tone }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="inline-flex items-center px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.22em]"
      style={{
        border: `1px solid ${tone.chipBorder}`,
        color: tone.chipFg,
      }}
    >
      {made ? "Make" : "Miss"}
    </motion.span>
  );
}

function SeriesLabel({ series }: { series: string }) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.06, ease: EASE }}
      className="text-[10px] uppercase tracking-[0.22em] text-white/55 font-mono"
    >
      {series}
    </motion.span>
  );
}

function ShuffleButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/75 hover:text-white hover:border-white/40 transition-colors"
      aria-label="Shuffle to a random clip"
    >
      <motion.svg
        viewBox="0 0 16 16"
        width="11"
        height="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden
        whileHover={{ rotate: 180 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <path d="M2 4h7l2.5 2.5M14 4l-2 2-2-2M2 12h7l2.5-2.5M14 12l-2-2-2 2" />
      </motion.svg>
      Shuffle clip
    </motion.button>
  );
}

function LibraryButton({
  count,
  open,
  onClick,
}: {
  count: number;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/75 hover:text-white hover:border-white/40 transition-colors"
      aria-expanded={open}
      aria-label={open ? "Close clip library" : "Browse clip library"}
    >
      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h11" />
      </svg>
      {open ? "Close library" : `Browse ${count} clips`}
    </motion.button>
  );
}

function LibraryPanel({
  library,
  currentId,
  onPick,
}: {
  library: readonly WatchClip[];
  currentId: string;
  onPick: (clip: WatchClip) => void;
}) {
  // Group clips by their series header so the user can navigate by game.
  const groups = library.reduce<Record<string, WatchClip[]>>((acc, c) => {
    (acc[c.series] ||= []).push(c);
    return acc;
  }, {});
  const seriesKeys = Object.keys(groups).sort();

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="border-t border-white/10 bg-black/30"
    >
      <div className="max-h-[420px] overflow-y-auto px-6 md:px-8 py-5 space-y-5">
        <div className="text-[10px] uppercase tracking-[0.24em] font-mono text-white/45">
          Library · {library.length} clips · {seriesKeys.length} games
        </div>
        {seriesKeys.map((series) => (
          <div key={series}>
            <div className="text-[10px] uppercase tracking-[0.2em] font-mono text-white/55 mb-2">
              {series}
            </div>
            <ul className="divide-y divide-white/5 rounded-md border border-white/8 bg-white/[0.02]">
              {groups[series].map((c) => {
                const isCurrent = c.id === currentId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onPick(c)}
                      disabled={isCurrent}
                      className="
                        w-full flex items-center gap-3 px-3 py-2 text-left text-[12px]
                        hover:bg-white/[0.04] transition-colors
                        disabled:bg-white/[0.06] disabled:cursor-default
                      "
                    >
                      <span className="font-medium text-white/90 min-w-[110px] truncate">
                        {c.player}
                      </span>
                      <span className="text-white/55 truncate flex-1">{c.action}</span>
                      <span
                        className="text-[10px] font-mono uppercase tracking-[0.18em] px-1.5 py-0.5 rounded shrink-0"
                        style={{ color: gradeColor(c.grade), borderColor: gradeColor(c.grade) + "55", border: "1px solid " + gradeColor(c.grade) + "33" }}
                      >
                        {c.grade}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] uppercase tracking-[0.2em] text-white/45 shrink-0">
                          playing
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function gradeColor(grade: string): string {
  return grade === "A+" || grade === "A"
    ? "#34D399"
    : grade === "B"
    ? "#A3E635"
    : grade === "C"
    ? "#FBBF24"
    : grade === "D"
    ? "#F87171"
    : "#EF4444";
}
