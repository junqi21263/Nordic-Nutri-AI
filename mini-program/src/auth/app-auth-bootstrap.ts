import Taro from "@tarojs/taro";
import { loginWithWechat } from "../api/auth-api";
import { getProductAccount } from "../api/product-data-api";
import { useProfileStore } from "../stores/profile-store";
import { isOnboardingCompleted } from "../utils/local-experience";
import { createAuthBootstrap } from "./auth-bootstrap";
import { createRuntimeApplicationLaunch } from "./application-launch";
import { clearInvalidSession, getCurrentUser, refreshSession, restoreSession } from "./session-manager";

async function loadIdentity(user: { id: string }) {
  const account = await getProductAccount();
  const labels: Record<string, string> = { muscle_gain: "精益增肌", fat_loss: "轻盈减脂", maintain: "保持状态", performance: "运动表现" };
  useProfileStore.getState().hydrate(user.id, {
    ...(account.nickname ? { nickname: account.nickname } : {}),
    ...(account.weightKg ? { weight: account.weightKg } : {}),
    ...(account.goalType ? { goalLabel: labels[account.goalType] ?? "精益增肌" } : {}),
    ...(account.targetWeightKg ? { targetWeight: account.targetWeightKg } : {}),
    ...(account.targetCaloriesKcal ? { targetCalories: account.targetCaloriesKcal } : {}),
  }, {});
}

const authBootstrap = createAuthBootstrap({
  restore: restoreSession,
  getUser: getCurrentUser,
  refresh: refreshSession,
  login: loginWithWechat,
  loadIdentity,
  clear: clearInvalidSession,
});

const applicationLaunch = createRuntimeApplicationLaunch({
  start: () => authBootstrap.start({ allowSilentLogin: false }),
  getStatus: () => authBootstrap.getState().status,
}, {
  isOnboardingCompleted,
  openHome: () => Taro.switchTab({ url: "/pages/home/index" }),
  openOnboarding: () => Taro.reLaunch({ url: "/pages/onboarding/index" }),
  openLogin: () => Taro.reLaunch({ url: "/pages/auth-entry/index" }),
});

export function startApplicationAuth() {
  return applicationLaunch.start();
}
