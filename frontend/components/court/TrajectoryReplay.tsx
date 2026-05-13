"use client";

import { motion, AnimatePresence } from "motion/react";
import { HalfCourt } from "./HalfCourt";
import { COURT, shotDistFt } from "./court-dimensions";
import type { ShotDatum } from "./ShotMap";

/**
 * Trajectory replay — flat top-down half-court (NOT tilted) with a stylized
 * parabolic arc from the shooter's spot to the hoop.
 *
 *   peakY = midY − distance × 1.2
 *
 * Negative SVG y is upward, so subtracting distance lifts the control point
 * above the chord. The viewBox is extended UPWARD (above the baseline) so
 * the arc has room to breathe — long-range arcs reach ~300 units above the
 * baseline.
 */

// Extended viewBox: same width and height as the court PLUS extra vertical
// space above the baseline so the arc apex isn't clipped on long shots.
const PAD_ABOVE = 320;
const VB_X = COURT.X_MIN;
const VB_Y = COURT.Y_MIN - PAD_ABOVE;
const VB_W = COURT.W;
const VB_H = COURT.H + PAD_ABOVE;

export function TrajectoryReplay({
  shot,
  playerName,
}: {
  shot: ShotDatum | null;
  playerName: string;
}) {
  if (!shot) {
    return (
      <div
        className="w-full rounded-xl ring-1 ring-white/5 bg-[#0a0a0a] grid place-items-center text-white/30 text-xs uppercase tracking-[0.18em]"
        style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
      >
        Pick a shot to watch it fly.
      </div>
    );
  }

  const shotX = shot.x;
  const shotY = shot.y;
  const hoopX = COURT.HOOP_X;
  const hoopY = COURT.HOOP_Y;

  const isMake = shot.made === 1;
  const color = isMake ? "#34d399" : "#f87171";

  const midX = (shotX + hoopX) / 2;
  const midY = (shotY + hoopY) / 2;
  const distance = Math.hypot(shotX - hoopX, shotY - hoopY);
  const peakY = midY - distance * 1.2; // negative direction = upward, lifts the arc

  const path = `M ${shotX} ${shotY} Q ${midX} ${peakY} ${hoopX} ${hoopY}`;

  // Identity key — remounts the SVG and replays the animation on every pick.
  const key = `${shot.x}-${shot.y}-${shot.made}-${shot.xfg}`;
  const dist = shotDistFt(shot.x, shot.y);
  const angle = Math.round((Math.atan2(shot.x, shot.y) * 180) / Math.PI);

  return (
    <div
      className="relative w-full rounded-xl ring-1 ring-white/5 overflow-hidden bg-[#0a0a0a]"
      style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
    >
      <AnimatePresence mode="wait">
        <motion.svg
          key={key}
          viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <defs>
            <radialGradient id="replay-rim-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor={color} stopOpacity={isMake ? 0.7 : 0.3} />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
            <filter id="replay-glow">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Rim halo */}
          <circle cx={COURT.HOOP_X} cy={COURT.HOOP_Y} r={38} fill="url(#replay-rim-glow)" />

          <HalfCourt stroke="rgba(255,255,255,0.22)" />

          {/* Rim emphasized in shot color */}
          <circle cx={COURT.HOOP_X} cy={COURT.HOOP_Y} r={COURT.RIM_R + 0.5} stroke={color} strokeWidth="2" fill="none" />

          {/* Shooter origin — expanding pulse */}
          <motion.circle
            cx={shotX}
            cy={shotY}
            r={6}
            fill={color}
            opacity={0.6}
            initial={{ r: 0, opacity: 0 }}
            animate={{ r: [0, 22, 0], opacity: [0, 0.6, 0] }}
            transition={{ duration: 1.3, ease: "easeOut" }}
          />
          <motion.circle
            cx={shotX}
            cy={shotY}
            r={6}
            fill={color}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3 }}
          />

          {/* THE PARABOLA */}
          <motion.path
            d={path}
            stroke={color}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.4, delay: 0.2, ease: "easeOut" }}
            filter="url(#replay-glow)"
          />

          {/* Ball traveling along the arc */}
          <motion.circle
            r={6}
            fill="#ffffff"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.6, delay: 0.2, times: [0, 0.05, 0.92, 1] }}
            style={{ filter: `drop-shadow(0 0 10px ${color})` }}
          >
            <animateMotion dur="1.4s" begin="0.2s" fill="freeze" path={path} />
          </motion.circle>

          {/* Rim impact pulse — green ring on make, red flash on miss */}
          <motion.circle
            cx={COURT.HOOP_X}
            cy={COURT.HOOP_Y}
            r={10}
            fill="none"
            stroke={color}
            strokeWidth={2}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 2.4, 3.2], opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.9, delay: 1.5, ease: "easeOut" }}
          />
        </motion.svg>
      </AnimatePresence>

      {/* HUD overlay */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/55">
          Replay · {playerName}
        </div>
        <motion.div
          key={key + "-tag"}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4, duration: 0.45 }}
          className="text-right"
        >
          <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color }}>
            {isMake ? "MAKE" : "MISS"}
          </div>
          <div
            className="font-bold tabular-nums text-2xl mt-0.5"
            style={{ fontFamily: "var(--font-display)", color: "#fff" }}
          >
            {Math.round(shot.xfg * 100)}%
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            xFG · model
          </div>
        </motion.div>
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none text-[10px] uppercase tracking-[0.22em] text-white/45">
        <span>
          {dist.toFixed(1)} ft · angle {angle}°
        </span>
        <span>
          residual{" "}
          {(shot.made - shot.xfg) >= 0 ? "+" : "−"}
          {Math.abs((shot.made - shot.xfg) * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
