"use client";

import { useRef } from "react";

/**
 * Lightweight orange-ball tracker. Pure-canvas HSV filtering — no OpenCV.js
 * dependency (would have added ~10MB).
 *
 *   1. Draw the current video frame into an offscreen canvas at low res
 *      (downsample to ~240 wide) to keep the per-frame cost cheap.
 *   2. Walk the pixel buffer, classify each pixel as "orange-ish" using
 *      tuned HSV thresholds.
 *   3. Compute the centroid of the orange pixels. If too few pixels match,
 *      report `ok: false` so callers can skip the frame.
 *   4. Exponential moving average smooths the position across frames so the
 *      ball doesn't jitter when small HSV blobs fight for centroid weight.
 *
 * Returns position in the FULL-RESOLUTION video coordinate frame.
 */

type TrackPoint = { x: number; y: number; ok: boolean };

// Conservative orange thresholds. The ball gets occluded a lot in real
// footage, so we err on the side of "miss" rather than tracking skin/jersey.
const H_LO = 5;     // ~10° on a 0-180 H scale
const H_HI = 28;    // ~55°
const S_LO = 110;   // saturation must be solid
const V_LO = 70;
const MIN_PIXELS = 30;
const EMA_ALPHA = 0.55;

type WorkCanvases = {
  off: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  prev: TrackPoint | null;
  trail: TrackPoint[];
};

export function useBallTracking() {
  const ref = useRef<WorkCanvases | null>(null);

  const ensure = (): WorkCanvases => {
    if (ref.current) return ref.current;
    const off = document.createElement("canvas");
    const ctx = off.getContext("2d", { willReadFrequently: true })!;
    ref.current = { off, ctx, prev: null, trail: [] };
    return ref.current;
  };

  const reset = () => {
    if (ref.current) {
      ref.current.prev = null;
      ref.current.trail = [];
    }
  };

  /** Run one tracking pass on the given video. Returns smoothed ball position
      in video coords and updates the rolling trail. */
  const track = (video: HTMLVideoElement): { point: TrackPoint; trail: TrackPoint[] } => {
    const w = ensure();
    const W = 240;
    const H = Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * W) || 135;
    if (w.off.width !== W) w.off.width = W;
    if (w.off.height !== H) w.off.height = H;
    w.ctx.drawImage(video, 0, 0, W, H);

    let img: ImageData;
    try {
      img = w.ctx.getImageData(0, 0, W, H);
    } catch {
      // Tainted canvas — happens if a remote video doesn't send CORS headers.
      const pt = { x: 0, y: 0, ok: false };
      return { point: pt, trail: w.trail };
    }
    const data = img.data;

    let sx = 0, sy = 0, count = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const hsv = rgbToHsv(r, g, b);
        if (
          hsv.h >= H_LO && hsv.h <= H_HI &&
          hsv.s >= S_LO &&
          hsv.v >= V_LO
        ) {
          sx += x;
          sy += y;
          count += 1;
        }
      }
    }

    let point: TrackPoint;
    if (count < MIN_PIXELS) {
      point = { x: 0, y: 0, ok: false };
    } else {
      // Centroid back in full video coords.
      const cx = (sx / count) * (video.videoWidth / W);
      const cy = (sy / count) * (video.videoHeight / H);
      // EMA smooth with previous point if it was a hit.
      if (w.prev && w.prev.ok) {
        point = {
          x: w.prev.x * (1 - EMA_ALPHA) + cx * EMA_ALPHA,
          y: w.prev.y * (1 - EMA_ALPHA) + cy * EMA_ALPHA,
          ok: true,
        };
      } else {
        point = { x: cx, y: cy, ok: true };
      }
    }
    w.prev = point;
    w.trail.push(point);
    if (w.trail.length > 15) w.trail.shift();
    return { point, trail: [...w.trail] };
  };

  return { track, reset };
}

/** RGB → HSV. r/g/b in 0..255, returns h in 0..180, s/v in 0..255 (OpenCV-style). */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max;
  const s = max === 0 ? 0 : ((max - min) * 255) / max;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d) * 60;
    else if (max === g) h = ((b - r) / d) * 60 + 120;
    else h = ((r - g) / d) * 60 + 240;
    if (h < 0) h += 360;
  }
  return { h: h / 2, s, v }; // OpenCV-style 0..180 hue
}
