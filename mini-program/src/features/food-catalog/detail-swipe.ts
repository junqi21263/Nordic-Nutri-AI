/** Horizontal swipe intent for detail paging. Returns -1 prev, 1 next, 0 none. */
export function resolveHorizontalSwipe(
  dx: number,
  dy: number,
  threshold = 56,
): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < threshold) return 0;
  // Prefer vertical scroll when the gesture is mostly vertical.
  if (Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

export function siblingIndex(current: number, delta: -1 | 1, length: number): number | null {
  if (length <= 1) return null;
  const next = current + delta;
  if (next < 0 || next >= length) return null;
  return next;
}
