/**
 * Client-side approximation of the model's expected-FG for a single shot.
 *
 * This is a stand-in until Agent 1's pipeline emits `xfg_pred` per-shot in
 * `shots_by_game.json`. The logistic form below is tuned so a 5 ft layup
 * lands near 0.62 and a 22 ft three lands near 0.36 — close enough to
 * read directionally on the metric card without misrepresenting the model.
 *
 * If `shot.xfg_pred` is already set (Agent 1 plumbed it through), use that
 * via {@link xfgForShot}.
 */

import type { ShotRecord } from "@/lib/types/shots";

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Action-type → typical defender distance (ft). Mirrors the backend proxy. */
const DEFENDER_DIST_BY_ACTION: Record<string, number> = {
  "Catch and Shoot": 5.5,
  "Jump Shot": 4.0,
  "Pullup Jump shot": 3.5,
  "Pull-Up Jump Shot": 3.5,
  "Step Back Jump Shot": 4.5,
  "Step Back Jump shot": 4.5,
  "Driving Layup Shot": 1.5,
  "Driving Floating Jump Shot": 2.5,
  "Cutting Layup Shot": 1.0,
  "Dunk Shot": 0.5,
  "Tip Shot": 0.8,
  "Putback Layup Shot": 1.2,
  "Layup Shot": 1.6,
  "Floating Jump shot": 2.8,
  "Fadeaway Jump Shot": 3.0,
  "Turnaround Jump Shot": 3.2,
  "Running Jump Shot": 3.2,
  "Hook Shot": 2.0,
};
const DEFENDER_DIST_DEFAULT = 3.0;

export function defenderProxyFt(actionType: string): number {
  return DEFENDER_DIST_BY_ACTION[actionType] ?? DEFENDER_DIST_DEFAULT;
}

/**
 * Logistic stand-in keyed on distance, angle, and the defender proxy.
 * Calibration anchors:
 *   - 5 ft layup, defender ~1.5  → ~0.62
 *   - 22 ft three, defender ~5.5 → ~0.36
 */
export function approxXfg(args: {
  shot_distance: number;
  shot_angle: number;
  defender_proxy_ft: number;
}): number {
  const { shot_distance, shot_angle, defender_proxy_ft } = args;
  const z =
    0.6 -
    0.045 * shot_distance -
    0.005 * Math.abs(shot_angle) +
    0.06 * defender_proxy_ft;
  return sigmoid(z);
}

/** Use the backend's xfg_pred if present, otherwise fall back to approxXfg. */
export function xfgForShot(shot: ShotRecord): number {
  if (typeof shot.xfg_pred === "number" && Number.isFinite(shot.xfg_pred)) {
    return shot.xfg_pred;
  }
  return approxXfg({
    shot_distance: shot.shot_distance,
    shot_angle: shot.shot_angle,
    defender_proxy_ft: defenderProxyFt(shot.action_type),
  });
}
