"use client";

import { LayoutGroup } from "motion/react";
import { useState } from "react";
import type { AppData, RankingRow } from "@/lib/types";
import { getTopAndBottom } from "@/lib/data";
import { Topbar } from "./Topbar";
import { Hero } from "./Hero";
import { Leaderboard } from "./Leaderboard";
import { Explorer } from "./Explorer";
import { Court } from "./Court";
import { Methodology } from "./Methodology";
import { Colophon } from "./Colophon";

type Props = {
  data: AppData;
};

/**
 * Single client wrapper that owns the LayoutGroup (so the §2→§3 morph works
 * regardless of section) and the selected-player state shared between
 * Leaderboard and Explorer.
 */
export function PageShell({ data }: Props) {
  const { top, bottom } = getTopAndBottom(data.ranking, 10, 25);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number>(top[0].player_id);

  const handlePlayerSelect = (player: RankingRow) => {
    setSelectedPlayerId(player.player_id);
    // Smooth-scroll to explorer
    const el = document.getElementById("explorer");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <LayoutGroup>
      <Topbar />
      <main id="main-content" className="pt-14">
        <Hero meta={data.meta} topPlayer={top[0]} />
        <Leaderboard
          top={top}
          bottom={bottom}
          onSelectPlayer={handlePlayerSelect}
        />
        <Explorer
          ranking={data.ranking}
          shots={data.shots}
          selectedPlayerId={selectedPlayerId}
          onPlayerSelect={(p) => setSelectedPlayerId(p.player_id)}
        />
        <Court hex={data.hex} />
        <Methodology
          fold_metrics={data.fold_metrics}
          calibration={data.calibration}
          topPlayer={top[0]}
        />
        <Colophon meta={data.meta} />
      </main>
    </LayoutGroup>
  );
}
