"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { ShotDatum } from "./ShotMap";

// ─── Court geometry ─────────────────────────────────────────────────────────
//
// Lifted from main-frontend Court3D.tsx so the hoop, lines, and camera match
// the original 3D feel the user said "looks really good." We scale NBA-foot
// units into the scene by COURT_SCALE so 1 scene unit ≈ 2 ft.

const COURT_SCALE = 1 / 20;
const HOOP_Z = 11.25;
const HOOP_Y = 5;
const RIM_POS: [number, number, number] = [0, HOOP_Y, HOOP_Z];

const ARC_SEGMENTS = 36;
const ARC_GREEN = "#22ff7c";

// ─── Court lines ────────────────────────────────────────────────────────────

function arcPoints(
  cx: number,
  cz: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  steps = 64,
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / steps);
    pts.push([cx + Math.cos(a) * radius, 0.02, cz - Math.sin(a) * radius]);
  }
  return pts;
}

function CourtLines() {
  const half = 25 / 2;
  const baselineZ = HOOP_Z + 4.75 / 2;
  const halfcourtZ = baselineZ - 47 / 2;
  const lineColor = "#444";

  const arcRadius = 23.75 / 2;
  const cornerX = 22 / 2;
  const arcMeetZ = HOOP_Z - Math.sqrt(arcRadius * arcRadius - cornerX * cornerX);
  const arc = arcPoints(0, HOOP_Z, arcRadius, 0, Math.PI);
  const arcInside = arc.filter(([x]) => Math.abs(x) <= cornerX);

  const paintHalfX = 16 / 2 / 2;
  const paintDepth = 19 / 2;
  const paintNearZ = baselineZ;
  const paintFarZ = baselineZ - paintDepth;

  const ftCircle = arcPoints(0, paintFarZ, 6 / 2, 0, Math.PI * 2);
  const hoopFloorMark = arcPoints(0, HOOP_Z, 0.75 / 2, 0, Math.PI * 2);
  const restrictedArc = arcPoints(0, HOOP_Z, 4 / 2, 0, Math.PI);
  const halfcourtCircle = arcPoints(0, halfcourtZ, 6 / 2, 0, Math.PI * 2);

  return (
    <group>
      <Line points={[[-half, 0.02, baselineZ], [half, 0.02, baselineZ]]} color={lineColor} lineWidth={1} />
      <Line points={[[-half, 0.02, halfcourtZ], [half, 0.02, halfcourtZ]]} color={lineColor} lineWidth={1} />
      <Line points={[[-half, 0.02, baselineZ], [-half, 0.02, halfcourtZ]]} color={lineColor} lineWidth={1} />
      <Line points={[[half, 0.02, baselineZ], [half, 0.02, halfcourtZ]]} color={lineColor} lineWidth={1} />
      {arcInside.length > 1 && <Line points={arcInside} color={lineColor} lineWidth={1} />}
      <Line points={[[-cornerX, 0.02, baselineZ], [-cornerX, 0.02, arcMeetZ]]} color={lineColor} lineWidth={1} />
      <Line points={[[cornerX, 0.02, baselineZ], [cornerX, 0.02, arcMeetZ]]} color={lineColor} lineWidth={1} />
      <Line
        points={[
          [-paintHalfX, 0.02, paintNearZ],
          [-paintHalfX, 0.02, paintFarZ],
          [paintHalfX, 0.02, paintFarZ],
          [paintHalfX, 0.02, paintNearZ],
        ]}
        color={lineColor}
        lineWidth={1}
      />
      <Line points={ftCircle} color={lineColor} lineWidth={1} />
      <Line points={restrictedArc} color={lineColor} lineWidth={1} />
      <Line points={halfcourtCircle} color={lineColor} lineWidth={1} />
      <Line points={hoopFloorMark} color={lineColor} lineWidth={1} />
    </group>
  );
}

// ─── Hoop ───────────────────────────────────────────────────────────────────
//
// Backboard box + orange torus rim + net spokes. Identical geometry to
// main-frontend Court3D.tsx so the look matches what the user already liked.

function Hoop() {
  const RIM_RADIUS = 0.375;
  const RIM_TUBE = 0.04;
  const BACKBOARD_W = 3;
  const BACKBOARD_H = 1.75;
  const BACKBOARD_THICK = 0.05;
  const BACKBOARD_Z = HOOP_Z + 0.25;
  const BACKBOARD_Y = HOOP_Y + 0.25;

  const NET_DEPTH = 0.45;
  const NET_TOP_Y = HOOP_Y - 0.02;
  const NET_BOT_Y = HOOP_Y - NET_DEPTH;
  const netSegments = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.cos(a) * RIM_RADIUS;
    const z = HOOP_Z + Math.sin(a) * RIM_RADIUS;
    const xb = Math.cos(a) * RIM_RADIUS * 0.55;
    const zb = HOOP_Z + Math.sin(a) * RIM_RADIUS * 0.55;
    return [
      [x, NET_TOP_Y, z],
      [xb, NET_BOT_Y, zb],
    ] as [[number, number, number], [number, number, number]];
  });

  return (
    <group>
      <mesh position={[0, BACKBOARD_Y, BACKBOARD_Z]}>
        <boxGeometry args={[BACKBOARD_W, BACKBOARD_H, BACKBOARD_THICK]} />
        <meshBasicMaterial color="#1a1a1a" />
      </mesh>
      <Line
        points={[
          [-BACKBOARD_W / 2, BACKBOARD_Y - BACKBOARD_H / 2, BACKBOARD_Z - BACKBOARD_THICK / 2 - 0.001],
          [BACKBOARD_W / 2, BACKBOARD_Y - BACKBOARD_H / 2, BACKBOARD_Z - BACKBOARD_THICK / 2 - 0.001],
          [BACKBOARD_W / 2, BACKBOARD_Y + BACKBOARD_H / 2, BACKBOARD_Z - BACKBOARD_THICK / 2 - 0.001],
          [-BACKBOARD_W / 2, BACKBOARD_Y + BACKBOARD_H / 2, BACKBOARD_Z - BACKBOARD_THICK / 2 - 0.001],
          [-BACKBOARD_W / 2, BACKBOARD_Y - BACKBOARD_H / 2, BACKBOARD_Z - BACKBOARD_THICK / 2 - 0.001],
        ]}
        color="#bbbbbb"
        lineWidth={1.2}
      />
      <Line
        points={[
          [-0.45, HOOP_Y - 0.1, BACKBOARD_Z - BACKBOARD_THICK / 2 - 0.002],
          [0.45, HOOP_Y - 0.1, BACKBOARD_Z - BACKBOARD_THICK / 2 - 0.002],
          [0.45, HOOP_Y + 0.4, BACKBOARD_Z - BACKBOARD_THICK / 2 - 0.002],
          [-0.45, HOOP_Y + 0.4, BACKBOARD_Z - BACKBOARD_THICK / 2 - 0.002],
          [-0.45, HOOP_Y - 0.1, BACKBOARD_Z - BACKBOARD_THICK / 2 - 0.002],
        ]}
        color="#bbbbbb"
        lineWidth={1}
      />
      <mesh position={[0, HOOP_Y, HOOP_Z]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RIM_RADIUS, RIM_TUBE, 12, 36]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      {netSegments.map((seg, i) => (
        <Line key={i} points={seg} color="#bbbbbb" lineWidth={0.8} transparent opacity={0.7} />
      ))}
    </group>
  );
}

// ─── Shot dots ──────────────────────────────────────────────────────────────

function ShotDots({ shots, mode }: { shots: ShotDatum[]; mode: "result" | "residual" }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const capacity = Math.max(shots.length, 1);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      const sx = s.x * COURT_SCALE;
      const sz = HOOP_Z - s.y * COURT_SCALE;
      const y = 0.04 + (i % 8) * 0.0015;
      matrix.makeTranslation(sx, y, sz);
      mesh.setMatrixAt(i, matrix);
      if (mode === "residual") {
        const residual = s.made - s.xfg;
        const [r, g, b] = residual >= 0 ? [0.97, 0.44, 0.44] : [0.38, 0.65, 0.98];
        color.setRGB(r, g, b);
      } else {
        const [r, g, b] = s.made ? [0.2, 0.83, 0.6] : [0.97, 0.44, 0.44];
        color.setRGB(r, g, b);
      }
      mesh.setColorAt(i, color);
    }
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = shots.length; i < mesh.count; i++) {
      mesh.setMatrixAt(i, zero);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [shots, mode]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, capacity]} frustumCulled={false}>
      <cylinderGeometry args={[0.22, 0.22, 0.05, 18]} />
      <meshBasicMaterial transparent opacity={0.95} depthWrite={false} />
    </instancedMesh>
  );
}

// ─── Animated shot arcs ─────────────────────────────────────────────────────

type ArcDef = {
  points: [number, number, number][];
  delayMs: number;
  flightMs: number;
};

function chronoKey(s: ShotDatum): number {
  const date = s.date ? Number(s.date) : 0;
  const period = s.p ?? 0;
  const elapsed = -((s.min ?? 0) * 60 + (s.sec ?? 0));
  return date * 1e7 + period * 1e5 + elapsed;
}

function buildArc(
  start: [number, number, number],
  apexLift: number,
): [number, number, number][] {
  const apex: [number, number, number] = [
    (start[0] + RIM_POS[0]) / 2,
    Math.max(start[1], RIM_POS[1]) + apexLift,
    (start[2] + RIM_POS[2]) / 2,
  ];
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const u = 1 - t;
    pts.push([
      u * u * start[0] + 2 * u * t * apex[0] + t * t * RIM_POS[0],
      u * u * start[1] + 2 * u * t * apex[1] + t * t * RIM_POS[1],
      u * u * start[2] + 2 * u * t * apex[2] + t * t * RIM_POS[2],
    ]);
  }
  return pts;
}

const ARC_STAGGER_MS = 90;
const ARC_HOLD_MS = 320;
// Bumped from 18 → 80 so most makes emit a streak. Stagger tightened so
// the loop still finishes in a reasonable time. Trail particle count also
// dropped (see TRAIL_PARTICLES) to keep frame budget healthy at this count.
const ARC_MAX = 80;

function buildArcs(shots: ShotDatum[]): { arcs: ArcDef[]; cycleMs: number } {
  // Use ALL makes — the user wants paint shots to have arcs too. We only
  // skip truly trivial point-blank makes (< 3 ft) since their arc has no
  // horizontal sweep and reads as a single vertical line.
  const makes = shots.filter((s) => {
    const distFt = Math.hypot(s.x, s.y) / 10;
    return s.made === 1 && distFt >= 3;
  });
  if (makes.length === 0) return { arcs: [], cycleMs: 0 };

  // Chronological order — first make → last make.
  const ordered = makes.slice().sort((a, b) => chronoKey(a) - chronoKey(b));
  let picked: ShotDatum[];
  if (ordered.length <= ARC_MAX) {
    picked = ordered;
  } else {
    picked = [];
    const step = (ordered.length - 1) / (ARC_MAX - 1);
    for (let i = 0; i < ARC_MAX; i++) picked.push(ordered[Math.round(i * step)]);
  }

  const arcs: ArcDef[] = [];
  for (let i = 0; i < picked.length; i++) {
    const s = picked[i];
    const start: [number, number, number] = [
      s.x * COURT_SCALE,
      0.05,
      HOOP_Z - s.y * COURT_SCALE,
    ];
    const dx = start[0] - RIM_POS[0];
    const dz = start[2] - RIM_POS[2];
    const groundDist = Math.hypot(dx, dz);
    const apexLift = 2.6 + groundDist * 0.32;
    const flightMs = 760 + groundDist * 38;
    arcs.push({
      points: buildArc(start, apexLift),
      delayMs: i * ARC_STAGGER_MS,
      flightMs,
    });
  }

  const lastEnd = arcs[arcs.length - 1].delayMs + arcs[arcs.length - 1].flightMs;
  const cycleMs = lastEnd + ARC_HOLD_MS;
  return { arcs, cycleMs };
}

// Number of trailing sparkle particles behind the ball head. Kept lean since
// ARC_MAX is now 80 — this multiplies into total scene mesh count.
const TRAIL_PARTICLES = 5;
// How many path segments behind the head the comet trail spans.
const COMET_LENGTH = 22;
// Easing applied to the arc head's t so it decelerates into the rim — gives
// a "gravity slow-down" feel as the ball arrives at the hoop.
function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

type ThickLine = {
  material: { opacity: number; needsUpdate?: boolean };
};

function SingleArc({
  arc,
  startEpoch,
  cycleMs,
}: {
  arc: ArcDef;
  startEpoch: number;
  cycleMs: number;
}) {
  const lineRef = useRef<THREE.Line>(null);
  const thickLineRef = useRef<ThickLine | null>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const headMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const trailRefs = useRef<Array<{ mesh: THREE.Mesh | null; mat: THREE.MeshBasicMaterial | null }>>(
    Array.from({ length: TRAIL_PARTICLES }, () => ({ mesh: null, mat: null })),
  );
  const splashRef = useRef<THREE.Mesh>(null);
  const splashMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Build a BufferGeometry with per-vertex colors so we can paint a comet
  // gradient along the path each frame. The geometry is fixed (the curve never
  // moves); only the color attribute mutates.
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(arc.points.length * 3);
    const colors = new Float32Array(arc.points.length * 3);
    for (let i = 0; i < arc.points.length; i++) {
      positions[i * 3 + 0] = arc.points[i][0];
      positions[i * 3 + 1] = arc.points[i][1];
      positions[i * 3 + 2] = arc.points[i][2];
      colors[i * 3 + 0] = 0;
      colors[i * 3 + 1] = 0;
      colors[i * 3 + 2] = 0;
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [arc.points]);

  // Color constants used per-frame (kept outside the hot path to avoid GC).
  const headColor = useMemo(() => new THREE.Color(ARC_GREEN), []);
  const brightColor = useMemo(() => new THREE.Color("#ffffff"), []);

  useFrame(() => {
    const now = performance.now();
    const local = (now - startEpoch - arc.delayMs + cycleMs * 10) % cycleMs;
    const flight = arc.flightMs;
    const fadeMs = 420;

    let phase: "idle" | "flying" | "fading" = "idle";
    let headT = 0;
    let fadeK = 0;
    if (local < flight) {
      phase = "flying";
      headT = easeOutCubic(local / flight);
    } else if (local < flight + fadeMs) {
      phase = "fading";
      headT = 1;
      fadeK = (local - flight) / fadeMs;
    }

    // Repaint per-vertex colors so a wave of brightness travels along the path
    // and fades behind it (comet tail).
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
    const N = arc.points.length;
    const headIdx = headT * (N - 1);
    const baseAlpha = phase === "fading" ? 1 - fadeK : phase === "flying" ? 1 : 0;
    for (let i = 0; i < N; i++) {
      // Distance behind the head in path segments. Vertices ahead of the
      // head get zero brightness (path not "lit" yet).
      const behind = headIdx - i;
      let brightness = 0;
      if (behind >= 0 && behind <= COMET_LENGTH) {
        const k = 1 - behind / COMET_LENGTH; // 1 at head, 0 at tail
        brightness = k * k; // quadratic falloff — punchier head, gentler tail
      } else if (behind > COMET_LENGTH && phase !== "flying") {
        // After flight, keep the rest of the path lit at a low level so the
        // viewer briefly sees the full trajectory before it fades.
        brightness = 0.18 * (1 - fadeK);
      } else if (behind > COMET_LENGTH && phase === "flying") {
        // During flight, the segment far behind the head also stays softly
        // visible — sells the "trail you've already drawn" feeling.
        brightness = 0.22 * Math.max(0, 1 - (behind - COMET_LENGTH) / 18);
      }
      brightness *= baseAlpha;
      // Closer to the head → mix toward white for that hot-leading-tip look.
      const whiteMix = Math.max(0, brightness - 0.55) * 1.8;
      const r = headColor.r * brightness + brightColor.r * whiteMix;
      const g = headColor.g * brightness + brightColor.g * whiteMix;
      const b = headColor.b * brightness + brightColor.b * whiteMix;
      colorAttr.setXYZ(i, Math.min(1, r), Math.min(1, g), Math.min(1, b));
    }
    colorAttr.needsUpdate = true;

    // Position the ball head + halo at the current point on the curve.
    const idx = Math.min(N - 1, Math.floor(headIdx));
    const idxN = Math.min(N - 1, idx + 1);
    const frac = headIdx - idx;
    const a = arc.points[idx];
    const b = arc.points[idxN];
    const px = a[0] + (b[0] - a[0]) * frac;
    const py = a[1] + (b[1] - a[1]) * frac;
    const pz = a[2] + (b[2] - a[2]) * frac;

    const headVisible = phase !== "idle";
    const headOpacity = phase === "fading" ? 1 - fadeK : phase === "flying" ? 1 : 0;
    // Subtle breathing pulse on the head so it never feels static.
    const pulse = 1 + 0.08 * Math.sin(now * 0.018);

    // Thick base streak — fades in as the comet starts flying, holds while
    // it's mid-air, then fades with the rest of the arc. This is what gives
    // the trail its visible chunkiness instead of looking like a thread.
    if (thickLineRef.current?.material) {
      const flightProgress = phase === "flying" ? Math.min(1, (local / flight) * 2.2) : 1;
      const baseAlpha = phase === "fading" ? (1 - fadeK) : phase === "flying" ? flightProgress : 0;
      thickLineRef.current.material.opacity = baseAlpha * 0.65;
    }

    if (headRef.current && headMatRef.current) {
      headRef.current.position.set(px, py, pz);
      headRef.current.scale.setScalar(pulse);
      headMatRef.current.opacity = headOpacity;
      headRef.current.visible = headVisible;
    }
    if (haloRef.current && haloMatRef.current) {
      haloRef.current.position.set(px, py, pz);
      haloRef.current.scale.setScalar(pulse * 1.25);
      haloMatRef.current.opacity = headOpacity * 0.55;
      haloRef.current.visible = headVisible;
    }

    // Trail sparkles — chunky orbs packed tight behind the head so they read
    // as a single thick streak rather than discrete dots. They get smaller
    // and more transparent the further back they sit.
    for (let k = 0; k < TRAIL_PARTICLES; k++) {
      const ref = trailRefs.current[k];
      if (!ref.mesh || !ref.mat) continue;
      const lag = (k + 1) * 1.05; // tight spacing so the trail looks continuous
      const trailIdx = headIdx - lag;
      if (trailIdx < 0) {
        ref.mesh.visible = false;
        continue;
      }
      const ti = Math.floor(trailIdx);
      const tf = trailIdx - ti;
      const p0 = arc.points[ti];
      const p1 = arc.points[Math.min(N - 1, ti + 1)];
      ref.mesh.position.set(
        p0[0] + (p1[0] - p0[0]) * tf,
        p0[1] + (p1[1] - p0[1]) * tf,
        p0[2] + (p1[2] - p0[2]) * tf,
      );
      const t = 1 - k / TRAIL_PARTICLES;
      ref.mesh.scale.setScalar(0.7 + 0.6 * t);
      ref.mat.opacity = headOpacity * 0.9 * t;
      ref.mesh.visible = headVisible;
    }

    // Rim splash — a brief expanding ring when the ball arrives, then fade.
    if (splashRef.current && splashMatRef.current) {
      if (phase === "fading") {
        const k = fadeK;
        const scale = 0.6 + k * 1.6;
        splashRef.current.scale.set(scale, 1, scale);
        splashMatRef.current.opacity = (1 - k) * 0.55;
        splashRef.current.visible = true;
      } else {
        splashRef.current.visible = false;
      }
    }
  });

  return (
    <group>
      {/* Thick base path — drei's <Line> uses Line2/LineMaterial so its width
          is real screen-space pixels, not the 1px WebGL line cap. This is the
          visible streak; the <line> below paints the bright comet wave on top. */}
      <Line
        ref={(l) => {
          thickLineRef.current = l as unknown as ThickLine | null;
        }}
        points={arc.points}
        color={ARC_GREEN}
        lineWidth={3.5}
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore — r3f's <line> is THREE.Line, TS picks SVG by default */}
      <line ref={lineRef} geometry={geometry}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </line>
      {/* Outer halo — beefier so the head reads from 3+ feet away */}
      <mesh ref={haloRef} position={arc.points[0]}>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshBasicMaterial
          ref={haloMatRef}
          color={ARC_GREEN}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Bright head */}
      <mesh ref={headRef} position={arc.points[0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshBasicMaterial
          ref={headMatRef}
          color="#e6ffe9"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      {/* Trail sparkles — chunkier orbs so the trail reads as a thick streak */}
      {Array.from({ length: TRAIL_PARTICLES }).map((_, k) => (
        <mesh
          key={k}
          ref={(m) => {
            trailRefs.current[k].mesh = m;
          }}
          position={arc.points[0]}
        >
          <sphereGeometry args={[0.14, 10, 10]} />
          <meshBasicMaterial
            ref={(mat) => {
              trailRefs.current[k].mat = mat;
            }}
            color={ARC_GREEN}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      {/* Rim splash — flat ring rendered at the rim plane that expands on
          arrival and fades out. */}
      <mesh
        ref={splashRef}
        position={[RIM_POS[0], RIM_POS[1] + 0.01, RIM_POS[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <ringGeometry args={[0.35, 0.55, 32]} />
        <meshBasicMaterial
          ref={splashMatRef}
          color={ARC_GREEN}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function ShotArcs({ shots, reduce }: { shots: ShotDatum[]; reduce: boolean }) {
  const { arcs, cycleMs } = useMemo(() => buildArcs(shots), [shots]);
  const startEpoch = useRef(0);
  if (startEpoch.current === 0) startEpoch.current = performance.now();

  if (arcs.length === 0 || cycleMs === 0) return null;

  if (reduce) {
    return (
      <group>
        {arcs.map((arc, i) => (
          <Line
            key={i}
            points={arc.points}
            color={ARC_GREEN}
            lineWidth={1.4}
            transparent
            opacity={0.34}
            depthWrite={false}
          />
        ))}
      </group>
    );
  }

  return (
    <group>
      {arcs.map((arc, i) => (
        <SingleArc key={i} arc={arc} startEpoch={startEpoch.current} cycleMs={cycleMs} />
      ))}
    </group>
  );
}

// ─── Floor ──────────────────────────────────────────────────────────────────

function Floor() {
  const baselineZ = HOOP_Z + 4.75 / 2;
  const halfcourtZ = baselineZ - 47 / 2;
  const centerZ = (baselineZ + halfcourtZ) / 2;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]}>
      <planeGeometry args={[27, 25]} />
      <meshBasicMaterial color="#181014" side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─── Reduced motion ─────────────────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduce;
}

// ─── Public component ──────────────────────────────────────────────────────

type Props = {
  shots: ShotDatum[];
  mode?: "result" | "residual";
};

export function Court3DPlayer({ shots, mode = "result" }: Props) {
  const reduce = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  // R3F's internal react-use-measure caches the canvas size on first mount.
  // When this component is lazy-loaded inside a motion Reveal wrapper, the
  // first measure can resolve before the parent grid has reached its final
  // width — leaving the canvas frozen at ~350px even after the layout
  // settles. We force a re-measure by directly resizing the canvas inline
  // style to the container's current width/height and dispatching the
  // resize event R3F listens to.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const sync = () => {
      const inner = host.firstElementChild as HTMLElement | null;
      const canvas = host.querySelector("canvas") as HTMLCanvasElement | null;
      if (!inner || !canvas) return;
      const w = inner.clientWidth;
      const h = inner.clientHeight;
      if (w === 0 || h === 0) return;
      if (canvas.clientWidth !== w || canvas.clientHeight !== h) {
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      window.dispatchEvent(new Event("resize"));
    };
    sync();
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(sync);
    });
    const timers = [80, 240, 600, 1200].map((d) => window.setTimeout(sync, d));
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(sync);
      ro.observe(host);
    }
    return () => {
      cancelAnimationFrame(raf1);
      timers.forEach((t) => window.clearTimeout(t));
      ro?.disconnect();
    };
  }, []);

  return (
    <div className="w-full" ref={containerRef}>
      <div
        className="relative h-[560px] w-full overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a]"
        aria-label="3D shot map"
      >
        <Canvas
          dpr={[1, 2]}
          frameloop="always"
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <PerspectiveCamera makeDefault position={[0, 13, -16]} fov={38} />
          <ambientLight intensity={1.0} />
          <Suspense fallback={null}>
            <Floor />
            <CourtLines />
            <ShotDots shots={shots} mode={mode} />
            <ShotArcs shots={shots} reduce={reduce} />
            <Hoop />
          </Suspense>
          <OrbitControls
            target={[0, 1, 7]}
            enableZoom={!reduce}
            enablePan={false}
            enableRotate={!reduce}
            enabled={!reduce}
            autoRotate={false}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.3}
            minDistance={16}
            maxDistance={34}
            dampingFactor={0.08}
            enableDamping
          />
        </Canvas>
      </div>
    </div>
  );
}
