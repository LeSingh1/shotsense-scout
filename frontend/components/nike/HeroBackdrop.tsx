"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo, useState } from "react";

/**
 * 5-layered parallax backdrop for the hero. Each layer responds to mouse
 * position with a different multiplier so the scene reads as 3D depth.
 *
 *   Layer 1 (-12px range): Massive ghost typography of the last name
 *   Layer 2 (-22px range): Diagonal stripes in team gradient
 *   Layer 3 (-32px range): Wireframe court in 3D perspective (the "stage")
 *   Layer 4 (-44px range): Floating particle motes
 *   Layer 5 (-60px range): Smoke blob in the bottom corner
 *
 * Each layer also has its own slow ambient drift so the scene doesn't go
 * dead when the cursor is still.
 */
export function HeroBackdrop({ lastName }: { lastName: string }) {
  // Mouse position normalized to [-1, 1] over the viewport.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 60, damping: 18, mass: 0.8 });
  const smy = useSpring(my, { stiffness: 60, damping: 18, mass: 0.8 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      mx.set(x);
      my.set(y);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my]);

  // Per-layer transforms — multipliers grow with depth-to-camera.
  const l1x = useTransform(smx, (v) => v * -12);
  const l1y = useTransform(smy, (v) => v * -8);
  const l2x = useTransform(smx, (v) => v * -22);
  const l2y = useTransform(smy, (v) => v * -14);
  const l3x = useTransform(smx, (v) => v * -32);
  const l3y = useTransform(smy, (v) => v * -22);
  const l4x = useTransform(smx, (v) => v * -44);
  const l5x = useTransform(smx, (v) => v * -60);
  const l5y = useTransform(smy, (v) => v * -40);

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* LAYER 1 — Ghost typography */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        style={{ x: l1x, y: l1y }}
      >
        <motion.span
          className="font-bold uppercase whitespace-nowrap select-none"
          animate={{ x: ["-1.5%", "1.5%", "-1.5%"] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(180px, 28vw, 480px)",
            lineHeight: 1,
            letterSpacing: "-0.05em",
            color: "transparent",
            WebkitTextStroke: "1.5px color-mix(in srgb, var(--nike-accent, #FF2D6F) 32%, transparent)",
            opacity: 0.7,
            transition: "all 600ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {lastName.toUpperCase()}
        </motion.span>
      </motion.div>

      {/* LAYER 2 — Diagonal team stripes */}
      <motion.div
        className="absolute inset-0"
        style={{ x: l2x, y: l2y, filter: "blur(2px)" }}
      >
        <div
          className="absolute -left-1/4 top-[18%] w-[150%] h-44 -rotate-[22deg]"
          style={{
            background:
              "linear-gradient(90deg, transparent 5%, var(--nike-accent) 30%, var(--nike-secondary) 70%, transparent 95%)",
            opacity: 0.15,
            transition: "background 600ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
        <div
          className="absolute -left-1/4 top-[55%] w-[150%] h-28 -rotate-[19deg]"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--nike-secondary), transparent)",
            opacity: 0.12,
            transition: "background 600ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
        <div
          className="absolute -left-1/4 top-[78%] w-[150%] h-20 -rotate-[20deg]"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in srgb, var(--nike-accent) 50%, white), transparent)",
            opacity: 0.07,
          }}
        />
      </motion.div>

      {/* LAYER 3 — Wireframe court stage at the player's feet, in 3D */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 w-[70vw] max-w-[1100px] aspect-[2/1]"
        style={{
          bottom: "12%",
          x: l3x,
          y: l3y,
          perspective: 900,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: "rotateX(68deg)",
            transformOrigin: "center center",
            transformStyle: "preserve-3d",
          }}
        >
          <svg
            viewBox="-260 -50 520 480"
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full"
            style={{ color: "var(--nike-accent)" }}
          >
            <defs>
              <linearGradient id="court-fade" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%"  stopColor="var(--nike-accent)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--nike-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x={-260} y={-50} width={520} height={480} fill="url(#court-fade)" opacity={0.18} />
            <g stroke="currentColor" strokeOpacity="0.32" strokeWidth="2" fill="none">
              <path d="M -220 -50 L -220 89.5 A 237.5 237.5 0 0 1 220 89.5 L 220 -50" />
              <rect x={-80} y={-50} width={160} height={190} />
              <path d="M -60 140 A 60 60 0 0 1 60 140" />
              <path d="M -60 140 A 60 60 0 0 0 60 140" strokeDasharray="6 4" />
              <circle cx={0} cy={0} r={7.5} stroke="currentColor" strokeOpacity="0.6" />
              <line x1={-260} y1={-50} x2={260} y2={-50} />
            </g>
          </svg>
        </div>
      </motion.div>

      {/* LAYER 4 — Floating particle motes */}
      <Particles xMotion={l4x} />

      {/* LAYER 5 — Smoke blob in the bottom-left corner */}
      <motion.div
        className="absolute -bottom-32 -left-32 w-[540px] h-[540px] rounded-full blur-3xl"
        style={{
          x: l5x,
          y: l5y,
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--nike-accent) 75%, #FF2D6F) 0%, transparent 70%)",
          opacity: 0.55,
          transition: "background 600ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
      {/* Mirror blob top-right for balance */}
      <motion.div
        className="absolute -top-40 -right-40 w-[480px] h-[480px] rounded-full blur-3xl"
        style={{
          x: useTransform(smx, (v) => v * -50),
          y: useTransform(smy, (v) => v * -30),
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--nike-secondary) 70%, #FF2D6F) 0%, transparent 70%)",
          opacity: 0.32,
          transition: "background 600ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />

      {/* Scanline texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)",
        }}
      />
    </div>
  );
}

/**
 * 30 small particle motes drifting upward at slightly different speeds.
 * Positions and durations are deterministic so SSR markup matches client.
 */
function Particles({
  xMotion,
}: {
  xMotion: ReturnType<typeof useTransform<number, number>>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const motes = useMemo(() => {
    // Seeded "random" — keeps SSR stable.
    const out: { left: number; size: number; delay: number; duration: number; opacity: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const r = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const r2 = (Math.sin(i * 78.233) * 43758.5453) % 1;
      const r3 = (Math.sin(i * 41.31) * 43758.5453) % 1;
      out.push({
        left: Math.abs(r) * 100,
        size: 1.5 + Math.abs(r2) * 2.5,
        delay: Math.abs(r3) * 8,
        duration: 10 + Math.abs(r2) * 12,
        opacity: 0.3 + Math.abs(r) * 0.5,
      });
    }
    return out;
  }, []);
  if (!mounted) return null;
  return (
    <motion.div className="absolute inset-0" style={{ x: xMotion }}>
      {motes.map((m, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${m.left}%`,
            bottom: "-10%",
            width: m.size,
            height: m.size,
            background: "var(--nike-accent)",
            opacity: m.opacity,
            filter: "blur(0.5px)",
          }}
          animate={{
            y: ["0%", "-110vh"],
            opacity: [0, m.opacity, m.opacity, 0],
          }}
          transition={{
            duration: m.duration,
            delay: m.delay,
            repeat: Infinity,
            ease: "linear",
            times: [0, 0.1, 0.9, 1],
          }}
        />
      ))}
    </motion.div>
  );
}
