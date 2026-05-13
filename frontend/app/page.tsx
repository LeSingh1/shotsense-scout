// Server Component — Nike-style product page for the NBA xFG% model.
// Reads the inline JSON data tree (no runtime fetch) and hands it to the
// client subtree. Each section below the hero is independently scrollable.

import { getAppData } from "@/lib/data";
import { NikeTopbar } from "@/components/nike/Topbar";
import { PlayerHero } from "@/components/nike/PlayerHero";
import { WhereTheyShot } from "@/components/nike/WhereTheyShot";
import { HeavySections } from "@/components/nike/HeavySections";
import { Reveal } from "@/components/nike/Reveal";
import { AgentPanel } from "@/components/AgentPanel";

export default function Page() {
  const data = getAppData();

  return (
    <main id="main-content" className="bg-[#0a0a0a]">
      <NikeTopbar />
      <PlayerHero shots={data.shots} ranking={data.ranking} meta={data.meta} />
      <Reveal><AgentPanel /></Reveal>
      <Reveal><WhereTheyShot shots={data.shots} /></Reveal>
      <HeavySections
        shots={data.shots}
        ranking={data.ranking}
        meta={data.meta}
        fold={data.fold_metrics}
        calibration={data.calibration}
      />

      <footer className="bg-black text-white/40 text-xs py-8 px-8 md:px-16 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-3">
          <span>NBA xFG% · 2025-26 Playoffs · Run {data.meta.run_timestamp.slice(0, 10)}</span>
          <span>Model artifact {data.meta.model_artifact} · sha {data.meta.model_sha256}</span>
        </div>
      </footer>
    </main>
  );
}
