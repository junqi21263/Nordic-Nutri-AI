import { useEffect, useRef, useState } from "react";

function scheduleFrame(callback: (time: number) => void) {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  return setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

function cancelScheduledFrame(id: number) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
    return;
  }
  clearTimeout(id);
}

export function useCountUp(
  target: number,
  {
    enabled,
    delayMs = 0,
    durationMs = 760,
    initialValue = enabled ? 0 : target,
  }: { enabled: boolean; delayMs?: number; durationMs?: number; initialValue?: number },
) {
  const [value, setValue] = useState(enabled ? 0 : initialValue);
  const frameRef = useRef(0);

  useEffect(() => {
    if (frameRef.current) cancelScheduledFrame(frameRef.current);
    if (!enabled) {
      setValue(initialValue);
      return;
    }

    setValue(0);
    let cancelled = false;
    const timeout = setTimeout(() => {
      const startedAt = Date.now();
      const step = () => {
        const elapsed = Date.now() - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = 1 - (1 - progress) ** 4;
        const next = progress === 1 ? target : Math.round(target * eased);
        if (!cancelled) setValue(next);
        if (progress < 1 && !cancelled) frameRef.current = scheduleFrame(step);
      };
      frameRef.current = scheduleFrame(step);
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (frameRef.current) cancelScheduledFrame(frameRef.current);
    };
  }, [delayMs, durationMs, enabled, initialValue, target]);

  return value;
}
