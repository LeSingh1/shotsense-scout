// Scenario splits. The 2025-26 shotchartdetail endpoint doesn't expose
// defender distance or shot clock, so we approximate scenarios with the
// signal we DO have: shot location, distance, and the implied range.
//
// This is a methodology compromise, documented in the Methodology section.

import type { PlayerShots } from "./types";

export type Scenario = "overall" | "open_catch_shoot" | "contested_pullup" | "late_clock_heave";

export const SCENARIOS: { id: Scenario; label: string; blurb: string }[] = [
  { id: "overall",           label: "Overall",            blurb: "Every playoff attempt." },
  { id: "open_catch_shoot",  label: "Open catch & shoot", blurb: "Above-the-break 3PT. Proxied by distance + location." },
  { id: "contested_pullup",  label: "Contested pull-up",  blurb: "Mid-range. Proxied by 10-22 ft range." },
  { id: "late_clock_heave",  label: "Late-clock heave",   blurb: "≥27 ft. Proxied by distance only — no shot clock available." },
];

export type ShotType = "ALL" | "2PT" | "3PT" | "MID" | "RIM";

/** Euclidean court distance in feet from the hoop (LOC units are tenths of a foot). */
function distFt(x: number, y: number): number {
  return Math.sqrt(x * x + y * y) / 10;
}

export function filterScenario(shots: PlayerShots["shots"], scenario: Scenario): PlayerShots["shots"] {
  if (scenario === "overall") return shots;
  return shots.filter((s) => {
    const d = distFt(s.x, s.y);
    switch (scenario) {
      case "open_catch_shoot":   return d >= 22 && Math.abs(s.x) > 80;       // wing & above-the-break threes
      case "contested_pullup":   return d >= 10 && d < 22;                    // mid-range
      case "late_clock_heave":   return d >= 27;                              // deep
    }
  });
}

export function filterShotType(shots: PlayerShots["shots"], type: ShotType): PlayerShots["shots"] {
  if (type === "ALL") return shots;
  return shots.filter((s) => {
    const d = distFt(s.x, s.y);
    switch (type) {
      case "RIM": return d < 4;
      case "MID": return d >= 4 && d < 22;
      case "2PT": return d < 22;
      case "3PT": return d >= 22;
    }
  });
}

export type ScenarioMetrics = {
  nShots: number;
  fg: number;
  xfg: number;
  xpps: number;          // expected points per shot
  delta: number;         // fg - xfg
};

export function computeMetrics(shots: PlayerShots["shots"]): ScenarioMetrics {
  if (shots.length === 0) {
    return { nShots: 0, fg: 0, xfg: 0, xpps: 0, delta: 0 };
  }
  let made = 0;
  let xfgSum = 0;
  let xppsSum = 0;
  for (const s of shots) {
    made += s.made;
    xfgSum += s.xfg;
    // Shot is a 3 if distance ≥ 22ft (corner threshold approximated)
    const isThree = Math.sqrt(s.x * s.x + s.y * s.y) / 10 >= 22;
    xppsSum += s.xfg * (isThree ? 3 : 2);
  }
  const n = shots.length;
  return {
    nShots: n,
    fg: made / n,
    xfg: xfgSum / n,
    xpps: xppsSum / n,
    delta: made / n - xfgSum / n,
  };
}
