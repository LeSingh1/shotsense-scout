import type { Meta } from "@/lib/types";
import { formatGameDate } from "@/lib/format";
import { NumberDisplay } from "@/components/ui/NumberDisplay";

type Props = {
  meta: Meta;
};

export function Colophon({ meta }: Props) {
  return (
    <footer
      id="colophon"
      className="border-t border-border px-6 py-16 md:px-20 md:py-24"
      aria-labelledby="colophon-heading"
    >
      <span className="num font-mono text-[13px] uppercase tracking-[0.08em] text-muted">
        06 / About
      </span>

      <h2
        id="colophon-heading"
        className="mt-6 max-w-3xl font-display text-3xl font-medium leading-tight tracking-[-0.02em] md:text-5xl"
      >
        Free-data, methodology-first.
        <br />
        Not designed to beat PBPStats.
      </h2>

      <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
        This is a learning project. The point isn&apos;t the accuracy ceiling — without
        defender distance and shot tracking, that ceiling is hard. The point is
        what proper cross-validation hygiene looks like on shot data, an
        empirical-Bayes ranking that survives the 20-shot small-sample player,
        and a calibration curve you can actually read.
      </p>

      <div className="mt-12 grid grid-cols-2 gap-6 border-t border-border pt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-muted md:grid-cols-4">
        <div>
          Updated
          <NumberDisplay className="mt-1 block text-base text-text">
            {formatGameDate(meta.run_timestamp)}
          </NumberDisplay>
        </div>
        <div>
          Model SHA
          <NumberDisplay className="mt-1 block text-base text-text">
            {meta.model_sha256.slice(0, 12)}
          </NumberDisplay>
        </div>
        <div>
          Built by
          <span className="mt-1 block font-body text-base normal-case text-text">
            shaurya
          </span>
        </div>
        <div>
          Source
          <a
            href="https://github.com/LeSingh1/nba_shot_quality"
            className="mt-1 block font-body text-base normal-case text-text underline decoration-border underline-offset-4 hover:decoration-accent"
            target="_blank"
            rel="noreferrer noopener"
          >
            github.com ↗
          </a>
        </div>
      </div>

      <p className="mt-12 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        MIT licensed · No tracking · No cookies · No analytics
      </p>
    </footer>
  );
}
