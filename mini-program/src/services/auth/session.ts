import type { AuthClient, AuthSession, SessionStorage } from "./types";

export const SESSION_STORAGE_KEY = "nordic_nutri_auth_session";

export function saveSession(storage: SessionStorage, session: AuthSession): void {
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function restoreSession(storage: SessionStorage): AuthSession | null {
  const serialized = storage.getItem(SESSION_STORAGE_KEY);
  if (!serialized) return null;

  try {
    const session = JSON.parse(serialized) as AuthSession;
    if (!session.accessToken || !session.refreshToken || !session.user?.id) return null;
    return session;
  } catch {
    storage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export async function refreshSession(
  client: AuthClient,
  storage: SessionStorage,
): Promise<AuthSession | null> {
  const session = await client.refreshSession();
  if (session) saveSession(storage, session);
  else clearSession(storage);
  return session;
}

export async function logout(client: AuthClient, storage: SessionStorage): Promise<void> {
  await client.signOut();
  clearSession(storage);
}

export function clearSession(storage: SessionStorage): void {
  storage.removeItem(SESSION_STORAGE_KEY);
}
