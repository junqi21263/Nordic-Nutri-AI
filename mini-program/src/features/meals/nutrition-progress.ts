export function calculateCircularProgressPercent(value: number, total: number) {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 1;
  const safeValue = Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, Math.round((safeValue / safeTotal) * 100)));
}
