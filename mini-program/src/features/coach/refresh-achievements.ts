import {
  evaluateProductAchievements as evaluateProductAchievementsRequest,
  getProductAchievements,
} from "../../api/insight-api";
import { getLocalDateString } from "../onboarding/domain";
import { useAchievementStore } from "../../stores/achievement-store";

/** Pull cloud achievements so newly unlocked badges can toast. */
export async function refreshProductAchievements(date = getLocalDateString()) {
  const achievements = await getProductAchievements(date);
  useAchievementStore.getState().setAchievements(achievements);
  return achievements;
}

/** Recalculate after a user action so the server can return its pending unlock event. */
export async function evaluateProductAchievements(date = getLocalDateString()) {
  const evaluation = await evaluateProductAchievementsRequest(date);
  useAchievementStore.getState().setAchievements(evaluation.achievements);
  return evaluation;
}
