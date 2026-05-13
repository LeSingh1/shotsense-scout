"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { type FeaturedPlayer } from "@/lib/featured";
import { headshotUrl } from "@/lib/playerMeta";

/**
 * Hero player image with a robust fallback chain:
 *
 *   1. /public/players/{id}-action.png  — preferred (full-body cutout)
 *   2. /public/players/{id}.png         — legacy slot
 *   3. cdn.nba.com/headshots/.../{id}.png — official NBA CDN headshot
 *   4. <PlayerSilhouette /> — jersey number + team color, never blank
 *
 * Each stage is tried in order via `onError`. A shimmer skeleton renders
 * while the chosen src is loading so the user never sees an empty box.
 */
type Stage = "headshot" | "silhouette";

export function PlayerImage({ player }: { player: FeaturedPlayer }) {
  // Skip local /players/*.png slots — they don't exist and each 404 round-trip
  // delays the image by ~200ms × 2. Go straight to the NBA CDN headshot.
  const [stage, setStage] = useState<Stage>("headshot");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setStage("headshot");
    setLoaded(false);
  }, [player.id]);

  // Mouse-tracked 3D parallax tilt, spring-smoothed.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-200, 200], [6, -6]), { stiffness: 150, damping: 20 });
  const ry = useSpring(useTransform(mx, [-200, 200], [-6, 6]), { stiffness: 150, damping: 20 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left - r.width / 2);
    my.set(e.clientY - r.top - r.height / 2);
  };
  const handleLeave = () => { mx.set(0); my.set(0); };

  const src = stage === "headshot" ? headshotUrl(player.id) : null;

  const handleError = () => {
    setLoaded(false);
    if (stage === "headshot") setStage("silhouette");
  };

  return (
    <div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="relative w-full h-full flex items-end justify-center"
      style={{ perspective: 1400 }}
    >
      {/* Stage light — soft halo tinted to team accent */}
      <motion.div
        aria-hidden
        className="absolute top-[6%] left-1/2 -translate-x-1/2 w-[70%] h-[70%] rounded-full pointer-events-none"
        animate={{ opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in srgb, var(--nike-accent) 50%, transparent) 0%, transparent 68%)",
          filter: "blur(20px)",
          transition: "background 600ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />

      {/* Floor anchor shadow */}
      <div
        aria-hidden
        className="absolute bottom-[2%] left-1/2 -translate-x-1/2 w-[44%] h-3 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, color-mix(in srgb, var(--nike-accent) 70%, transparent) 0%, transparent 70%)",
          filter: "blur(6px)",
        }}
      />

      <motion.div
        key={player.id}
        initial={{ opacity: 0, y: 60, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full h-full flex items-end justify-center"
      >
        <motion.div
          style={{
            rotateX: rx,
            rotateY: ry,
            transformStyle: "preserve-3d",
            transformOrigin: "center bottom",
          }}
          className="relative w-full h-full flex items-end justify-center"
        >
          <motion.div
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
            className="relative w-full h-full flex items-end justify-center"
          >
            {/* Shimmer skeleton while the chosen src is still loading */}
            {!loaded && stage !== "silhouette" && <Shimmer />}

            {stage === "silhouette" ? (
              <PlayerSilhouette player={player} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src ?? ""}
                alt={player.fullName}
                onLoad={() => setLoaded(true)}
                onError={handleError}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="select-none pointer-events-none"
                style={{
                  height: "100%",
                  maxWidth: "100%",
                  objectFit: "contain",
                  objectPosition: "center bottom",
                  filter:
                    "drop-shadow(0 50px 70px rgba(0,0,0,0.7)) drop-shadow(0 0 36px color-mix(in srgb, var(--nike-accent) 32%, transparent))",
                  transform: "translateZ(40px)",
                  // For NBA CDN headshots, the white background needs to be
                  // blended into the dark hero. For uploaded action cutouts
                  // (transparent PNGs), pass through unaltered.
                  mixBlendMode: stage === "headshot" ? "lighten" : "normal",
                  maskImage:
                    stage === "headshot"
                      ? "linear-gradient(180deg, black 0%, black 65%, rgba(0,0,0,0.7) 82%, transparent 100%)"
                      : undefined,
                  WebkitMaskImage:
                    stage === "headshot"
                      ? "linear-gradient(180deg, black 0%, black 65%, rgba(0,0,0,0.7) 82%, transparent 100%)"
                      : undefined,
                  opacity: loaded ? 1 : 0,
                  transition: "opacity 400ms ease-out",
                }}
              />
            )}
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Shimmer placeholder — a wide vertical pill with a moving gradient sheen. */
function Shimmer() {
  return (
    <div className="absolute inset-x-[18%] inset-y-[8%] rounded-2xl overflow-hidden">
      <div className="absolute inset-0 bg-white/[0.025]" />
      <motion.div
        className="absolute inset-0"
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
        style={{
          background:
            "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)",
        }}
      />
    </div>
  );
}

/**
 * Final fallback — large stenciled jersey number in team color. Visible
 * whenever none of the image sources resolved. Same visual footprint as
 * a real action photo so the layout stays stable.
 */
function PlayerSilhouette({ player }: { player: FeaturedPlayer }) {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-end pb-[6%]">
      <div
        className="leading-none font-black select-none"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(280px, 38vh, 720px)",
          color: "transparent",
          WebkitTextStroke: "3px var(--nike-accent)",
          filter:
            "drop-shadow(0 0 40px color-mix(in srgb, var(--nike-accent) 45%, transparent)) drop-shadow(0 30px 50px rgba(0,0,0,0.7))",
          transform: "translateZ(40px)",
        }}
      >
        {player.jersey}
      </div>
      <div
        className="absolute inset-0 flex items-center justify-center pb-[6%]"
        aria-hidden
      >
        <span
          className="leading-none font-black select-none"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(280px, 38vh, 720px)",
            color: "color-mix(in srgb, var(--nike-accent) 35%, transparent)",
            mixBlendMode: "screen",
          }}
        >
          {player.jersey}
        </span>
      </div>
      <div
        className="mt-3 text-[10px] uppercase tracking-[0.28em] text-white/40 font-mono text-center"
        style={{ transform: "translateZ(20px)" }}
      >
        Drop transparent PNG at
        <br />
        <code className="text-white/55">/players/{player.id}-action.png</code>
      </div>
    </div>
  );
}
