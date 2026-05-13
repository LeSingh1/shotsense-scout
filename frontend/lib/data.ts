// Server-side data loader. Reads the JSON files produced by
// scripts/export_for_frontend.py and passes them down as typed props.
//
// IMPORTANT: this module imports the JSON files at module scope. In Next.js
// App Router with `output: 'export'`, this happens at build time and the data
// is serialized into the static HTML payload. There is NO runtime fetch.

import ranking from "./data/ranking.json";
import shots from "./data/shots.json";
import hex from "./data/hex.json";
import foldMetrics from "./data/fold_metrics.json";
import calibration from "./data/calibration.json";
import meta from "./data/meta.json";

import type {
  AppData,
  CalibrationData,
  FoldMetrics,
  HexData,
  Meta,
  RankingRow,
  ShotsMap,
} from "./types";

export function getAppData(): AppData {
  return {
    ranking: ranking as unknown as RankingRow[],
    shots: shots as unknown as ShotsMap,
    hex: hex as unknown as HexData,
    fold_metrics: foldMetrics as unknown as FoldMetrics,
    calibration: calibration as unknown as CalibrationData,
    meta: meta as unknown as Meta,
  };
}

// Convenience: get the top N and bottom N by shrunk_delta, eligible only.
export function getTopAndBottom(
  ranking: RankingRow[],
  n = 10,
  minShots = 25,
): { top: RankingRow[]; bottom: RankingRow[] } {
  const eligible = ranking.filter((r) => r.n_shots >= minShots);
  const sorted = [...eligible].sort((a, b) => b.shrunk_delta - a.shrunk_delta);
  return {
    top: sorted.slice(0, n),
    bottom: sorted.slice(-n).reverse(),
  };
}
