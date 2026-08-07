import { type AppAuthSession, type AppAuthUser, useAuthStore } from "./auth-store";
import { useAchievementStore } from "../stores/achievement-store";

let refreshInFlight: Promise<AppAuthSession | null> | null = null;

const sessionStorageKey = "nordic-nutri:session:v1";

type NativeStorage = {
  getStorageSync: (key: string) => unknown;
  setStorageSync: (key: string, value: unknown) => void;
  removeStorageSync: (key: string) => void;
};
const nativeStorage = () => (globalThis as { wx?: NativeStorage }).wx;

function persistSession(session: AppAuthSession | null) {
  try {
    if (session) {
      nativeStorage()?.setStorageSync(sessionStorageKey, session);
    } else {
      nativeStorage()?.removeStorageSync(sessionStorageKey);
    }
  } catch {
    // Best-effort persistence
  }
}

function readPersistedSession(): AppAuthSession | null {
  try {
    const stored = nativeStorage()?.getStorageSync(sessionStorageKey);
    if (stored && typeof stored === "object" && "user" in stored && "accessToken" in stored) {
      return stored as AppAuthSession;
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
  return session;
}
