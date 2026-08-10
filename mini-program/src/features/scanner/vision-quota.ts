/** Daily image-recognition quota is enforced by the API and reflected in scanner controls. */
export const visionDailyQuotaEnforced = true;

export function isVisionQuotaExhausted(remaining: number | null) {
  return visionDailyQuotaEnforced && remaining === 0;
}
