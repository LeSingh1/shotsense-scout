"use client";

import { useMemo, useState } from "react";
import type { ShotsMap, RankingRow } from "@/lib/types";
import { FEATURED } from "@/lib/featured";

/**
 * Section 3 — "The Stress Test". Live shot probability simulator.
 *
 * Honest note on methodology: this site is statically exported (no backend),
 * so we don't call the XGBoost model at runtime. Instead the simulator
 * estimates xFG% by:
 *   1. kNN-style bin lookup over the actual playoff shots (distance + angle)
 *   2. additive heuristic adjustments for defender proximity & shot clock
 *      since those features are NOT in the trained model (no tracking data
 *      in the 2025-26 shotchartdetail endpoint), the slider effects are
 *      derived from public-domain shot-quality literature.
 *   3. a per-shooter prior baked from each player's mean xFG and ranking delta
 *
 * The breakdown panel shows the contribution of each factor, mimicking a SHAP
 * waterfall in plain English.
 */
export function StressTest({ shots, ranking }: { shots: ShotsMap; ranking: RankingRow[] }) {
  const [shooterId, setShooterId] = useState<number>(FEATURED[0].id);
  const [distance, setDistance] = useState<number>(24);      // feet
  const [angle, setAngle] = useState<number>(0);             // -90..90 deg
  const [defender, setDefender] = useState<number>(5);       // feet (closest defender, hypothetical)
  const [shotClock, setShotClock] = useState<number>(14);    // seconds remaining

  const shooter = FEATURED.find((p) => p.id === shooterId)!;

  const { prob, breakdown } = useMemo(() => {
    // 1. League-wide bin estimate from actual shots
    let leagueXfgSum = 0;
    let count = 0;
    const angleRad = (angle * Math.PI) / 180;
    const tx = Math.sin(angleRad) * distance * 10;   // back to court units
    const ty = Math.cos(angleRad) * distance * 10;
    const TOL = 35; // ~3.5 ft tolerance
    for (const playerKey in shots) {
      for (const s of shots[playerKey].shots) {
        const d = Math.hypot(s.x - tx, s.y - ty);
        if (d < TOL) {
          leagueXfgSum += s.xfg;
          count++;
        }
      }
    }
    const leagueXfg = count > 0 ? leagueXfgSum / count : (distance < 22 ? 0.45 : 0.36);

    // 2. Per-shooter prior — pull from the ranking row
    const r = ranking.find((row) => row.player_id === shooterId);
    const shooterDelta = r ? r.shrunk_delta : 0; // EB-shrunk over-expected
    const shooterBoost = Math.max(-0.06, Math.min(0.06, shooterDelta * 0.6));

    // 3. Defender proximity heuristic (literature: ~−18% from open to tight)
    //    Open (6+ ft) baseline 0; tight (<2 ft) ≈ −0.10
    const defAdj = Math.max(-0.12, Math.min(0.06, (defender - 4) * 0.025));

    // 4. Shot clock heuristic (late clock heaves penalty)
    //    14+ s ≈ 0, 4 s ≈ −0.05, 1 s ≈ −0.12
    const clockAdj = Math.max(-0.13, Math.min(0.02, (shotClock - 7) * 0.012));

    let p = leagueXfg + shooterBoost + defAdj + clockAdj;
    p = Math.max(0.03, Math.min(0.92, p));

    return {
      prob: p,
      breakdown: [
        { label: `League xFG at ${distance.toFixed(0)}ft / ${angle.toFixed(0)}°`, value: leagueXfg, kind: "base" as const },
        { label: `Shooter prior · ${shooter.lastName}`, value: shooterBoost, kind: "delta" as const },
        { label: `Defender ${defender < 3 ? "tight" : defender > 6 ? "open" : "average"} (${defender.toFixed(1)} ft)`, value: defAdj, kind: "delta" as const },
        { label: `Shot clock ${shotClock < 4 ? "late" : shotClock > 14 ? "fresh" : "mid"} (${shotClock.toFixed(0)} s)`, value: clockAdj, kind: "delta" as const },
      ],
    };
  }, [shooterId, distance, angle, defender, shotClock, shots, ranking, shooter.lastName]);

  const dangerous = prob < 0.25;

  return (
    <section id="stress-test" className="bg-[#1a1a1a] text-white py-24 px-8 md:px-16">
      <div className="max-w-7xl mx-auto">
        <div className="border-b border-white/10 pb-5 mb-10">
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-2">
            05 · The Stress Test
          </div>
          <h2 className="font-bold leading-tight" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px,3.5vw,48px)" }}>
            Live shot probability
          </h2>
          <p className="text-sm text-white/50 mt-3 max-w-2xl">
            Move the sliders. The gauge updates in real time. Defender proximity and shot clock are heuristic add-ons; the
            model itself doesn&apos;t see them (not in the free endpoints).
          </p>
        </div>

        <div className="grid grid-cols-12 gap-10 items-start">
          <div className="col-span-12 md:col-span-5 space-y-6">
            <Picker label="Shooter" value={String(shooterId)} onChange={(v) => setShooterId(Number(v))}
              options={FEATURED.map((p) => ({ value: String(p.id), label: `${p.firstName} ${p.lastName}` }))}/>
            <Slider label="Distance (ft)" value={distance} min={2} max={32} step={0.5} onChange={setDistance} />
            <Slider label="Angle (°)" value={angle} min={-60} max={60} step={1} onChange={setAngle} />
            <Slider label="Defender distance (ft)" value={defender} min={0} max={10} step={0.5} onChange={setDefender} />
            <Slider label="Shot clock (s)" value={shotClock} min={0} max={24} step={1} onChange={setShotClock} />
          </div>

          <div className="col-span-12 md:col-span-3 flex justify-center">
            <Gauge value={prob} danger={dangerous} accent={shooter.primary} />
          </div>

          <div className="col-span-12 md:col-span-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3">Why</div>
            <ol className="space-y-2 text-sm">
              {breakdown.map((b, i) => (
                <li key={i} className="flex justify-between items-center border-b border-white/5 py-2">
                  <span className="text-white/80">{b.label}</span>
                  <span
                    className="font-mono text-xs tabular-nums"
                    style={{
                      color:
                        b.kind === "base"
                          ? "rgba(255,255,255,0.85)"
                          : b.value > 0
                          ? "rgb(120,255,180)"
                          : "rgb(255,120,140)",
                    }}
                  >
                    {b.kind === "base"
                      ? `${(b.value * 100).toFixed(0)}%`
                      : `${b.value >= 0 ? "+" : ""}${(b.value * 100).toFixed(1)}%`}
                  </span>
                </li>
              ))}
              <li className="flex justify-between items-center pt-3 mt-1 border-t border-white/20">
                <span className="text-white font-semibold uppercase tracking-wider text-xs">Net xFG%</span>
                <span className="font-mono font-bold text-lg" style={{ color: shooter.primary }}>
                  {(prob * 100).toFixed(1)}%
                </span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function Slider({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs uppercase tracking-wider text-white/60 mb-1.5">
        <span>{label}</span>
        <span className="font-mono text-white">{value}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--nike-accent,#FF2D6F)]"
      />
    </label>
  );
}

function Picker({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-white/60 mb-1.5">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#262626] border border-white/15 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Gauge({ value, danger, accent }: { value: number; danger: boolean; accent: string }) {
  const pct = Math.round(value * 100);
  const radius = 88;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - value);
  return (
    <div className="relative w-[220px] h-[220px]">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        <circle cx="100" cy="100" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="14" fill="none" />
        <circle
          cx="100" cy="100" r={radius}
          stroke={danger ? "#ff4040" : accent}
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1), stroke 300ms",
            filter: danger ? "drop-shadow(0 0 14px #ff4040)" : `drop-shadow(0 0 14px ${accent})`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={`font-bold tabular-nums ${danger ? "animate-pulse" : ""}`}
          style={{ fontFamily: "var(--font-display)", fontSize: 52, color: danger ? "#ff4040" : "#fff", lineHeight: 1 }}
        >
          {pct}%
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/50 mt-1">Make probability</div>
      </div>
    </div>
  );
}
