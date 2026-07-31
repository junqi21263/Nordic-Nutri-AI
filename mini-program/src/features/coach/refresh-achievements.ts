import { getProductAchievements } from "../../api/insight-api";
import { getLocalDateString } from "../onboarding/domain";
import { useAchievementStore } from "../../stores/achievement-store";

/** Pull cloud achievements so newly unlocked badges can toast. */
export async function refreshProductAchievements(date = getLocalDateString()) {
  const achievements = await getProductAchievements(date);
  useAchievementStore.getState().setAchievements(achievements);
  return achievements;
}
