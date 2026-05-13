"use client";

import dynamic from "next/dynamic";
import type { ShotsMap, RankingRow, FoldMetrics, CalibrationData, Meta } from "@/lib/types";
import { Reveal } from "./Reveal";

// Skeleton placeholder while a section's chunk loads.
const Skel = ({ h = 600 }: { h?: number }) => (
  <div style={{ height: h }} className="bg-[#0a0a0a]" />
);

// EveryShot pulls in 3.2 MB of per-game shot JSON — by far the biggest
// single chunk. Lazy-loaded so it never touches the critical path.
const EveryShot = dynamic(
  () => import("./EveryShot").then((m) => m.EveryShot),
  { ssr: false, loading: () => <Skel h={800} /> },
);

// Three.js + react-three-fiber (~600 KB) for the Laboratory scene.
const Laboratory = dynamic(
  () => import("./Laboratory").then((m) => m.Laboratory),
  { ssr: false, loading: () => <Skel h={600} /> },
);

// TensorFlow imports are already lazy inside useMoveNet, but the WatchShot
// module itself still parses heavy pose-detection types at import time.
const WatchShot = dynamic(
  () => import("../watch/WatchShot").then((m) => m.WatchShot),
  { ssr: false, loading: () => <Skel h={400} /> },
);

const StressTest = dynamic(
  () => import("./StressTest").then((m) => m.StressTest),
  { ssr: false, loading: () => <Skel h={500} /> },
);

const Leaderboards = dynamic(
  () => import("./Leaderboards").then((m) => m.Leaderboards),
  { ssr: false, loading: () => <Skel h={700} /> },
);

const Methodology = dynamic(
  () => import("./Methodology").then((m) => m.Methodology),
  { ssr: false, loading: () => <Skel h={700} /> },
);

export function HeavySections({
  shots,
  ranking,
  meta,
  fold,
  calibration,
}: {
  shots: ShotsMap;
  ranking: RankingRow[];
  meta: Meta;
  fold: FoldMetrics;
  calibration: CalibrationData;
}) {
  return (
    <>
      <Reveal><EveryShot shots={shots} ranking={ranking} /></Reveal>
      <div id="watch-a-shot">
        <Reveal><WatchShot shots={shots} /></Reveal>
      </div>
      <Reveal><Laboratory shots={shots} /></Reveal>
      <Reveal><StressTest shots={shots} ranking={ranking} /></Reveal>
      <Reveal><Leaderboards ranking={ranking} /></Reveal>
      <Reveal><Methodology meta={meta} fold={fold} calibration={calibration} /></Reveal>
    </>
  );
}
