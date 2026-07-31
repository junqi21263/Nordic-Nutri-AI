import { clampProgress, type DailySummary, type DailyTargets } from "./domain";

export type HomeDailySummary = DailySummary & { staleRemote: boolean };

type RemoteTargets = DailyTargets & {
  consumed: DailyTargets;
  completion: number;
};

/**
 * Prefer the cloud summary, but keep local intake visible when the tab still
 * holds a stale empty remote payload after meals were saved elsewhere.
 */
export function resolveHomeDailySummary(
  remote: RemoteTargets | null,
  local: DailySummary,
): HomeDailySummary {
  if (!remote) return { ...local, staleRemote: false };

  const remoteEmpty = remote.consumed.calories <= 0;
  const localHasIntake = local.consumed.calories > 0;
  if (remoteEmpty && localHasIntake) {
    return {
      calories: remote.calories,
      protein: remote.protein,
      carbs: remote.carbs,
      fat: remote.fat,
      consumed: local.consumed,
      completion: clampProgress(local.consumed.calories, remote.calories).percent,
      staleRemote: true,
    };
  }

  return {
    calories: remote.calories,
    protein: remote.protein,
    carbs: remote.carbs,
    fat: remote.fat,
    consumed: remote.consumed,
    completion: remote.completion,
    staleRemote: false,
  };
}
