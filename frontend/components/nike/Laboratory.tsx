"use client";

import { useMemo, useState } from "react";
import { FEATURED } from "@/lib/featured";
import { SCENARIOS, type Scenario, filterScenario, computeMetrics } from "@/lib/scenarios";
import type { ShotsMap } from "@/lib/types";
import { Court3DPlayer } from "../court/Court3DPlayer";

/**
 * Section 4 — "The Laboratory". A focused shot map for any featured player,
 * with a residual-color mode that surfaces shots that defied model expectation.
 *
 *   - "result"   — make = green, miss = red (default)
 *   - "residual" — blue = under-performed (high xFG, missed), red = tough make
 */
export function Laboratory({ shots }: { shots: ShotsMap }) {
  const [playerId, setPlayerId] = useState<number>(FEATURED[0].id);
  const [scenario, setScenario] = useState<Scenario>("overall");
  const [colorMode, setColorMode] = useState<"result" | "residual">("result");
  const player = FEATURED.find((p) => p.id === playerId)!;
  const entry = shots[String(playerId)];

  const filtered = useMemo(
    () => (entry ? filterScenario(entry.shots, scenario) : []),
    [entry, scenario],
  );
  const m = useMemo(() => computeMetrics(filtered), [filtered]);

  return (
    <section id="laboratory" className="relative bg-[#0f0f0f] text-white py-24 px-8 md:px-16">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-10 border-b border-white/10 pb-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-2">
              04 · The Laboratory
            </div>
            <h2
              className="font-bold leading-tight"
              style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px,3.5vw,48px)" }}
            >
              Shot map ·{" "}
              <span style={{ color: player.secondary }}>
                {player.firstName} {player.lastName}
              </span>
            </h2>
          </div>
          <div className="text-right text-xs text-white/50">
            <div>
              {m.nShots} shots · {scenario.replace("_", " ")}
            </div>
            <div className="mt-1">
              FG {(m.fg * 100).toFixed(1)}% · xFG {(m.xfg * 100).toFixed(1)}% · Δ{" "}
              {(m.delta * 100 >= 0 ? "+" : "")}
              {(m.delta * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 md:col-span-3 space-y-2">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-2">Player</div>
            {FEATURED.map((p) => {
              const ps = shots[String(p.id)]?.shots ?? [];
              const hasData = ps.length > 0;
              return (
                <button
                  key={p.id}
                  onClick={() => hasData && setPlayerId(p.id)}
                  disabled={!hasData}
                  className="w-full text-left px-3 py-2 rounded-md transition flex items-center gap-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: p.id === playerId ? "rgba(255,255,255,0.06)" : "transparent",
                    borderLeft: `3px solid ${p.id === playerId ? p.primary : "transparent"}`,
                  }}
                >
                  <span className="font-medium">
                    {p.firstName.charAt(0)}. {p.lastName}
                  </span>
                  <span className="ml-auto text-[10px] text-white/40 uppercase">{p.team}</span>
                </button>
              );
            })}

            <div className="pt-6 text-[11px] uppercase tracking-[0.2em] text-white/40 mb-2">
              Scenario
            </div>
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setScenario(s.id)}
                className="block w-full text-left px-3 py-1.5 text-xs rounded-md transition"
                style={{
                  background: s.id === scenario ? "rgba(255,255,255,0.06)" : "transparent",
                  color: s.id === scenario ? "#fff" : "rgba(255,255,255,0.55)",
                }}
              >
                {s.label}
              </button>
            ))}

            <div className="pt-6 text-[11px] uppercase tracking-[0.2em] text-white/40 mb-2">
              Color by
            </div>
            <div className="flex gap-1">
              {(["result", "residual"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setColorMode(m)}
                  className="flex-1 text-[11px] uppercase tracking-[0.16em] px-2 py-1.5 rounded-md transition border"
                  style={{
                    borderColor: colorMode === m ? "#fff" : "rgba(255,255,255,0.15)",
                    color: colorMode === m ? "#fff" : "rgba(255,255,255,0.55)",
                    background: colorMode === m ? "rgba(255,255,255,0.06)" : "transparent",
                  }}
                >
                  {m === "result" ? "Make/Miss" : "Residual"}
                </button>
              ))}
            </div>
          </div>

          {/* Shot map */}
          <div className="col-span-12 md:col-span-9">
            <Court3DPlayer shots={filtered} mode={colorMode} />
          </div>
        </div>
      </div>
    </section>
  );
}
