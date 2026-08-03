import Taro from "@tarojs/taro";

const storageKey = "nordic-nutri:experience:v1";

type LocalExperienceState = {
  onboardingCompleted?: boolean;
  welcomeSeen?: boolean;
};

function readState(): LocalExperienceState {
  try {
    return (Taro.getStorageSync(storageKey) as LocalExperienceState) || {};
  } catch {
    return {};
  }
}

export function hasSeenWelcome(): boolean {
  return Boolean(readState().welcomeSeen);
}

export function markWelcomeSeen(): void {
  try {
    Taro.setStorageSync(storageKey, { ...readState(), welcomeSeen: true });
  } catch {
    // First-use flow must remain available even if device storage is unavailable.
  }
}

export function clearWelcomeSeen(): void {
  try {
    const next = { ...readState() };
    delete next.welcomeSeen;
    Taro.setStorageSync(storageKey, next);
  } catch {
    // Best-effort; missing storage must not block cancellation or re-login.
  }
}
