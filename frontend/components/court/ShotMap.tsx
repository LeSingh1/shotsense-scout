"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { HalfCourt } from "./HalfCourt";
import { COURT, isThreePointer, shotDistFt } from "./court-dimensions";

export type ShotDatum = {
  x: number;
  y: number;
  made: 0 | 1;
  xfg: number;
  // Optional chronological fields used to order arc replays. When all four
  // are present we sort makes by (date asc, period asc, min desc, sec desc).
  // min/sec are NBA "remaining" — they decrease as game-time elapses.
  date?: string;
  p?: number;
  min?: number;
  sec?: number;
};

// ─── Arc/hoop overlay geometry ──────────────────────────────────────────────
//
// The floor SVG is CSS-rotated `rotateX(55deg)`, which foreshortens vertical
// movement by cos(55°). We render the arcs + 3D hoop in a SEPARATE overlay
// SVG that is NOT rotated — but we project floor positions through the same
// compression so the arcs visually emanate from the right dots. The hoop's
// backboard, rim and net are drawn ABOVE the floor's compressed hoop
// position so they look like they're standing up off the court.

const TILT_DEG = 55;
const TILT_COS = Math.cos((TILT_DEG * Math.PI) / 180);
const FLOOR_MID_Y = COURT.Y_MIN + COURT.H / 2;

/** Project a floor SVG y to its screen y under the rotateX(55deg) transform. */
function floorY(y: number): number {
  return FLOOR_MID_Y + (y - FLOOR_MID_Y) * TILT_COS;
}

// Hoop, drawn in the overlay above the floor.
const HOOP_FLOOR_Y = floorY(COURT.HOOP_Y); // where the dot floor-hoop appears
const RIM_FRONT_Y = 28; // visible rim front-edge — raised well above the floor
const RIM_BACK_Y = 16;
const BACKBOARD_TOP = -22;
const BACKBOARD_BOT = 14;
const BACKBOARD_HALF_W = 40;
const RIM_HALF_W = 20;
const NET_DEPTH = 22; // how far the net hangs below the rim
const ARC_END_Y = (RIM_FRONT_Y + RIM_BACK_Y) / 2;

const ARC_MAX = 18; // cap so the screen doesn't get cluttered
const ARC_DURATION = 1.5;
const ARC_INTERVAL = 0.28;
const ARC_HOLD = 0.8;
const ARC_GREEN = "#86efac"; // soft mint
const ARC_GREEN_BRIGHT = "#bbf7d0";

type Arc = {
  d: string;
  // Sampled points (already in overlay/screen-space coords) for the ball head.
  points: { x: number; y: number }[];
  delay: number;
};

function chronoKey(s: ShotDatum): number {
  // Combine date (YYYYMMDD), period, and remaining time into a sortable number.
  // Missing fields → 0, which still produces a stable ordering (insertion order
  // wins when sort is stable in modern engines).
  const date = s.date ? Number(s.date) : 0;
  const period = s.p ?? 0;
  // Remaining time DECREASES with elapsed time, so negate to make later
  // moments produce larger keys.
  const elapsed = -((s.min ?? 0) * 60 + (s.sec ?? 0));
  return date * 1e7 + period * 1e5 + elapsed;
}

function buildArcs(shots: ShotDatum[]): Arc[] {
  // All makes outside the immediate rim area — close-range layups/dunks
  // collapse into vertical lines and read as noise, not arcs.
  const makes = shots.filter((s) => s.made === 1 && shotDistFt(s.x, s.y) >= 8);
  if (makes.length === 0) return [];

  // Sort chronologically — the player's makes "replayed" in game order.
  const ordered = makes.slice().sort((a, b) => chronoKey(a) - chronoKey(b));

  // If there are more makes than the cap, sample evenly across the timeline
  // (first make, last make, and an even spread between) so we still cover the
  // whole series rather than just the opening minutes.
  let picked: ShotDatum[];
  if (ordered.length <= ARC_MAX) {
    picked = ordered;
  } else {
    picked = [];
    const step = (ordered.length - 1) / (ARC_MAX - 1);
    for (let i = 0; i < ARC_MAX; i++) {
      picked.push(ordered[Math.round(i * step)]);
    }
  }

  const arcs: Arc[] = [];
  for (let i = 0; i < picked.length; i++) {
    const s = picked[i];
    const sx = s.x;
    const sy = floorY(s.y); // compressed floor y so the arc origin lines up
                            // exactly with the visible green dot underneath
    const ex = COURT.HOOP_X;
    const ey = ARC_END_Y;

    // Apex sits well above the rim. Scale aggressively with distance so deep
    // threes get a tall, dramatic rainbow and short jumpers still arch
    // visibly rather than collapsing into a near-vertical line.
    const groundDist = Math.hypot(s.x - COURT.HOOP_X, s.y - COURT.HOOP_Y);
    const apexLift = 70 + groundDist * 0.24;
    // Clamp the apex so the highest arcs don't punch through the top of the
    // chart container (which is `overflow-hidden`). A 5-unit gutter keeps
    // the curve fully visible inside the viewBox.
    const apexY = Math.max(COURT.Y_MIN + 5, Math.min(sy, ey) - apexLift);
    // Cubic bezier with two control points — gives an asymmetric,
    // gravity-feeling arc instead of a symmetric rainbow.
    const cp1x = sx * 0.55 + ex * 0.45;
    const cp1y = apexY - 6;
    const cp2x = sx * 0.2 + ex * 0.8;
    const cp2y = apexY + 6;

    // Sample for the traveling ball head.
    const steps = 48;
    const points: { x: number; y: number }[] = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      const x =
        u * u * u * sx +
        3 * u * u * t * cp1x +
        3 * u * t * t * cp2x +
        t * t * t * ex;
      const y =
        u * u * u * sy +
        3 * u * u * t * cp1y +
        3 * u * t * t * cp2y +
        t * t * t * ey;
      points.push({ x, y });
    }

    arcs.push({
      d: `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${ex} ${ey}`,
      points,
      delay: i * ARC_INTERVAL,
    });
  }
  return arcs;
}

/**
 * Reusable shot scatter. NBA-native coordinates throughout — a shot at
 * (LOC_X=120, LOC_Y=240) plots at SVG (120, 240) with no conversion.
 *
 *   tilted=false (default): flat top-down, used for "Where they shot" + replay
 *   tilted=true:            CSS rotateX(55deg) — used for the Laboratory map
 *   arcs=true:              adds the animated arc-into-hoop overlay
 *                           (only meaningful when tilted=true)
 */
export function ShotMap({
  shots,
  mode = "result",
  accent = "#FF2D6F",
  onSelect,
  selectedIndex = null,
  tilted = false,
  arcs = false,
}: {
  shots: ShotDatum[];
  mode?: "result" | "residual";
  accent?: string;
  onSelect?: (i: number) => void;
  selectedIndex?: number | null;
  tilted?: boolean;
  arcs?: boolean;
}) {
  const [debug, setDebug] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    setDebug(sp.get("debug") === "1");
  }, []);

  const effectiveMode: "result" | "residual" | "debug" = debug ? "debug" : mode;
  const showArcs = tilted && arcs;
  const arcList = useMemo(() => (showArcs ? buildArcs(shots) : []), [shots, showArcs]);
  const loopDuration = arcList.length
    ? ARC_DURATION + (arcList.length - 1) * ARC_INTERVAL + ARC_HOLD
    : 0;

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      // Use getBoundingClientRect — in tilted mode the projected box (after
      // rotateX + perspective + translateY) is what the user sees, and we
      // want dots to spread across that visible area rather than be confined
      // to the unrotated layout box. Aesthetic preference over strict pixel
      // alignment with the SVG court lines.
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      // Match the SVG's preserveAspectRatio="xMidYMid meet" so dots align with
      // the court lines instead of being stretched non-uniformly.
      const scale = Math.min(w / COURT.W, h / COURT.H);
      const offX = (w - COURT.W * scale) / 2;
      const offY = (h - COURT.H * scale) / 2;
      const dotR = 6 * scale;
      const selR = 9 * scale;

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < shots.length; i++) {
        const s = shots[i];
        // Skip half-court heaves / data-entry outliers that would plot below
        // the court's visible bounds — there are only a handful of these and
        // they're indistinguishable from rendering bugs to a viewer.
        if (s.y < COURT.Y_MIN || s.y > COURT.Y_MIN + COURT.H) continue;
        const px = (s.x - COURT.X_MIN) * scale + offX;
        const py = (s.y - COURT.Y_MIN) * scale + offY;
        const r = selectedIndex === i ? selR : dotR;

        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = colorFor(s, effectiveMode);
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.strokeStyle = "#0a0a0a";
        ctx.lineWidth = 1.4 * scale;
        ctx.globalAlpha = 1;
        ctx.stroke();
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [shots, effectiveMode, selectedIndex]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelect || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scale = Math.min(rect.width / COURT.W, rect.height / COURT.H);
    const offX = (rect.width - COURT.W * scale) / 2;
    const offY = (rect.height - COURT.H * scale) / 2;
    const threshold = 14;

    let closest = -1;
    let minDist = threshold;
    for (let i = 0; i < shots.length; i++) {
      const px = (shots[i].x - COURT.X_MIN) * scale + offX;
      const py = (shots[i].y - COURT.Y_MIN) * scale + offY;
      const dist = Math.hypot(mx - px, my - py);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    if (closest >= 0) onSelect(closest);
  };

  return (
    <div
      className="relative w-full bg-[#0a0a0a] rounded-xl overflow-hidden ring-1 ring-white/5"
      style={{
        aspectRatio: tilted ? "16 / 9" : "500 / 470",
        perspective: tilted ? "1500px" : undefined,
      }}
    >
      {/* 3D stage — the floor. Rotated when tilted. */}
      <div
        className="absolute inset-0"
        style={{
          transform: tilted ? "rotateX(55deg) translateY(8%)" : undefined,
          transformOrigin: "center center",
          transformStyle: "preserve-3d",
        }}
      >
        <svg
          viewBox={`${COURT.X_MIN} ${COURT.Y_MIN} ${COURT.W} ${COURT.H}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <radialGradient id="rim-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="floor-wash" cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor={accent} stopOpacity={tilted ? "0.18" : "0.10"} />
              <stop offset="80%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>

          {tilted && (
            <rect
              x={COURT.X_MIN}
              y={COURT.Y_MIN}
              width={COURT.W}
              height={COURT.H}
              fill="url(#floor-wash)"
            />
          )}

          <circle cx={COURT.HOOP_X} cy={COURT.HOOP_Y} r={28} fill="url(#rim-glow)" />

          <HalfCourt stroke={tilted ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.22)"} />

          <circle
            cx={COURT.HOOP_X}
            cy={COURT.HOOP_Y}
            r={COURT.RIM_R + 0.5}
            stroke={accent}
            strokeOpacity={0.9}
            strokeWidth={2}
            fill="none"
          />

          {debug && (
            <g stroke="#ff00ff" strokeWidth="1" fill="none" strokeDasharray="4 3" opacity={0.75}>
              <circle cx={0} cy={0} r={COURT.ARC_R} />
              <line x1={-COURT.CORNER_X} y1={COURT.BASELINE_Y} x2={-COURT.CORNER_X} y2={COURT.MIDCOURT_Y} />
              <line x1={COURT.CORNER_X} y1={COURT.BASELINE_Y} x2={COURT.CORNER_X} y2={COURT.MIDCOURT_Y} />
            </g>
          )}
        </svg>

        {/* Canvas for shot dots — single paint call instead of 10k+ SVG elements */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: onSelect ? "pointer" : "default" }}
          onClick={onSelect ? handleCanvasClick : undefined}
        />
      </div>

      {/* Animated arcs + 3D hoop — non-rotated overlay so vertical motion isn't
          foreshortened. Only enabled in Laboratory mode (arcs=true). */}
      {showArcs && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ transform: "translateY(8%)" }}
        >
          <svg
            viewBox={`${COURT.X_MIN} ${COURT.Y_MIN} ${COURT.W} ${COURT.H}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 w-full h-full overflow-visible"
          >
            <defs>
              <filter id="arc-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Hoop — clean outlined backboard, small red rim, simple net.
                Matches the reference design rather than the over-styled
                glass-and-padding variant we had before. */}
            <g>
              {/* Backboard outline */}
              <rect
                x={-BACKBOARD_HALF_W}
                y={BACKBOARD_TOP}
                width={BACKBOARD_HALF_W * 2}
                height={BACKBOARD_BOT - BACKBOARD_TOP}
                fill="rgba(255,255,255,0.04)"
                stroke="rgba(255,255,255,0.65)"
                strokeWidth={1}
              />
              {/* Shooter's square */}
              <rect
                x={-12}
                y={BACKBOARD_BOT - 14}
                width={24}
                height={10}
                fill="none"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth={0.8}
              />

              {/* Rim — single thin red line for the front edge */}
              <line
                x1={-RIM_HALF_W}
                y1={RIM_FRONT_Y}
                x2={RIM_HALF_W}
                y2={RIM_FRONT_Y}
                stroke="#ef4444"
                strokeWidth={2}
                strokeLinecap="round"
              />

              {/* Net — straight vertical-ish spokes hanging from the rim */}
              {Array.from({ length: 9 }).map((_, k) => {
                const t = k / 8;
                const xTop = -RIM_HALF_W + t * RIM_HALF_W * 2;
                const xBot = -RIM_HALF_W * 0.5 + t * RIM_HALF_W;
                return (
                  <line
                    key={k}
                    x1={xTop}
                    y1={RIM_FRONT_Y}
                    x2={xBot}
                    y2={RIM_FRONT_Y + NET_DEPTH}
                    stroke="rgba(255,255,255,0.5)"
                    strokeWidth={0.5}
                  />
                );
              })}
            </g>

            {/* Arcs ------------------------------------------------------- */}
            <g filter="url(#arc-soft-glow)" style={{ mixBlendMode: "screen" }}>
              {arcList.map((arc, i) => (
                <ArcStreak key={`arc-${i}`} arc={arc} loopDuration={loopDuration} />
              ))}
            </g>
          </svg>
        </div>
      )}

      {/* Legend / HUD */}
      <div className="absolute bottom-3 right-3 flex items-center gap-4 text-[10px] uppercase tracking-[0.18em] text-white/55 bg-black/60 px-3 py-1.5 rounded-md backdrop-blur-sm z-10">
        {effectiveMode === "result" ? (
          <>
            <Swatch color="#34d399" label="Make" />
            <Swatch color="#f87171" label="Miss" />
          </>
        ) : effectiveMode === "residual" ? (
          <>
            <Swatch color="#60a5fa" label="Underperformed" />
            <Swatch color="#f87171" label="Tough make" />
          </>
        ) : (
          <>
            <Swatch color="#22d3ee" label="3PT zone" />
            <Swatch color="#e879f9" label="2PT zone" />
          </>
        )}
      </div>

      {debug && (
        <div className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.22em] text-fuchsia-300 bg-black/60 px-3 py-1.5 rounded-md backdrop-blur-sm z-10">
          Debug ON · magenta = reference arc + corner-3 lines
        </div>
      )}
    </div>
  );
}

function colorFor(s: ShotDatum, mode: "result" | "residual" | "debug"): string {
  if (mode === "debug") {
    return isThreePointer(s.x, s.y) ? "#22d3ee" : "#e879f9";
  }
  if (mode === "result") {
    return s.made === 1 ? "#34d399" : "#f87171";
  }
  const residual = s.made - s.xfg;
  return residual >= 0 ? "#f87171" : "#60a5fa";
}

function ArcStreak({ arc, loopDuration }: { arc: Arc; loopDuration: number }) {
  // Position the ball head along the path each frame.
  const [t, setT] = useState(-1);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      const local = (elapsed - arc.delay) % loopDuration;
      if (local < 0 || local > ARC_DURATION) {
        setT(-1);
      } else {
        setT(local / ARC_DURATION);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [arc.delay, loopDuration]);

  const headPos =
    t >= 0
      ? arc.points[Math.min(arc.points.length - 1, Math.floor(t * (arc.points.length - 1)))]
      : null;

  return (
    <g>
      <motion.path
        d={arc.d}
        fill="none"
        stroke={ARC_GREEN}
        strokeWidth={1.6}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{
          pathLength: [0, 1, 1, 1],
          opacity: [0, 0.85, 0.85, 0],
        }}
        transition={{
          duration: loopDuration,
          times: [
            0,
            ARC_DURATION / loopDuration,
            (ARC_DURATION + ARC_HOLD * 0.6) / loopDuration,
            1,
          ],
          delay: arc.delay,
          repeat: Infinity,
          ease: [0.32, 0.72, 0.36, 1],
        }}
      />
      {headPos && (
        <>
          <circle
            cx={headPos.x}
            cy={headPos.y}
            r={2.6}
            fill={ARC_GREEN_BRIGHT}
            opacity={0.95}
          />
          <circle
            cx={headPos.x}
            cy={headPos.y}
            r={5}
            fill={ARC_GREEN}
            opacity={0.25}
          />
        </>
      )}
    </g>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
