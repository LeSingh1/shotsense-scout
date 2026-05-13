"use client";

import { useMemo, useState } from "react";
import type { RankingRow } from "@/lib/types";

type SortKey = "shots" | "fg" | "xfg" | "delta" | "grade";

/** Derive a Shot Selection Grade from xFG (higher = took easier shots). */
function grade(xfg: number): string {
  if (xfg >= 0.55) return "A+";
  if (xfg >= 0.52) return "A";
  if (xfg >= 0.50) return "B+";
  if (xfg >= 0.48) return "B";
  if (xfg >= 0.45) return "C+";
  if (xfg >= 0.42) return "C";
  return "D";
}

export function Leaderboards({ ranking }: { ranking: RankingRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("delta");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const MIN_SHOTS = 25;

  const rows = useMemo(() => {
    const filtered = ranking.filter((r) => r.n_shots >= MIN_SHOTS);
    const sorted = [...filtered].sort((a, b) => {
      const get = (r: RankingRow) => {
        switch (sortKey) {
          case "shots": return r.n_shots;
          case "fg":    return r.actual_fg;
          case "xfg":   return r.mean_xfg;
          case "delta": return r.shrunk_delta;
          case "grade": return r.mean_xfg;
        }
      };
      const av = get(a), bv = get(b);
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return sorted.slice(0, 30);
  }, [ranking, sortKey, sortDir]);

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  return (
    <section id="leaderboards" className="bg-[#0f0f0f] text-white py-24 px-8 md:px-16">
      <div className="max-w-7xl mx-auto">
        <div className="border-b border-white/10 pb-5 mb-8">
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-2">
            06 · Leaderboards
          </div>
          <h2 className="font-bold leading-tight" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px,3.5vw,48px)" }}>
            Who beat the model?
          </h2>
          <p className="text-sm text-white/50 mt-3 max-w-2xl">
            Empirical-Bayes shrunk FG% over expected. Minimum {MIN_SHOTS} shots. Δ = actual − expected, regressed toward zero
            for low-sample players.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] text-white/50 border-b border-white/10">
                <th className="text-left py-3 px-3">#</th>
                <th className="text-left py-3 px-3">Player</th>
                <Sortable label="Shots" k="shots" sortKey={sortKey} dir={sortDir} onClick={toggle} />
                <Sortable label="FG%"   k="fg"    sortKey={sortKey} dir={sortDir} onClick={toggle} />
                <Sortable label="xFG%"  k="xfg"   sortKey={sortKey} dir={sortDir} onClick={toggle} />
                <Sortable label="Δ"     k="delta" sortKey={sortKey} dir={sortDir} onClick={toggle} />
                <Sortable label="Grade" k="grade" sortKey={sortKey} dir={sortDir} onClick={toggle} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.player_id} className="border-b border-white/5 hover:bg-[rgba(255,45,111,0.08)] transition">
                  <td className="py-3 px-3 text-white/40 tabular-nums">{i + 1}</td>
                  <td className="py-3 px-3 font-medium">{r.player_name}</td>
                  <td className="py-3 px-3 tabular-nums text-white/80">{r.n_shots}</td>
                  <td className="py-3 px-3 tabular-nums text-white/80">{(r.actual_fg * 100).toFixed(1)}</td>
                  <td className="py-3 px-3 tabular-nums text-white/80">{(r.mean_xfg * 100).toFixed(1)}</td>
                  <td className="py-3 px-3 tabular-nums font-semibold" style={{ color: r.shrunk_delta >= 0 ? "rgb(120,255,180)" : "rgb(255,120,140)" }}>
                    {r.shrunk_delta >= 0 ? "+" : "−"}{Math.abs(r.shrunk_delta * 100).toFixed(1)}
                  </td>
                  <td className="py-3 px-3 font-bold" style={{ color: "#FF2D6F" }}>{grade(r.mean_xfg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Sortable({
  label, k, sortKey, dir, onClick,
}: { label: string; k: SortKey; sortKey: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void }) {
  const active = sortKey === k;
  return (
    <th className="text-left py-3 px-3">
      <button onClick={() => onClick(k)} className={`inline-flex items-center gap-1 ${active ? "text-white" : "text-white/50 hover:text-white/80"}`}>
        {label}{active && <span>{dir === "desc" ? "↓" : "↑"}</span>}
      </button>
    </th>
  );
}
