import { type AppAuthSession, type AppAuthUser, useAuthStore } from "./auth-store";
import { useAchievementStore } from "../stores/achievement-store";
import { createSecureTokenStorage } from "../platform/secure-token-storage";
import { AndroidAuthApiError, androidAuthApi, toAppSession, type AndroidAuthSessionResult } from "../api/android-auth-api";

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
    refreshInFlight = (async () => {
      const current = await restoreSession();
      if (!current?.refreshToken) return null;
      try {
        const result = await androidAuthApi.refresh(current.refreshToken) as AndroidAuthSessionResult;
        return setNativeSession(toAppSession(result));
      } catch (error) {
        if (error instanceof AndroidAuthApiError && (error.status === 401 || error.code === "AUTH_REFRESH_INVALID")) {
          return null;
        }
        throw error;
      }
    })().finally(() => {
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
  const refreshToken = (await restoreSession())?.refreshToken;
  try {
    if (refreshToken) await androidAuthApi.logout(refreshToken);
  } catch {
    // Local sign-out must always succeed even when the device is offline.
  } finally {
    await clearInvalidSession();
  }
}

export function setNativeSession(session: AppAuthSession): AppAuthSession {
  persistSession(session);
  useAuthStore.getState().setSession(session);
  void import("../features/smart-reminders/coordinator").then(({ refreshAndroidSmartReminders }) => refreshAndroidSmartReminders()).catch(() => undefined);
  void import("../features/smart-reminders/push-coordinator").then(({ syncAndroidPushToken }) => syncAndroidPushToken()).catch(() => undefined);
  return session;
}
