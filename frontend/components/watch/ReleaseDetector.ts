// Release-detection state machine + metric computation.
//
// A shot's "release" is the moment the ball leaves the shooter's hand. We
// detect it from two signals every frame:
//
//   1. Ball position vs. wrist position. The ball is BEING HELD when its
//      center is close to either wrist. Once that distance starts growing
//      monotonically for ~3 consecutive frames, the shot has released.
//   2. The wrist's vertical position is near its local peak when this
//      separation event begins (eliminates dribble false-positives).
//
// Once released, we lock in the five tracked metrics from the last 4-frame
// window leading up to the event.

import type { Keypoint } from "./pose-types";

export type FrameSample = {
  t: number;            // ms since playback start
  ball: { x: number; y: number; ok: boolean } | null;
  kp: Record<string, Keypoint>;
};

export type LockedMetrics = {
  releaseAngleDeg: number;
  releaseHeightFt: number;
  bodyLeanDeg: number;
  timeToReleaseMs: number;
  ballSpeedFtPerSec: number;
  releaseFrameTs: number;
};

const WINDOW = 6;                    // frames of context kept for derivatives
const SEPARATION_TICKS = 3;          // frames of monotonic increase to confirm
const MIN_SEPARATION_PX = 18;        // ball must move at least this many px

export class ReleaseDetector {
  private samples: FrameSample[] = [];
  private separationTicks = 0;
  private prevSep = Infinity;
  private firstBallSeenAt: number | null = null;

  /** Push a frame. Returns LockedMetrics if release was detected this frame. */
  ingest(sample: FrameSample): LockedMetrics | null {
    this.samples.push(sample);
    if (this.samples.length > WINDOW) this.samples.shift();

    const { ball, kp } = sample;
    if (!ball || !ball.ok) {
      this.separationTicks = 0;
      this.prevSep = Infinity;
      return null;
    }
    if (this.firstBallSeenAt === null) this.firstBallSeenAt = sample.t;

    const wrist = this.dominantWrist(kp);
    if (!wrist) return null;

    const sep = dist(ball, wrist);

    // Separation event: ball moving away from wrist 3 frames in a row, and
    // the ball is also rising (wrist near local peak height).
    const rising = this.isBallRising();

    if (sep > this.prevSep + 1 && rising) {
      this.separationTicks += 1;
    } else if (sep < this.prevSep) {
      this.separationTicks = 0;
    }
    this.prevSep = sep;

    if (this.separationTicks >= SEPARATION_TICKS && sep > MIN_SEPARATION_PX) {
      const metrics = this.computeMetrics(sample);
      this.reset();
      return metrics;
    }
    return null;
  }

  /** Wipe state — call when video restarts/loops. */
  reset() {
    this.samples = [];
    this.separationTicks = 0;
    this.prevSep = Infinity;
    this.firstBallSeenAt = null;
  }

  private dominantWrist(kp: Record<string, Keypoint>) {
    // Pick whichever wrist has higher score (more confident).
    const lw = kp["left_wrist"];
    const rw = kp["right_wrist"];
    if (lw && rw) return (lw.score ?? 0) >= (rw.score ?? 0) ? lw : rw;
    return lw || rw || null;
  }

  private isBallRising(): boolean {
    if (this.samples.length < 3) return false;
    const last3 = this.samples.slice(-3);
    const balls = last3.map((s) => s.ball).filter((b): b is { x: number; y: number; ok: boolean } => !!b && b.ok);
    if (balls.length < 3) return false;
    // y decreasing = moving up the screen
    return balls[2].y < balls[1].y && balls[1].y < balls[0].y;
  }

  /** Compute the five metrics from the last few frames leading into release. */
  private computeMetrics(release: FrameSample): LockedMetrics {
    const buf = this.samples.filter((s) => s.ball && s.ball.ok && s.ball);
    if (buf.length < 2 || !release.ball) {
      // Defensive fallback — shouldn't happen because release requires a ball,
      // but lint doesn't know that.
      return {
        releaseAngleDeg: 0,
        releaseHeightFt: 0,
        bodyLeanDeg: 0,
        timeToReleaseMs: 0,
        ballSpeedFtPerSec: 0,
        releaseFrameTs: release.t,
      };
    }

    // Velocity from the last two ball samples
    const a = buf[buf.length - 2].ball!;
    const b = buf[buf.length - 1].ball!;
    const dt = Math.max(1, buf[buf.length - 1].t - buf[buf.length - 2].t);
    const vx = (b.x - a.x) / dt; // px / ms
    const vy = (b.y - a.y) / dt;

    // Angle: arctan(-vy / vx). Negate because y grows downward; we want
    // "upward" to be positive. Map to 0..90° absolute.
    const angleRad = Math.atan2(-vy, Math.abs(vx) + 1e-6);
    const releaseAngleDeg = Math.max(0, Math.min(90, (angleRad * 180) / Math.PI));

    // Body lean — angle between (shoulder midpoint → hip midpoint) line and
    // vertical. Positive = leaning forward (toward the hoop).
    const bodyLeanDeg = computeBodyLean(release.kp);

    // Calibration: use shoulder-to-ankle pixel distance assumed to span
    // ~5.4 ft (NBA average eye-to-floor). Gives a pixels-per-foot scale.
    const scale = computePxPerFoot(release.kp); // px / ft
    const releaseHeightPx = release.ball.y;
    // Anchor: take the ankle midpoint as "0 ft", subtract upward distance.
    const ankleY = ankleMidpoint(release.kp);
    const releaseHeightFt = ankleY && scale > 0 ? Math.max(0, (ankleY - releaseHeightPx) / scale) : 0;

    // Ball speed in ft/s. velocity magnitude in px/ms × ms/s ÷ px/ft = ft/s
    const speedPxPerMs = Math.hypot(vx, vy);
    const ballSpeedFtPerSec = scale > 0 ? (speedPxPerMs * 1000) / scale : 0;

    const timeToReleaseMs = this.firstBallSeenAt !== null ? release.t - this.firstBallSeenAt : 0;

    return {
      releaseAngleDeg,
      releaseHeightFt,
      bodyLeanDeg,
      timeToReleaseMs,
      ballSpeedFtPerSec,
      releaseFrameTs: release.t,
    };
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a?: Keypoint, b?: Keypoint): { x: number; y: number } | null {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function computeBodyLean(kp: Record<string, Keypoint>): number {
  const shoulders = mid(kp["left_shoulder"], kp["right_shoulder"]);
  const hips = mid(kp["left_hip"], kp["right_hip"]);
  if (!shoulders || !hips) return 0;
  const dx = shoulders.x - hips.x;
  const dy = hips.y - shoulders.y; // positive when shoulders above hips
  const angleRad = Math.atan2(dx, Math.max(dy, 1e-6));
  return (angleRad * 180) / Math.PI;
}

function ankleMidpoint(kp: Record<string, Keypoint>): number | null {
  const la = kp["left_ankle"];
  const ra = kp["right_ankle"];
  if (la && ra) return (la.y + ra.y) / 2;
  return la?.y ?? ra?.y ?? null;
}

/** Pixels-per-foot using shoulder-to-ankle ≈ 5.4 ft (rough NBA average). */
function computePxPerFoot(kp: Record<string, Keypoint>): number {
  const shoulders = mid(kp["left_shoulder"], kp["right_shoulder"]);
  const ankle = ankleMidpoint(kp);
  if (!shoulders || ankle === null) return 0;
  const heightPx = Math.abs(ankle - shoulders.y);
  if (heightPx < 20) return 0;
  return heightPx / 5.4;
}
