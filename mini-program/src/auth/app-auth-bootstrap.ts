import Taro from "@tarojs/taro";
import { loginWithWechat } from "../api/auth-api";
import { getPublicRuntimeConfig } from "../api/environment";
import { getSupabaseClient } from "../lib/supabase-client";
import { createProfileRepository, type ProfileRepositoryClient } from "../repositories/profile-repository";
import { selectRuntimeAdapter } from "../repositories/runtime-adapter";
import { useProfileStore } from "../stores/profile-store";
import { isOnboardingCompleted } from "../utils/local-experience";
import { createAuthBootstrap } from "./auth-bootstrap";
import { createRuntimeApplicationLaunch } from "./application-launch";
import { createProfileIdentityLoader } from "./profile-identity-loader";
import { clearInvalidSession, getCurrentUser, refreshSession, restoreSession } from "./session-manager";

const profileIdentityLoader = createProfileIdentityLoader({
  beginUser: (userId) => useProfileStore.getState().beginUser(userId),
  hydrate: (userId, profile, settings) => useProfileStore.getState().hydrate(userId, profile, settings),
  getIdentity: (userId) => createProfileRepository(getSupabaseClient() as unknown as ProfileRepositoryClient).getIdentity(userId),
});

async function loadIdentity(user: { id: string }) {
  const runtime = getPublicRuntimeConfig();
  if (selectRuntimeAdapter(runtime) !== "supabase") return;
  await profileIdentityLoader.load(user.id);
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
  start: authBootstrap.start,
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
