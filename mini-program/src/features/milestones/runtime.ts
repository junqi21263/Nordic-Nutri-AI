const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function getMilestonePosterUrl({ eventId, claimToken }: { eventId: string; claimToken?: string | null }) {
  const params = new URLSearchParams({ eventId });
  if (claimToken) params.set("claimToken", claimToken);
  return `/pages/milestone-poster/index?${params.toString()}`;
}

/** Backfilled meals persist pending server-side, but never interrupt the correction flow. */
export function shouldClaimAfterMealSave(recordedAt: string, now = new Date().toISOString()) {
  const recordedDay = shanghaiDate(recordedAt);
  const currentDay = shanghaiDate(now);
  return Boolean(recordedDay && currentDay && recordedDay === currentDay);
}

/** Session-only UX guard. The database claim token remains the final authority. */
export function consumeMilestoneClaim(consumed: Set<string>, eventId: string) {
  if (consumed.has(eventId)) return false;
  consumed.add(eventId);
  return true;
}
