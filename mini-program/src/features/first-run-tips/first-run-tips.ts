import Taro from "@tarojs/taro";

const storageKey = "nordic-nutri:first-run-tips:v1";

export type FirstRunTipId = "home-first-meal" | "scanner-capture" | "meal-records-review";

/** Legacy id from when step 3 lived on analysis-result. */
const legacyStep3Id = "analysis-result-save";

type FirstRunTipsState = Partial<Record<FirstRunTipId | typeof legacyStep3Id, true>>;

function parseState(raw: unknown): FirstRunTipsState {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return parseState(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const state = raw as FirstRunTipsState;
  // Migrate old step-3 key so dismiss history is preserved.
  if (state[legacyStep3Id] && !state["meal-records-review"]) {
    state["meal-records-review"] = true;
  }
  return state;
}

function readState(): FirstRunTipsState {
  try {
    return parseState(Taro.getStorageSync(storageKey));
  } catch {
    return {};
  }
}

function writeState(next: FirstRunTipsState) {
  try {
    Taro.setStorageSync(storageKey, next);
  } catch {
    // Tips must fail open: if storage is unavailable, keep showing once per session via component state.
  }
}

export function hasSeenFirstRunTip(tipId: FirstRunTipId): boolean {
  const state = readState();
  if (state[tipId]) return true;
  if (tipId === "meal-records-review" && state[legacyStep3Id]) return true;
  // Completing a later step makes earlier coach marks obsolete.
  if (tipId === "home-first-meal") {
    return Boolean(state["scanner-capture"] || state["meal-records-review"] || state[legacyStep3Id]);
  }
  if (tipId === "scanner-capture") {
    return Boolean(state["meal-records-review"] || state[legacyStep3Id]);
  }
  return false;
}

export function markFirstRunTipSeen(tipId: FirstRunTipId): void {
  const next: FirstRunTipsState = { ...readState(), [tipId]: true };
  // Completing a later step also retires earlier tips.
  if (tipId === "scanner-capture" || tipId === "meal-records-review") {
    next["home-first-meal"] = true;
  }
  if (tipId === "meal-records-review") {
    next["scanner-capture"] = true;
  }
  writeState(next);
}

/** Demo fixture ids look like `meal-breakfast-today`; real meals use UUID / `local-meal-…`. */
export function isFixtureMealId(id: string): boolean {
  return id.startsWith("meal-") && !id.startsWith("local-meal-");
}

/**
 * True when the device already has a user-saved meal.
 * Do not require `dataSource === "remote"` — persisted local cache often still says `fixture`.
 */
export function hasUserRecordedMeals(
  meals: Array<{ id: string }>,
  dataSource?: "fixture" | "remote",
): boolean {
  if (dataSource === "remote" && meals.length > 0) return true;
  return meals.some((meal) => !isFixtureMealId(meal.id));
}

/** Retire all tips once the user already has real (non-fixture) meal history. */
export function markFirstRunTipsSeenForRecordedMeals(): void {
  writeState({
    ...readState(),
    "home-first-meal": true,
    "scanner-capture": true,
    "meal-records-review": true,
  });
}

/** Hide coach marks when storage already proves the first-meal loop happened. */
export function retireFirstRunTipsIfRecordedMeals(
  meals: Array<{ id: string }>,
  dataSource?: "fixture" | "remote",
): boolean {
  if (!hasUserRecordedMeals(meals, dataSource)) return false;
  markFirstRunTipsSeenForRecordedMeals();
  return true;
}

export function clearFirstRunTips(): void {
  try {
    Taro.removeStorageSync(storageKey);
  } catch {
    // Best-effort for account cancellation / forced re-login.
  }
}
