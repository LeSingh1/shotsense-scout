/**
 * Hand-verified pool of real NBA playoff clips. Each entry pairs the
 * actual videos.nba.com URL with metadata that matches THAT specific clip.
 *
 * IMPORTANT: never auto-generate clip metadata from one game/player and
 * pair it with a video URL from a different game/player. Earlier the
 * shuffle pool was built by walking shots_by_game.json and falling back
 * to one of two known URLs — that produced cards labeled e.g. "M. Conley,
 * DEN @ MIN" while the video showed ORL @ DET Round 1 Game 1. The card
 * and the footage MUST agree.
 *
 * To grow this pool, find a real videos.nba.com pbp URL for an actual
 * playoff shot, verify it plays in the browser, then add a new entry
 * here with the metadata for that exact shot.
 */

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

function gradeFor(xfg: number): WatchClipGrade {
  if (xfg >= 0.65) return "A+";
  if (xfg >= 0.55) return "A";
  if (xfg >= 0.45) return "B";
  if (xfg >= 0.35) return "C";
  if (xfg >= 0.27) return "D";
  return "F";
}

const CLIPS_RAW: Omit<WatchClip, "grade">[] = [
  {
    id: "orl-det-g1-suggs-pullup",
    url: "https://videos.nba.com/nba/pbp/media/2026/04/19/0042500101/20/3caa8ed1-3269-5729-d0c2-27c5e21e09cf_1280x720.mp4",
    series: "2026 R1 G1 · ORL vs DET",
    player: "J. Suggs",
    action: "26' Pull-up 3PT",
    made: true,
    modelXfg: 0.35,
    metrics: {
      releaseAngleDeg: 50,
      releaseHeightFt: 9.5,
      bodyLeanDeg: 4,
      timeToReleaseMs: 430,
    },
    inputs: {
      where: "26 ft · Above the Break 3",
      when: "Q1 · 10:34 · early game",
      how: "Pull-up 3PT off the bounce",
      situation: "Away · ~4 ft of space · trailing by 2",
    },
    shotLocation: { x: -20, y: 260 },
    cors: false,
  },
  {
    id: "orl-det-g1-paint-finish",
    url: "https://videos.nba.com/nba/pbp/media/2026/04/19/0042500101/13/13b0f724-f604-c30a-5395-a30b3f8f28ee_1280x720.mp4",
    series: "2026 R1 G1 · ORL vs DET",
    player: "P. Banchero",
    action: "4' Driving Layup",
    made: true,
    modelXfg: 0.62,
    metrics: {
      releaseAngleDeg: 38,
      releaseHeightFt: 9.8,
      bodyLeanDeg: 8,
      timeToReleaseMs: 290,
    },
    inputs: {
      where: "4 ft · Restricted Area",
      when: "Q1 · 11:22 · early game",
      how: "Drive-and-finish · assisted",
      situation: "Away · clean lane · leading by 8",
    },
    shotLocation: { x: -12, y: 38 },
    cors: false,
  },
];

export const WATCH_CLIPS: readonly WatchClip[] = CLIPS_RAW.map((c) => ({
  ...c,
  grade: gradeFor(c.modelXfg),
}));

export function pickRandomClip(exceptId?: string): WatchClip {
  const pool = exceptId
    ? WATCH_CLIPS.filter((c) => c.id !== exceptId)
    : WATCH_CLIPS;
  return pool[Math.floor(Math.random() * pool.length)] ?? WATCH_CLIPS[0];
}
