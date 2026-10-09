import Taro from "@tarojs/taro";
import { loginWithWechat } from "../api/auth-api";
import { androidAuthApi } from "../api/android-auth-api";
import type { AppAuthUser } from "./auth-store";
import { getProductAccount } from "../api/product-data-api";
import { getLocalDateString } from "../features/onboarding/domain";
import { refreshProductAchievements } from "../features/coach/refresh-achievements";
import { hasSeenWelcome } from "../features/welcome/welcome-seen";
import { useMealStore } from "../stores/meal-store";
import { useAchievementStore } from "../stores/achievement-store";
import { useProfileStore } from "../stores/profile-store";
import { useOnboardingDraftStore } from "../stores/onboarding-draft-store";
import {
  clearOnboardingCompleted,
  isOnboardingCompleted,
  syncOnboardingCompletedFromAccount,
} from "../utils/local-experience";
import { createAuthBootstrap } from "./auth-bootstrap";
import { createRuntimeApplicationLaunch } from "./application-launch";
import {
  clearInvalidSession,
  getCurrentUser,
  refreshSession,
  restoreSession,
} from "./session-manager";
import { useAppTransitionStore } from "../stores/app-transition-store";

const isAndroidApp = process.env.TARO_APP_PLATFORM === "android";

function finishWelcomeTransition() {
  if (!isAndroidApp) return;
  setTimeout(() => useAppTransitionStore.getState().hideWelcomeTransition(), 180);
}

function openWelcomeIfNeeded() {
  const pages = Taro.getCurrentPages();
  const route = pages[pages.length - 1]?.route || "";
  if (route.includes("pages/welcome/index")) return Promise.resolve();
  return Taro.reLaunch({ url: "/pages/welcome/index" });
}

function openLoginPage() {
  if (isAndroidApp) {
    return Taro.reLaunch({ url: "/pages/android-auth/index" }).then((result) => {
      finishWelcomeTransition();
      return result;
    });
  }
  return Taro.reLaunch({ url: "/pages/auth-entry/index" });
}

async function loadIdentity(user: { id: string }) {
  useAchievementStore.getState().setUserId(user.id);
  let account;
  try {
    account = await getProductAccount();
  } catch (error) {
    // Fail closed: never inherit a stale local "onboarding completed" when account is unread.
    clearOnboardingCompleted();
    throw error;
  }
  // Server profile timestamp is the source of truth for Home vs onboarding.
  syncOnboardingCompletedFromAccount(account.onboardingCompleted === true);
  if (account.onboardingCompleted !== true) {
    // Drop previous-account demo meals / cached goals so Home cannot look finished.
    try {
      useMealStore.getState().replaceRemoteMeals([], getLocalDateString());
    } catch {
      // best-effort
    }
    try {
      useProfileStore.getState().reset();
    } catch {
      // best-effort
    }
    useOnboardingDraftStore.getState().reset();
    if (account.onboardingDraft) useOnboardingDraftStore.getState().setDraft(account.onboardingDraft);
  }
  const labels: Record<string, string> = {
    muscle_gain: "增益增肌",
    fat_loss: "轻盈减脂",
    maintain: "保持状态",
    performance: "健康饮食",
  };
  // Prefer the server/bootstrap nickname when present so home/profile stay in sync.
  const realNickname = account.nickname && account.nickname !== "微信用户" ? account.nickname : null;
  useProfileStore.getState().hydrate(
    user.id,
    {
      ...(realNickname ? { nickname: realNickname } : { nickname: "" }),
      ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
      ...(account.weightKg != null ? { weight: account.weightKg } : {}),
      ...(account.goalType ? { goalLabel: labels[account.goalType] ?? "增益增肌" } : {}),
      ...(account.targetWeightKg != null ? { targetWeight: account.targetWeightKg } : {}),
      ...(account.nutritionPlan?.calories != null
        ? { targetCalories: account.nutritionPlan.calories }
        : account.targetCaloriesKcal != null
          ? { targetCalories: account.targetCaloriesKcal }
          : {}),
    },
    account.settings ?? {},
  );
  // Capture the existing achievement state before users can save a meal.
  // A later save refresh can then emit an achievementUnlocked event reliably.
  try {
    await refreshProductAchievements();
  } catch {
    // Achievement refresh must not prevent a valid user session from launching.
  }
}

function isAppAuthUser(value: unknown): value is AppAuthUser {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

const authBootstrap = createAuthBootstrap({
  preserveSessionOnError: isAndroidApp,
  restore: restoreSession,
  getUser: async () => {
    if (!isAndroidApp) return getCurrentUser();
    const result = await androidAuthApi.getMe() as { user?: unknown };
    return isAppAuthUser(result.user) ? result.user : null;
  },
  refresh: refreshSession,
  login: isAndroidApp ? async () => null : loginWithWechat,
  loadIdentity,
  clear: clearInvalidSession,
});

const applicationLaunch = createRuntimeApplicationLaunch(
  {
    start: (options) =>
      authBootstrap.start({
        allowSilentLogin: options?.allowSilentLogin ?? false,
        force: options?.force,
      }),
    getStatus: () => authBootstrap.getState().status,
  },
  {
    isOnboardingCompleted,
    hasSeenWelcome,
    openHome: () => Taro.switchTab({ url: "/pages/home/index" }),
    openOnboarding: () => Taro.reLaunch({ url: "/pages/onboarding/index" }).then((result) => {
      finishWelcomeTransition();
      return result;
    }),
    openLogin: openLoginPage,
    openWelcome: () => openWelcomeIfNeeded(),
  },
);

export function startApplicationAuth(options?: {
  force?: boolean;
  allowSilentLogin?: boolean;
}) {
  return applicationLaunch.start(options);
}
