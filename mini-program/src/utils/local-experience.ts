import Taro from "@tarojs/taro";

const storageKey = "nordic-nutri:experience:v1";

type LocalExperienceState = {
  onboardingCompleted?: boolean;
};

/**
 * Session memory for the onboarding gate. `null` = not synced from server yet.
 * Routing must not treat disk-only `true` as complete (cancelled re-login).
 */
let memoryOnboardingCompleted: boolean | null = null;

const readState = (): LocalExperienceState => {
  try {
    return (Taro.getStorageSync(storageKey) as LocalExperienceState) || {};
  } catch {
    return {};
  }
};

/** True only after this session marked complete (login/account sync or plan save). */
export const isOnboardingCompleted = () => memoryOnboardingCompleted === true;

export const markOnboardingCompleted = () => {
  memoryOnboardingCompleted = true;
  try {
    Taro.setStorageSync(storageKey, { ...readState(), onboardingCompleted: true });
  } catch {
    // The first-use flow must remain available even if device storage is unavailable.
  }
};

export const clearOnboardingCompleted = () => {
  memoryOnboardingCompleted = false;
  try {
    const next = { ...readState() };
    delete next.onboardingCompleted;
    Taro.setStorageSync(storageKey, next);
  } catch {
    // Best-effort; missing storage must not block cancellation or re-login.
  }
};

export const syncOnboardingCompletedFromServer = (onboardingRequired: boolean | null | undefined) => {
  // Only an explicit false means the server says onboarding is done. Missing or
  // true must clear the local flag so cancelled re-logins cannot skip onboarding.
  if (onboardingRequired === false) markOnboardingCompleted();
  else clearOnboardingCompleted();
};

export const syncOnboardingCompletedFromAccount = (onboardingCompleted: boolean | null | undefined) => {
  if (onboardingCompleted === true) markOnboardingCompleted();
  else clearOnboardingCompleted();
};

/** Test helper: simulate a cold JS context before any server sync. */
export const resetOnboardingCompletionMemory = () => {
  memoryOnboardingCompleted = null;
};
