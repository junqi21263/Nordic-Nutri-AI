import { type AppAuthSession, type AppAuthUser, useAuthStore } from "./auth-store";
import { useAchievementStore } from "../stores/achievement-store";
import { createSecureTokenStorage } from "../platform/secure-token-storage";

let refreshInFlight: Promise<AppAuthSession | null> | null = null;

const sessionStorageKey = "nordic-nutri:session:v1";

type NativeStorage = {
  getStorageSync: (key: string) => unknown;
  setStorageSync: (key: string, value: unknown) => void;
  removeStorageSync: (key: string) => void;
};
const nativeStorage = () => (globalThis as { wx?: NativeStorage }).wx;

function sessionStorage() {
  const secure = createSecureTokenStorage();
  if (secure) return secure;
  const native = nativeStorage();
  if (!native) return null;
  return {
    getItem: (key: string) => native.getStorageSync(key) as string | null,
    setItem: (key: string, value: string) => native.setStorageSync(key, value),
    removeItem: (key: string) => native.removeStorageSync(key),
  };
}

function persistSession(session: AppAuthSession | null) {
  try {
    if (session) {
      sessionStorage()?.setItem(sessionStorageKey, JSON.stringify(session));
    } else {
      sessionStorage()?.removeItem(sessionStorageKey);
    }
  } catch {
    // Best-effort persistence
  }
}

function readPersistedSession(): AppAuthSession | null {
  try {
    const serialized = sessionStorage()?.getItem(sessionStorageKey);
    if (serialized) {
      const stored = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
      if (stored && typeof stored === "object" && "user" in stored && "accessToken" in stored) return stored as AppAuthSession;
    }
  } catch {
    // Best-effort read
  }
  return null;
}

export async function getCurrentUser(): Promise<AppAuthUser | null> {
  return useAuthStore.getState().user;
}

export async function restoreSession(): Promise<AppAuthSession | null> {
  // First check in-memory store
  const memorySession = useAuthStore.getState().session;
  if (memorySession) return memorySession;
  // Then check persisted storage (survives app restarts)
  const persisted = readPersistedSession();
  if (persisted) {
    useAuthStore.getState().setSession(persisted);
    if (process.env.TARO_APP_PLATFORM === "android") {
      void import("../features/smart-reminders/push-coordinator")
        .then(({ syncAndroidPushToken }) => syncAndroidPushToken())
        .catch(() => undefined);
    }
    return persisted;
  }
  return null;
}

export async function refreshSession(): Promise<AppAuthSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = restoreSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function clearInvalidSession() {
  await import("../features/smart-reminders/coordinator").then(({ cancelAndroidSmartReminders }) => cancelAndroidSmartReminders()).catch(() => undefined);
  await import("../features/smart-reminders/push-coordinator").then(({ unregisterAndroidPushToken }) => unregisterAndroidPushToken()).catch(() => undefined);
  persistSession(null);
  useAuthStore.getState().clear();
  useAchievementStore.getState().reset();
}

export async function signOut() {
  await clearInvalidSession();
}

export function setNativeSession(user: AppAuthUser, accessToken?: string): AppAuthSession {
  const session: AppAuthSession = { user, accessToken };
  persistSession(session);
  useAuthStore.getState().setSession(session);
  void import("../features/smart-reminders/coordinator").then(({ refreshAndroidSmartReminders }) => refreshAndroidSmartReminders()).catch(() => undefined);
  void import("../features/smart-reminders/push-coordinator").then(({ syncAndroidPushToken }) => syncAndroidPushToken()).catch(() => undefined);
  return session;
}
