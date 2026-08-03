import { useMealStore } from "../../stores/meal-store";
import { useOnboardingDraftStore } from "../../stores/onboarding-draft-store";
import { useProfileStore } from "../../stores/profile-store";
import { clearWelcomeSeen } from "../welcome/welcome-seen";
import { clearOnboardingCompleted } from "../../utils/local-experience";

/**
 * Wipe device-local product state after account cancellation (or forced
 * re-login). Auth session clearing stays in session-manager.signOut.
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
  clearWelcomeSeen();
}
