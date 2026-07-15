import Taro from "@tarojs/taro";

const storageKey = "nordic-nutri:experience:v1";

type LocalExperienceState = {
  onboardingCompleted?: boolean;
};

const readState = (): LocalExperienceState => {
  try {
    return (Taro.getStorageSync(storageKey) as LocalExperienceState) || {};
  } catch {
    return {};
  }
};

export const isOnboardingCompleted = () => Boolean(readState().onboardingCompleted);

export const markOnboardingCompleted = () => {
  try {
    Taro.setStorageSync(storageKey, { ...readState(), onboardingCompleted: true });
  } catch {
    // The first-use flow must remain available even if device storage is unavailable.
  }
};
