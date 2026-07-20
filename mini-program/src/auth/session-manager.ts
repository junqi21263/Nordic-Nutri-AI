import { getCloudbaseAuth, getCloudbaseDatabase } from "../lib/cloudbase";
import { type AppAuthSession, type AppAuthUser, useAuthStore } from "./auth-store";
import { parseCloudbaseSession } from "./cloudbase-session";
import { ensureCloudbaseProductUser, type CloudbaseProductSessionClient } from "./cloudbase-product-session";

let refreshInFlight: Promise<AppAuthSession | null> | null = null;

export async function getCurrentUser(): Promise<AppAuthUser | null> {
  const user = parseCloudbaseSession(await getCloudbaseAuth().getSession())?.user ?? null;
  if (!user) useAuthStore.getState().clear();
  return user;
}

export async function restoreSession(): Promise<AppAuthSession | null> {
  const cloudbaseSession = parseCloudbaseSession(await getCloudbaseAuth().getSession());
  if (!cloudbaseSession) {
    useAuthStore.getState().setSession(null);
    return null;
  }
  const userId = await ensureCloudbaseProductUser(getCloudbaseDatabase() as unknown as CloudbaseProductSessionClient);
  const session: AppAuthSession = { user: { id: userId, email: cloudbaseSession.user.email } };
  useAuthStore.getState().setSession(session);
  return session;
}

export async function refreshSession(): Promise<AppAuthSession | null> {
  if (!refreshInFlight) refreshInFlight = restoreSession().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function clearInvalidSession() {
  await getCloudbaseAuth().signOut();
  useAuthStore.getState().clear();
}
export async function signOut() { await clearInvalidSession(); }
