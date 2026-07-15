import Taro from "@tarojs/taro";
import { createOnboardingDraftStore, type OnboardingDraftStorage } from "./onboarding-draft-state";

const storageKey = "nordic-nutri:onboarding-draft:v1";

const taroDraftStorage: OnboardingDraftStorage = {
  read: () => {
    try {
      return Taro.getStorageSync(storageKey);
    } catch {
      return null;
    }
  },
  write: (draft) => {
    try {
      Taro.setStorageSync(storageKey, draft);
    } catch {
      // Local draft persistence is best-effort and never blocks onboarding.
    }
  },
  clear: () => {
    try {
      Taro.removeStorageSync(storageKey);
    } catch {
      // Local draft persistence is best-effort and never blocks onboarding.
    }
  },
};

export { createOnboardingDraftStore } from "./onboarding-draft-state";
export type { OnboardingDraftStorage, OnboardingDraftStore } from "./onboarding-draft-state";

export const useOnboardingDraftStore = createOnboardingDraftStore(taroDraftStorage);
