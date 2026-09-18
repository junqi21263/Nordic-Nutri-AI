/** Server date-only values must not be parsed as UTC instants. */
export function profileWeekday(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(`${date}T12:00:00`).getDay()] ?? "—";
}

/** One short, cancellable animation; no timer fallback on unsupported runtimes. */
export function animateProfileNumber(target: number, update: (value: number) => void) {
  if (target === 0 || typeof requestAnimationFrame !== "function") {
    update(target);
    return () => undefined;
  }
  let frame = 0;
  let start: number | undefined;
  let cancelled = false;
  const tick = (time: number) => {
    if (cancelled) return;
    start ??= time;
    const progress = Math.min(1, (time - start) / 760);
    update(progress === 1 ? target : Math.round(target * (1 - (1 - progress) ** 3)));
    if (progress < 1) frame = requestAnimationFrame(tick);
    else frame = 0;
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    if (frame) cancelAnimationFrame(frame);
  };
}
