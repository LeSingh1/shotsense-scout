/**
 * Watch-clip pool — every entry's video URL was fetched live from NBA's
 * stats.nba.com/videoeventsasset endpoint for that exact shot, so the
 * footage on screen always matches the card metadata next to it.
 *
 * To grow / refresh the pool:
 *     python3 scripts/fetch_watch_clips.py
 * That script writes `lib/data/watch_clips_real.json`, which this module
 * imports below.
 *
 * NEVER pair a real shot's metadata with a fallback video from a different
 * shot — the user will see the mismatch on the broadcast scoreboard and
 * that's "AI slop". If a clip can't be sourced, drop the entry; don't
 * substitute.
 */

import clipsData from "@/lib/data/watch_clips_real.json";

export type WatchClipInputs = {
  where: string;
  when: string;
  how: string;
  situation: string;
};

export type WatchClipMetrics = {
  releaseAngleDeg: number;
  releaseHeightFt: number;
  bodyLeanDeg: number;
  timeToReleaseMs: number;
};

export type WatchClipShotLocation = { x: number; y: number };

export type WatchClipGrade = "A+" | "A" | "B" | "C" | "D" | "F";

export type WatchClip = {
  id: string;
  url: string;
  series: string;
  player: string;
  action: string;
  made: boolean;
  modelXfg: number;
  grade: WatchClipGrade;
  metrics: WatchClipMetrics;
  inputs: WatchClipInputs;
  shotLocation: WatchClipShotLocation;
  cors: boolean;
};

export const WATCH_CLIPS: readonly WatchClip[] = clipsData as WatchClip[];

export function pickRandomClip(exceptId?: string): WatchClip {
  const pool = exceptId
    ? WATCH_CLIPS.filter((c) => c.id !== exceptId)
    : WATCH_CLIPS;
  return pool[Math.floor(Math.random() * pool.length)] ?? WATCH_CLIPS[0];
}
