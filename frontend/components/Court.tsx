"use client";

import { useMemo, useState } from "react";
import type { HexData } from "@/lib/types";
import { cn, formatPercent } from "@/lib/format";
import { HexBin } from "./HexBin";

type Mode = "volume" | "fg" | "xfg";

type Props = {
  hex: HexData;
};

export function Court({ hex }: Props) {
  const [mode, setMode] = useState<Mode>("xfg");

  const domain = useMemo(() => {
    if (hex.bins.length === 0) return { min: 0, max: 1 };
    if (mode === "volume") {
      const ns = hex.bins.map((b) => b.n);
      return { min: Math.min(...ns), max: Math.max(...ns) };
    }
    const key = mode === "fg" ? "fg" : "xfg";
    const vals = hex.bins.map((b) => b[key as "fg" | "xfg"]);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [hex.bins, mode]);

  const { x_min, x_max, y_min, y_max } = hex.court_bounds;
  const W = x_max - x_min;
  const H = y_max - y_min;

  return (
    <section
      id="court"
      className="px-6 py-24 md:px-20 md:py-40"
      aria-labelledby="court-heading"
    >
      <header className="mb-12 flex flex-col items-baseline gap-6 border-b border-border pb-6 md:flex-row md:gap-12">
        <span className="num font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
          04 / Court
        </span>
        <h2
          id="court-heading"
          className="font-display text-[40px] font-medium leading-none tracking-[-0.03em] md:text-[64px]"
        >
          Where the model
          <br className="hidden md:block" /> finds value.
        </h2>
      </header>

      {/* Mode toggle */}
      <div
        className="mb-10 inline-flex border border-border"
        role="tablist"
        aria-label="Court value mode"
      >
        {(["volume", "fg", "xfg"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "num font-mono text-xs uppercase tracking-[0.10em] px-5 py-2.5 transition-colors",
              mode === m ? "bg-text text-bg" : "bg-transparent text-muted hover:text-text",
            )}
          >
            {m === "volume" ? "Volume" : m === "fg" ? "League FG%" : "League xFG%"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-12 md:grid-cols-[2fr_1fr]">
        <div className="text-muted">
          <svg
            viewBox={`${x_min} ${y_min} ${W} ${H}`}
            className="h-auto w-full max-w-[820px]"
            aria-label="NBA half-court hex shot chart"
            role="img"
          >
            {/* Court guide lines */}
            <g stroke="currentColor" strokeWidth="0.7" fill="none">
              {/* Three-point arc */}
              <path d={`M -220 0 L -220 140 A 237.5 237.5 0 0 1 220 140 L 220 0`} />
              {/* Paint */}
              <rect x={-80} y={0} width={160} height={190} />
              {/* Free-throw circle */}
              <circle cx={0} cy={190} r={60} />
              {/* Hoop */}
              <circle cx={0} cy={0} r={7.5} />
              {/* Half-court line */}
              <line x1={x_min} y1={y_max - 60} x2={x_max} y2={y_max - 60} />
            </g>

            {/* Hex bins */}
            {hex.bins.map((cell, i) => (
              <HexBin
                key={i}
                cell={cell}
                size={hex.hex_size}
                mode={mode}
                domain={domain}
              />
            ))}
          </svg>

          {/* Accessible table fallback */}
          <details className="mt-6 font-mono text-xs uppercase tracking-[0.08em] text-muted">
            <summary className="cursor-pointer">Show as table</summary>
            <table className="mt-3 w-full max-w-md border-collapse">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-1 pr-3">x</th>
                  <th className="py-1 pr-3">y</th>
                  <th className="py-1 pr-3">n</th>
                  <th className="py-1 pr-3">FG%</th>
                  <th className="py-1 pr-3">xFG%</th>
                </tr>
              </thead>
              <tbody>
                {hex.bins.slice(0, 80).map((c, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-0.5 pr-3">{c.cx}</td>
                    <td className="py-0.5 pr-3">{c.cy}</td>
                    <td className="py-0.5 pr-3">{c.n}</td>
                    <td className="py-0.5 pr-3">{formatPercent(c.fg)}</td>
                    <td className="py-0.5 pr-3">{formatPercent(c.xfg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>

        <aside className="font-mono text-xs leading-relaxed text-muted">
          <div className="mb-6 border-l border-border pl-4">
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.12em]">Legend</div>
            <p className="lowercase">
              Deeper lime = higher value in the current mode. Bins with fewer than 5
              shots are hidden to keep the picture trustworthy.
            </p>
          </div>
          <div className="mb-6 border-l border-border pl-4">
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.12em]">Volume</div>
            <p className="lowercase">how many shots came from this bin</p>
          </div>
          <div className="mb-6 border-l border-border pl-4">
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.12em]">League FG%</div>
            <p className="lowercase">actual make rate across all players</p>
          </div>
          <div className="border-l border-border pl-4">
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.12em]">League xFG%</div>
            <p className="lowercase">model-predicted make rate, before any player effect</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
