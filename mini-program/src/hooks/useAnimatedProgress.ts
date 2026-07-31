import { useEffect, useRef, useState } from "react";

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function scheduleFrame(callback: (time: number) => void) {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

function cancelFrame(id: number) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
    return;
  }
  clearTimeout(id);
}

/**
 * Animates a 0–100 progress value for circular/conic rings where CSS cannot
 * transition `conic-gradient` stops smoothly in the WeChat runtime.
 * Only commits React updates when the rounded percent changes to avoid jank.
 */
export function useAnimatedProgress(targetPercent: number, durationMs = 520) {
  const target = Math.round(clampPercent(targetPercent));
  const [display, setDisplay] = useState(0);
  const valueRef = useRef(0);
  const postedRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (frameRef.current) cancelFrame(frameRef.current);
    const from = valueRef.current;
    const to = target;
    if (Math.abs(from - to) < 0.5) {
      valueRef.current = to;
      postedRef.current = to;
      setDisplay(to);
      return;
    }

    const startedAt = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - startedAt) / durationMs);
      // Smooth ease-out that settles without a hard stop.
      const eased = 1 - (1 - t) ** 4;
      const next = from + (to - from) * eased;
      valueRef.current = next;
      const rounded = t >= 1 ? to : Math.round(next);
      if (rounded !== postedRef.current) {
        postedRef.current = rounded;
        setDisplay(rounded);
      }
      if (t < 1) {
        frameRef.current = scheduleFrame(step);
      } else {
        valueRef.current = to;
        frameRef.current = 0;
      }
    };

    frameRef.current = scheduleFrame(step);
    return () => {
      if (frameRef.current) cancelFrame(frameRef.current);
    };
  }, [target, durationMs]);

  return display;
}

/**
 * Defers applying the target percent so CSS transform transitions can run
 * from 0 (or the previous value) after the first paint.
 */
export function useDeferredProgress(targetPercent: number, delayMs = 16) {
  const target = Math.round(clampPercent(targetPercent));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setDisplay(target), delayMs);
    return () => clearTimeout(id);
  }, [target, delayMs]);

  return display;
}
