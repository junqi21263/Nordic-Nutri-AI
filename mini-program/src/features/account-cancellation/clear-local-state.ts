import { useMealStore } from "../../stores/meal-store";
import { useOnboardingDraftStore } from "../../stores/onboarding-draft-store";
import { useProfileStore } from "../../stores/profile-store";
import { clearOnboardingCompleted } from "../../utils/local-experience";
import { clearFirstRunTips } from "../first-run-tips/first-run-tips";

/**
 * Wipe device-local product state after account cancellation (or forced
 * re-login). Auth session clearing stays in session-manager.signOut.
 * Welcome-seen is intentionally left alone so a wiped zombie session can
 * re-login without bouncing back to the welcome screen.
 */
export function clearProductLocalState() {
  try {
    useMealStore.getState().resetUserData();
  } catch {
    // Local meal cache is best-effort.
  }
  try {
    useProfileStore.getState().reset();
  } catch {
    // Local profile cache is best-effort.
  }
  try {
    useOnboardingDraftStore.getState().reset();
  } catch {
    // Onboarding draft is best-effort.
  }
  clearOnboardingCompleted();
  clearFirstRunTips();
}
