import { type AppAuthSession, type AppAuthUser, useAuthStore } from "./auth-store";

let refreshInFlight: Promise<AppAuthSession | null> | null = null;

export async function getCurrentUser(): Promise<AppAuthUser | null> {
  return useAuthStore.getState().user;
}

export async function restoreSession(): Promise<AppAuthSession | null> {
  return useAuthStore.getState().session;
}

export async function refreshSession(): Promise<AppAuthSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = restoreSession().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function clearInvalidSession() {
  useAuthStore.getState().clear();
}

export async function signOut() { await clearInvalidSession(); }

export function setNativeSession(user: AppAuthUser, accessToken?: string): AppAuthSession {
  const session: AppAuthSession = { user, accessToken };
  useAuthStore.getState().setSession(session);
  return session;
}
