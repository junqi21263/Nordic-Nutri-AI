import type { ProductWeeklyReview } from "../../api/insight-api";
import i18n, { getLocale } from "../../i18n";

/** A week keeps the same artwork and copy, including after reopening the preview. */
export function weeklyShareVariant(startDate: string): number {
  let hash = 0;
  for (const char of startDate) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 3;
}

export const WEEKLY_ILLUSTRATION_IDS = Array.from(
  { length: 30 },
  (_, index) => `weekly-${String(index + 1).padStart(2, "0")}`,
);
export const WEEKLY_ILLUSTRATION_COUNT = WEEKLY_ILLUSTRATION_IDS.length;
const WEEKLY_ILLUSTRATION_STORAGE_PREFIX = "nordic-weekly-illustration:";

export function weeklyIllustrationStorageKey(startDate: string): string {
  return `${WEEKLY_ILLUSTRATION_STORAGE_PREFIX}${startDate}`;
}

export function weeklyIllustrationUrls(cdnBase: string): string[] {
  const base = cdnBase.trim().replace(/\/$/, "");
  return WEEKLY_ILLUSTRATION_IDS.map((id) =>
    base
      ? `${base}/brand/weekly-illustrations/v1/${id}.jpg`
      : "/assets/weekly/nordic-weekly-illustration.jpg",
  );
}

/** A deterministic default, then a persisted per-week choice until explicitly refreshed. */
export function selectWeeklyIllustrationIndex(startDate: string, count: number): number {
  if (count <= 0) return 0;
  let hash = 0;
  for (const char of startDate) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % count;
}

export function getWeeklyIllustrationIndex(
  startDate: string,
  storage: Record<string, unknown>,
  count = WEEKLY_ILLUSTRATION_COUNT,
): number {
  const saved = storage[weeklyIllustrationStorageKey(startDate)];
  return typeof saved === "number" && Number.isInteger(saved) && saved >= 0 && saved < count
    ? saved
    : selectWeeklyIllustrationIndex(startDate, count);
}

export function saveWeeklyIllustrationIndex(
  startDate: string,
  index: number,
  storage: Record<string, unknown>,
): void {
  storage[weeklyIllustrationStorageKey(startDate)] = index;
}

export function chooseDifferentIllustrationIndex(
  current: number,
  count: number,
  random: () => number = Math.random,
): number {
  if (count <= 1) return 0;
  const currentIndex = ((current % count) + count) % count;
  const candidate = Math.floor(random() * (count - 1));
  return candidate >= currentIndex ? candidate + 1 : candidate;
}

/** Explicit allowlist: never spread profile, meal details or the model payload into a poster. */
export function weeklyShareLines(
  review: ProductWeeklyReview,
  streak: number | null = null,
): string[] {
  const variant = weeklyShareVariant(review.startDate);
  const translate = i18n.getFixedT(getLocale());
  const highlights = translate(review.recordedDays ? "share.highlightWithMeals" : "share.highlightWithoutMeals", { returnObjects: true }) as string[];
  const footers = translate("share.footerVariants", { returnObjects: true }) as string[];
  const series = translate("share.series", { returnObjects: true }) as string[];
  return [
    "Nordic Weekly",
    `${review.startDate} — ${review.rhythm.at(-1)?.date ?? review.endDate}`,
    `${translate("share.recordedDays")}: ${review.recordedDays} / 7 · ${translate("share.recordedMeals")}: ${review.recordedMeals}`,
    `${translate("share.longestStreak")}: ${streak ?? "—"} ${translate("share.daysUnit")}`,
    translate("share.highlight"),
    highlights[variant].replace("{{count}}", String(review.recordedMeals)).replace("{{days}}", String(review.recordedDays)),
    footers[variant],
    "Nordic Nutri AI",
    series[variant],
  ];
}
