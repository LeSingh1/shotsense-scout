"use client";

import { motion, useReducedMotion } from "motion/react";
import type { FoldMetrics } from "@/lib/types";
import { NumberDisplay } from "@/components/ui/NumberDisplay";

type Props = {
  fold_metrics: FoldMetrics;
};

/**
 * §5 Methodology — five fold strips, sequential reveal on whileInView.
 *
 * The simpler fallback per the design doc: five horizontal strips, each split
 * into a train segment and a val segment by GAME_ID count. No geometry morph.
 * Just opacity + width transitions, staggered.
 */
export function FoldVisualizer({ fold_metrics }: Props) {
  const reduce = useReducedMotion();
  const folds = fold_metrics.xgb;
  const baseline = fold_metrics.baseline;
  const lift = fold_metrics.lift.log_loss;

  return (
    <div className="border-l border-border pl-4">
      <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
        GroupKFold by GAME_ID — five splits, no game in both train and val
      </div>

      <ul className="my-4 space-y-3">
        {folds.map((f, i) => (
          <motion.li
            key={f.fold}
            className="grid grid-cols-[40px_1fr_120px] items-center gap-4 text-xs"
            initial={reduce ? false : { opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              delay: reduce ? 0 : i * 0.24,
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <span className="font-mono uppercase tracking-[0.08em] text-muted">
              Fold {f.fold}
            </span>
            <div className="flex h-2 w-full overflow-hidden">
              <motion.span
                className="bg-text"
                initial={reduce ? false : { width: 0 }}
                whileInView={{ width: "80%" }}
                viewport={{ once: true }}
                transition={{
                  delay: reduce ? 0 : i * 0.24 + 0.1,
                  duration: 0.5,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
              <motion.span
                className="bg-accent"
                initial={reduce ? false : { width: 0 }}
                whileInView={{ width: "20%" }}
                viewport={{ once: true }}
                transition={{
                  delay: reduce ? 0 : i * 0.24 + 0.2,
                  duration: 0.4,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </div>
            <NumberDisplay className="text-right text-xs text-muted">
              {`log_loss ${f.log_loss.toFixed(4)}`}
            </NumberDisplay>
          </motion.li>
        ))}
      </ul>

      <div className="mt-6 grid grid-cols-2 gap-6 border-t border-border pt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
        <div>
          Logistic baseline · mean log_loss
          <NumberDisplay className="mt-1 block text-lg text-text">
            {baseline[0].log_loss.toFixed(4)}
          </NumberDisplay>
        </div>
        <div>
          XGBoost · mean log_loss
          <NumberDisplay className="mt-1 block text-lg text-accent">
            {folds[0].log_loss.toFixed(4)}
          </NumberDisplay>
          <span className="mt-1 block text-[10px]">
            lift {(lift >= 0 ? "+" : "")}
            {lift.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}
