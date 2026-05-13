"use client";

import type { CalibrationData, FoldMetrics, RankingRow } from "@/lib/types";
import { formatSignedDelta } from "@/lib/format";
import { NumberDisplay } from "@/components/ui/NumberDisplay";
import { FoldVisualizer } from "./FoldVisualizer";

type Props = {
  fold_metrics: FoldMetrics;
  calibration: CalibrationData;
  topPlayer: RankingRow;
};

export function Methodology({ fold_metrics, calibration, topPlayer }: Props) {
  return (
    <section
      id="methodology"
      className="px-6 py-24 md:px-20 md:py-40"
      aria-labelledby="methodology-heading"
    >
      <header className="mb-12 flex flex-col items-baseline gap-6 border-b border-border pb-6 md:flex-row md:gap-12">
        <span className="num font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
          05 / Methodology
        </span>
        <h2
          id="methodology-heading"
          className="font-display text-[40px] font-medium leading-none tracking-[-0.03em] md:text-[64px]"
        >
          Why these numbers
          <br className="hidden md:block" /> can be trusted.
        </h2>
      </header>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
        <FoldVisualizer fold_metrics={fold_metrics} />

        {/* Target encoding block */}
        <div className="border-l border-border pl-4">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            Target encoding · inside the sklearn pipeline
          </div>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Action types like &lsquo;Driving Layup Shot&rsquo; are high-cardinality.
            Encoding them with the target means inside a sklearn{" "}
            <code className="bg-surface px-1.5 py-0.5 text-xs text-text">Pipeline</code>{" "}
            means the encoder refits on each outer fold&apos;s training data, never
            the held-out fold.
          </p>
          <p className="text-sm leading-relaxed text-muted">
            Without this wiring, the leakage would inflate apparent performance by
            10–15% log_loss. Calibration deciles would still look fine. The cross-
            validation hygiene only catches this if the encoder lives inside the
            Pipeline.
          </p>
        </div>

        {/* Shrinkage block */}
        <div className="border-l border-border pl-4">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            Empirical-Bayes shrinkage
          </div>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            A player with 20 shots and one hot streak would dominate any raw
            FG%-over-expected ranking. Empirical-Bayes shrinkage pulls every
            player toward zero by an amount inversely proportional to their shot
            count.
          </p>

          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            <div>
              n shots
              <NumberDisplay className="mt-1 block text-lg text-text">
                {String(topPlayer.n_shots)}
              </NumberDisplay>
            </div>
            <div>
              raw Δ
              <NumberDisplay className="mt-1 block text-lg text-text">
                {formatSignedDelta(topPlayer.raw_delta)}
              </NumberDisplay>
            </div>
            <div>
              weight
              <NumberDisplay className="mt-1 block text-lg text-text">
                {topPlayer.weight.toFixed(2)}
              </NumberDisplay>
            </div>
            <div>
              shrunk Δ
              <NumberDisplay className="mt-1 block text-lg text-accent">
                {formatSignedDelta(topPlayer.shrunk_delta)}
              </NumberDisplay>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            {topPlayer.player_name} kept{" "}
            <span className="text-text">
              {(topPlayer.weight * 100).toFixed(0)}%
            </span>{" "}
            of his raw delta. A player with 20 shots would keep ~30%.
          </p>
        </div>
      </div>

      {/* Calibration mini-summary */}
      <div className="mt-12 grid grid-cols-1 gap-6 border-t border-border pt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-muted md:grid-cols-2">
        <div>
          Calibration · max decile deviation
          <NumberDisplay className="mt-1 block text-lg text-text">
            {(calibration.max_deviation * 100).toFixed(1)}
          </NumberDisplay>
          <span className="mt-1 block text-[10px] normal-case">
            warning gate triggers at 5%.{" "}
            {calibration.max_deviation > 0.05
              ? "Above gate; isotonic post-processing recommended."
              : "Within gate; XGBoost probabilities are honest out of the box."}
          </span>
        </div>
        <div>
          {calibration.deciles.length} deciles
          <span className="mt-1 block text-[10px] normal-case">
            Quantile-binned reliability diagram. Each bin holds roughly the same
            number of shots; the bar height is predicted vs actual make rate.
          </span>
        </div>
      </div>
    </section>
  );
}
