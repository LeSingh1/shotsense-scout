"use client";

import { useEffect, useRef, useState } from "react";
import type { Keypoint } from "@/components/watch/pose-types";

/**
 * Lazy-load TensorFlow.js + the MoveNet Thunder single-pose detector.
 *
 * Returns a state machine the consumer can poll each animation frame:
 *
 *   const { status, detect } = useMoveNet();
 *   if (status === "ready") {
 *     const kps = await detect(videoEl);
 *   }
 *
 * Everything is lazy-imported so the home page doesn't pay the ~1MB TFJS
 * cost — it only loads when this hook actually mounts inside /watch.
 */
export type MoveNetStatus = "idle" | "loading" | "ready" | "error";

type Detector = {
  estimatePoses: (
    image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    config?: object,
  ) => Promise<{ keypoints: Keypoint[] }[]>;
};

export function useMoveNet() {
  const [status, setStatus] = useState<MoveNetStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const detectorRef = useRef<Detector | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      try {
        // Dynamic imports so this only loads once the component is mounted.
        const [tf, poseDetection] = await Promise.all([
          import("@tensorflow/tfjs"),
          import("@tensorflow-models/pose-detection"),
        ]);
        await import("@tensorflow/tfjs-backend-webgl");
        await tf.setBackend("webgl");
        await tf.ready();

        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER },
        );
        if (cancelled) {
          detector.dispose();
          return;
        }
        detectorRef.current = detector as unknown as Detector;
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message ?? "MoveNet failed to load");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const detect = async (
    video: HTMLVideoElement,
  ): Promise<Record<string, Keypoint> | null> => {
    if (!detectorRef.current || video.readyState < 2) return null;
    try {
      const poses = await detectorRef.current.estimatePoses(video, { flipHorizontal: false });
      const pose = poses[0];
      if (!pose) return null;
      const out: Record<string, Keypoint> = {};
      for (const kp of pose.keypoints) {
        if (kp.name) out[kp.name] = kp;
      }
      return out;
    } catch {
      return null;
    }
  };

  return { status, error, detect };
}
