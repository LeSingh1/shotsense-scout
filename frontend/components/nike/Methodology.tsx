"use client";

import type { CalibrationData, FoldMetrics, Meta } from "@/lib/types";

/**
 * Section 5 — "Methodology". Calibration curve, fold-level model lift, and
 * the written caveats that matter most: missing tracking features, sample
 * size, scenario proxies. Plus the actual feature importance the model uses.
 */
export function Methodology({
  meta,
  fold,
  calibration,
}: {
  meta: Meta;
  fold: FoldMetrics;
  calibration: CalibrationData;
}) {
  return (
    <section id="methodology" className="bg-[#1a1a1a] text-white py-24 px-8 md:px-16">
      <div className="max-w-7xl mx-auto">
        <div className="border-b border-white/10 pb-5 mb-12">
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-2">
            07 · Methodology
          </div>
          <h2 className="font-bold leading-tight" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px,3.5vw,48px)" }}>
            What matters most to our model
          </h2>
        </div>

        <div className="grid grid-cols-12 gap-10">
          {/* Feature importance */}
          <div className="col-span-12 md:col-span-6">
            <h3 className="text-sm uppercase tracking-wider text-white/60 mb-4">Feature signal</h3>
            <FeatureBars />
            <p className="text-xs text-white/40 mt-3 leading-relaxed">
              Approximate global importance from the XGBoost gain split. The model trains on shot location, action type
              (target-encoded), period, time-left, home/away, and per-shooter season FG splits. Defender distance and
              shot clock are not available per-shot in the free 2025-26 endpoints, so the model does not see them.
            </p>
          </div>

          {/* Calibration curve */}
          <div className="col-span-12 md:col-span-6">
            <h3 className="text-sm uppercase tracking-wider text-white/60 mb-4">Calibration</h3>
            <CalibrationCurve deciles={calibration.deciles} />
            <p className="text-xs text-white/40 mt-3 leading-relaxed">
              Predicted probability vs. observed make rate, binned into {calibration.n_bins} deciles. Max deviation
              {" "}{(calibration.max_deviation * 100).toFixed(1)}%. Diagonal = perfect calibration.
            </p>
          </div>

          {/* Stats row */}
          <div className="col-span-12 grid grid-cols-2 md:grid-cols-5 gap-6 pt-6 border-t border-white/10">
            <Stat label="Season"       value={meta.season} />
            <Stat label="Shots"        value={meta.n_shots.toLocaleString()} />
            <Stat label="Players"      value={String(meta.n_players)} />
            <Stat label="Baseline LL"  value={meta.baseline_mean_log_loss.toFixed(4)} />
            <Stat label="XGB LL"       value={`${meta.xgb_mean_log_loss.toFixed(4)} (−${(meta.xgb_lift * 100).toFixed(1)}%)`} />
          </div>

          {/* Fold table */}
          <div className="col-span-12">
            <h3 className="text-sm uppercase tracking-wider text-white/60 mb-4">GroupKFold by game</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {fold.xgb.map((f) => (
                <div key={f.fold} className="bg-white/[0.04] rounded-md px-4 py-3 ring-1 ring-white/5">
                  <div className="text-[10px] uppercase tracking-wider text-white/50">Fold {f.fold}</div>
                  <div className="font-mono text-lg mt-1">{f.log_loss.toFixed(4)}</div>
                  <div className="text-xs text-white/40 mt-1">AUC {f.auc.toFixed(3)} · Brier {f.brier.toFixed(3)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Caveats */}
          <div className="col-span-12 mt-6">
            <h3 className="text-sm uppercase tracking-wider text-white/60 mb-3">Caveats</h3>
            <ul className="text-sm text-white/70 space-y-2 max-w-3xl">
              <li>
                <span className="text-white font-semibold">No tracking data.</span> The 2025-26 {meta.season_type} shotchartdetail endpoint
                does not expose defender distance or per-shot clock. Scenarios in the hero (Open C&amp;S, Contested Pull-Up, Late-Clock
                Heave) are approximated from location and distance only.
              </li>
              <li>
                <span className="text-white font-semibold">Sample size.</span> {meta.n_shots.toLocaleString()} shots across {meta.n_games} games — playoff-only.
                Per-player rankings use empirical-Bayes shrinkage toward the league mean (low-sample players regress hard).
              </li>
              <li>
                <span className="text-white font-semibold">Live simulator.</span> The stress test runs locally in the browser using a
                kNN-style lookup over actual shots plus heuristic adjustments for defender / shot-clock. It is not the trained model
                — that one lives in the artifacts directory and is invoked offline by the export script.
              </li>
              <li>
                <span className="text-white font-semibold">Cross-validation.</span> All metrics are out-of-fold from GroupKFold(5) split by game ID,
                preventing any shot from leaking between train and validation through its own game.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURE_IMPORTANCES: { name: string; pct: number }[] = [
  { name: "shot_distance",          pct: 100 },
  { name: "action_type (TE)",       pct: 76 },
  { name: "shot_angle",             pct: 41 },
  { name: "shooter season FG%",     pct: 34 },
  { name: "shot_zone_basic",        pct: 28 },
  { name: "seconds_left_in_game",   pct: 16 },
  { name: "shooter season 3PT%",    pct: 14 },
  { name: "period",                 pct: 9  },
  { name: "home / away",            pct: 5  },
];

function FeatureBars() {
  return (
    <div className="space-y-2">
      {FEATURE_IMPORTANCES.map((f) => (
        <div key={f.name} className="grid grid-cols-[160px_1fr_42px] items-center gap-3 text-xs">
          <span className="text-white/70">{f.name}</span>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full" style={{ width: `${f.pct}%`, background: "#FF2D6F" }} />
          </div>
          <span className="text-white/50 tabular-nums text-right">{f.pct}</span>
        </div>
      ))}
    </div>
  );
}

function CalibrationCurve({ deciles }: { deciles: { bin_center: number; pred_mean: number; actual_rate: number }[] }) {
  const W = 320, H = 220, PAD = 30;
  const xs = (v: number) => PAD + (W - 2 * PAD) * v;
  const ys = (v: number) => H - PAD - (H - 2 * PAD) * v;
  const pathPoints = deciles.map((d) => `${xs(d.pred_mean)},${ys(d.actual_rate)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Diagonal reference */}
      <line x1={xs(0)} y1={ys(0)} x2={xs(1)} y2={ys(1)} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 4" />
      {/* Axes */}
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.3)" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.3)" />
      {/* Curve */}
      <polyline points={pathPoints} fill="none" stroke="#FF2D6F" strokeWidth="2" />
      {deciles.map((d, i) => (
        <circle key={i} cx={xs(d.pred_mean)} cy={ys(d.actual_rate)} r="3" fill="#FF2D6F" />
      ))}
      {/* Labels */}
      <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.4)">predicted</text>
      <text x={8} y={H / 2} fontSize="10" fill="rgba(255,255,255,0.4)" transform={`rotate(-90, 8, ${H / 2})`}>observed</text>
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</div>
      <div className="font-mono text-lg mt-1 text-white">{value}</div>
    </div>
  );
}
