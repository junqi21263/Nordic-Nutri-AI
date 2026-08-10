/**
 * Temporary animation-QA mode: the server keeps recording vision usage but no
 * longer enforces the former 10-per-day cap. Keep the scanner controls usable
 * even for accounts whose historical counter has already reached ten.
 */
export const visionDailyQuotaEnforced = false;

export function isVisionQuotaExhausted(remaining: number | null) {
  return visionDailyQuotaEnforced && remaining === 0;
}
