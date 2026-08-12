export type CelebrationOverlayPriority = "meal-saved" | "achievement" | null;

/**
 * Never mount two fullscreen celebrations at once. A just-saved meal owns the
 * screen first; an already queued achievement remains pending in its store and
 * is shown as soon as the meal celebration is dismissed.
 */
export function getCelebrationOverlayPriority({
  hasSavedMeal,
  hasAchievement,
}: {
  hasSavedMeal: boolean;
  hasAchievement: boolean;
}): CelebrationOverlayPriority {
  if (hasSavedMeal) return "meal-saved";
  return hasAchievement ? "achievement" : null;
}
