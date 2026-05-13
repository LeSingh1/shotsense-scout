"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { ShotsMap } from "@/lib/types";
import { ShotMap, type ShotDatum } from "../court/ShotMap";

type Mode = "all" | "makes" | "misses";

/**
 * "Where they shot" — tilted half-court shot scatter for all players combined.
 */
export function WhereTheyShot({ shots }: { shots: ShotsMap }) {
  const [mode, setMode] = useState<Mode>("all");

  const allShots: ShotDatum[] = useMemo(
    () => Object.values(shots).flatMap((e) => e?.shots ?? []),
    [shots],
  );

  const filtered = useMemo(() => {
    if (mode === "makes") return allShots.filter((s) => s.made === 1);
    if (mode === "misses") return allShots.filter((s) => s.made === 0);
    return allShots;
  }, [allShots, mode]);

  const madeCount = allShots.filter((s) => s.made === 1).length;

  return (
    <section
      id="where-they-shot"
      className="relative bg-[#0a0a0a] text-white py-24 px-8 md:px-16 overflow-hidden"
    >
      <div className="relative max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 border-b border-white/10 pb-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-2">
              02 · Shot Map
            </div>
            <h2
              className="font-bold leading-tight"
              style={{ fontFamily: "var(--font-display)", fontSize: "clamp(36px,4.5vw,72px)" }}
            >
              Where they shot.
            </h2>
            <p className="text-sm text-white/55 mt-3 max-w-2xl">
              Every playoff attempt across every player, plotted on a tilted half-court.
              Green = make, red = miss. Filter by outcome with the tabs.
            </p>
          </div>

          {/* Mode tabs */}
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            {(["all", "makes", "misses"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="relative px-5 py-2 text-xs uppercase tracking-[0.18em] rounded-full"
              >
                {mode === m && (
                  <motion.span
                    layoutId="wts-mode-pill"
                    className="absolute inset-0 rounded-full bg-[#FF2D6F]"
                    transition={{ type: "spring", stiffness: 280, damping: 28 }}
                  />
                )}
                <span
                  className="relative"
                  style={{ color: mode === m ? "#fff" : "rgba(255,255,255,0.55)" }}
                >
                  {m === "all" ? "All shots" : m === "makes" ? "Makes" : "Misses"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <ShotMap shots={filtered} mode="result" tilted />

        <div className="mt-4 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-white/40">
          <AnimatePresence mode="wait">
            <motion.span
              key={mode}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
            >
              {filtered.length} {mode === "all" ? "attempts" : mode} · {madeCount}/{allShots.length} made overall
            </motion.span>
          </AnimatePresence>
          <span>tilted · official NBA half-court dimensions</span>
        </div>
      </div>
    </section>
  );
}
