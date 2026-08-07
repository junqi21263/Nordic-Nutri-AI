import Taro from "@tarojs/taro";
import { loginWithWechat } from "../api/auth-api";
import { getProductAccount } from "../api/product-data-api";
import { getLocalDateString } from "../features/onboarding/domain";
import { refreshProductAchievements } from "../features/coach/refresh-achievements";
import { hasSeenWelcome } from "../features/welcome/welcome-seen";
import { useMealStore } from "../stores/meal-store";
import { useProfileStore } from "../stores/profile-store";
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

function openWelcomeIfNeeded() {
  const pages = Taro.getCurrentPages();
  const route = pages[pages.length - 1]?.route || "";
  if (route.includes("pages/welcome/index")) return Promise.resolve();
  return Taro.reLaunch({ url: "/pages/welcome/index" });
}

async function loadIdentity(user: { id: string }) {
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

const authBootstrap = createAuthBootstrap({
  restore: restoreSession,
  getUser: getCurrentUser,
  refresh: refreshSession,
  login: loginWithWechat,
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
    openOnboarding: () => Taro.reLaunch({ url: "/pages/onboarding/index" }),
    openLogin: () => Taro.reLaunch({ url: "/pages/auth-entry/index" }),
    openWelcome: () => openWelcomeIfNeeded(),
  },
);

export function startApplicationAuth(options?: {
  force?: boolean;
  allowSilentLogin?: boolean;
}) {
  return applicationLaunch.start(options);
}
