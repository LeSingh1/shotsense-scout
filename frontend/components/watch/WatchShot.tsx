"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShotsMap } from "@/lib/types";
import { useMoveNet } from "@/hooks/useMoveNet";
import { useBallTracking } from "@/hooks/useBallTracking";
import {
  ReleaseDetector,
  type LockedMetrics,
} from "./ReleaseDetector";
import { SKELETON, type Keypoint } from "./pose-types";
import { ShotDetailCard } from "./ShotDetailCard";
import { ReleaseProfile } from "./ReleaseProfile";
import { WATCH_CLIPS, pickRandomClip, type WatchClip } from "@/lib/watchClips";

/**
 * Watch a shot — section that pairs a video with the model's read on it.
 *
 *   Curated NBA broadcast clip:
 *     - tainted canvas → MoveNet can't run → locked metrics come from the
 *       clip's pre-computed `metrics` field (NBA averages for that shot type).
 *
 *   User upload:
 *     - clean canvas → MoveNet + HSV ball tracking → ReleaseDetector locks
 *       the five metrics live on the release frame.
 */
export function WatchShot({ shots }: { shots: ShotsMap }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<ReleaseDetector>(new ReleaseDetector());
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { status: poseStatus, detect } = useMoveNet();
  const { track: trackBall, reset: resetBall } = useBallTracking();

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [defaultMissing, setDefaultMissing] = useState(false);
  const [locked, setLocked] = useState<LockedMetrics | null>(null);
  // The current clip drives the detail card AND, when MoveNet can't run, the
  // metric tiles on the right. Null when the user has uploaded their own file.
  const [currentClip, setCurrentClip] = useState<WatchClip | null>(WATCH_CLIPS[0] ?? null);

  // For curated clips, seed `locked` from the clip's pre-computed metrics so
  // the right panel shows real numbers immediately. MoveNet can't track a
  // tainted canvas — the broadcast clips don't ship CORS headers.
  useEffect(() => {
    if (currentClip) {
      setLocked({
        releaseAngleDeg: currentClip.metrics.releaseAngleDeg,
        releaseHeightFt: currentClip.metrics.releaseHeightFt,
        bodyLeanDeg: currentClip.metrics.bodyLeanDeg,
        timeToReleaseMs: currentClip.metrics.timeToReleaseMs,
        ballSpeedFtPerSec: 0,
        releaseFrameTs: 0,
      });
    }
  }, [currentClip]);

  // Probe the default clip on mount. If it exists locally, use it. Otherwise
  // fall back to the first curated playoff clip so the page always has video.
  useEffect(() => {
    const candidate = "/clips/default-shot.mp4";
    fetch(candidate, { method: "HEAD" })
      .then((r) => {
        if (r.ok) {
          setVideoSrc(candidate);
        } else if (WATCH_CLIPS[0]) {
          setVideoSrc(WATCH_CLIPS[0].url);
        } else {
          setDefaultMissing(true);
        }
      })
      .catch(() => {
        if (WATCH_CLIPS[0]) setVideoSrc(WATCH_CLIPS[0].url);
        else setDefaultMissing(true);
      });
  }, []);

  const onUpload = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setDefaultMissing(false);
    setLocked(null);
    setCurrentClip(null);
    detectorRef.current.reset();
    resetBall();
  }, [resetBall]);

  const onShuffleClip = useCallback(() => {
    if (WATCH_CLIPS.length === 0) return;
    // Functional updater reads the freshest currentClip — guards against the
    // stale-closure bug where rapid clicks all see the same `currentClip`.
    setCurrentClip((prev) => {
      const next = pickRandomClip(prev?.id);
      setVideoSrc(next.url);
      return next;
    });
    setDefaultMissing(false);
    detectorRef.current.reset();
    resetBall();
  }, [resetBall]);

  /** Per-frame loop — only runs for CORS-clean videos (user uploads). */
  const loop = useCallback(async () => {
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas || video.paused || video.ended) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let kp: Record<string, Keypoint> = {};
    try {
      kp = (await detect(video)) ?? {};
    } catch {
      // Tainted canvas — bail silently. Curated clips fall back to the
      // pre-computed metrics set by the seed effect above.
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    if (Object.keys(kp).length) drawSkeleton(ctx, kp);

    let ball: { x: number; y: number; ok: boolean } = { x: 0, y: 0, ok: false };
    let trail: { x: number; y: number; ok: boolean }[] = [];
    try {
      const result = trackBall(video);
      ball = result.point;
      trail = result.trail;
      if (ball.ok) drawBall(ctx, ball, trail);
    } catch {
      /* ignore CORS errors */
    }

    const now = performance.now();
    const m = detectorRef.current.ingest({
      t: now - startedAtRef.current,
      ball: ball.ok ? ball : null,
      kp,
    });
    if (m) setLocked(m);

    rafRef.current = requestAnimationFrame(loop);
  }, [detect, trackBall]);

  const onPlay = () => {
    startedAtRef.current = performance.now();
    // Only reset the detector + ball tracker for user-uploaded clips. For
    // curated clips, `locked` is already seeded from clip metadata and we
    // don't want a play event to wipe it.
    if (!currentClip) {
      detectorRef.current.reset();
      resetBall();
      setLocked(null);
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  };

  const onPause = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // For user uploads, fall back to the kNN-on-shots xFG approximation. For
  // curated clips, the locked.modelXfg is already the curated value.
  const demoXfg = useDemoXfg(shots, locked, currentClip);

  const hasVideo = !!videoSrc;

  return (
    <section
      id="watch-a-shot-section"
      className="relative bg-[#0a0a0a] text-white py-24 px-8 md:px-16"
      style={
        {
          "--nike-accent": "#FF2D6F",
        } as React.CSSProperties
      }
    >
      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-b border-white/10 pb-5 mb-10">
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-2 font-mono">
            04 · Watch a shot
          </div>
          <h2
            className="font-black leading-tight tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontSize: "clamp(40px, 5.5vw, 88px)" }}
          >
            Watch a shot.
          </h2>
          <p className="text-sm text-white/55 mt-3 max-w-2xl leading-relaxed">
            Pick a clip — or drop in your own. The five locked metrics show what the
            model would weigh on the release frame, and the xFG block shows how often
            the model expected the shot to fall.
          </p>
        </div>

        {/* Pose loader notice (only meaningful for user-uploaded clips) */}
        {poseStatus === "loading" && !currentClip && (
          <div className="mb-6 rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/60 font-mono">
            Loading MoveNet Thunder · first time can take 5–10s while weights download…
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {/* LEFT — video + detail card */}
          <div className="col-span-12 lg:col-span-8">
            <div className="relative rounded-lg bg-black/30 border border-white/8 overflow-hidden">
              {/* Upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute top-3 right-3 z-20 rounded-full border border-white/15 bg-black/55 backdrop-blur-sm px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/85 hover:border-white hover:text-white transition"
              >
                Upload your own
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                }}
              />

              <div className="relative w-full aspect-video bg-black">
                {hasVideo ? (
                  <>
                    {/*
                     * Keyed on videoSrc so the element remounts when the URL
                     * changes (shuffle / upload). Without the key, setting
                     * `src` alone is unreliable — most browsers won't pick up
                     * the new source unless you also call video.load(), and
                     * autoPlay only fires once per mount.
                     */}
                    <video
                      key={videoSrc}
                      ref={videoRef}
                      src={videoSrc!}
                      className="absolute inset-0 w-full h-full object-contain"
                      autoPlay
                      muted
                      playsInline
                      loop
                      controls
                      onPlay={onPlay}
                      onPause={onPause}
                      onLoadedMetadata={() => {
                        if (videoRef.current && !videoRef.current.paused) onPlay();
                      }}
                    />
                    <canvas
                      ref={overlayRef}
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  </>
                ) : (
                  <EmptyState
                    missing={defaultMissing}
                    onPick={() => fileInputRef.current?.click()}
                  />
                )}
              </div>
            </div>

            {/* Detail card — keyed on clip.id so React always remounts the
                whole card subtree on shuffle (eliminates any chance of stale
                children carrying over from the prior clip). */}
            {currentClip && (
              <div className="mt-6">
                <ShotDetailCard key={currentClip.id} clip={currentClip} onShuffle={onShuffleClip} />
              </div>
            )}
          </div>

          {/* RIGHT — unified release profile (gauge + 4 input rows) */}
          <div className="col-span-12 lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
            <ReleaseProfile
              keyId={currentClip?.id ?? `live-${locked?.releaseFrameTs ?? "idle"}`}
              xfg={demoXfg ?? 0}
              made={currentClip?.made ?? true}
              releaseAngleDeg={locked?.releaseAngleDeg ?? 0}
              releaseHeightFt={locked?.releaseHeightFt ?? 0}
              bodyLeanDeg={locked?.bodyLeanDeg ?? 0}
              timeToReleaseMs={locked?.timeToReleaseMs ?? 0}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────── helpers + presenters */

function drawSkeleton(ctx: CanvasRenderingContext2D, kp: Record<string, Keypoint>) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (const [a, b] of SKELETON) {
    const pa = kp[a];
    const pb = kp[b];
    if (!pa || !pb) continue;
    if ((pa.score ?? 0) < 0.3 || (pb.score ?? 0) < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  for (const k in kp) {
    const p = kp[k];
    if ((p.score ?? 0) < 0.3) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  ball: { x: number; y: number },
  trail: { x: number; y: number; ok: boolean }[],
) {
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    if (!t.ok) continue;
    const alpha = (i / trail.length) * 0.45;
    ctx.fillStyle = `rgba(255, 45, 111, ${alpha})`;
    const r = 2.5 + (i / trail.length) * 5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255, 45, 111, 1)";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 7, 0, Math.PI * 2);
  ctx.fill();
}

function EmptyState({
  missing,
  onPick,
}: {
  missing: boolean;
  onPick: () => void;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center text-center px-6">
      <div className="max-w-md">
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/40 mb-3 font-mono">
          {missing ? "No default clip found" : "Waiting for video"}
        </div>
        <h3
          className="font-black mb-3"
          style={{ fontFamily: "var(--font-display)", fontSize: 32 }}
        >
          Drop a jump-shot clip.
        </h3>
        <p className="text-sm text-white/55 leading-relaxed mb-6">
          Pick a short 4–6 second MP4 of a jump shot. Everything runs locally — the
          video never leaves your machine.
        </p>
        <button
          onClick={onPick}
          className="rounded-full px-6 py-3 text-xs uppercase tracking-[0.2em] text-white border border-white/20 hover:border-white transition"
          style={{ background: "var(--nike-accent)" }}
        >
          Choose video
        </button>
      </div>
    </div>
  );
}

/**
 * xFG predictor with two modes:
 *   - Curated clip loaded → return the clip's pre-computed modelXfg.
 *   - User upload → use the kNN-on-shots approximation, adjusted by the live
 *     tracked release angle + body lean.
 */
function useDemoXfg(
  shots: ShotsMap,
  locked: LockedMetrics | null,
  currentClip: WatchClip | null,
): number | null {
  return useMemo(() => {
    if (currentClip) return currentClip.modelXfg;
    if (!locked) return null;
    let sum = 0;
    let n = 0;
    for (const k in shots) {
      for (const s of shots[k].shots) {
        const d = Math.hypot(s.x, s.y) / 10;
        if (d >= 18 && d <= 26) {
          sum += s.xfg;
          n += 1;
        }
      }
    }
    const baseline = n > 0 ? sum / n : 0.42;
    const angleDelta = Math.exp(
      -((locked.releaseAngleDeg - 47.5) ** 2) / (2 * 10 * 10),
    );
    const angleBoost = (angleDelta - 0.5) * 0.18;
    const leanPenalty = -Math.min(0.10, Math.abs(locked.bodyLeanDeg) * 0.004);
    return Math.max(0.03, Math.min(0.92, baseline + angleBoost + leanPenalty));
  }, [shots, locked, currentClip]);
}
