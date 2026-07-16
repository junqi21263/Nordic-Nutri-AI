import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabase-client";
import { useAuthStore } from "./auth-store";

let refreshInFlight: Promise<Session | null> | null = null;
export async function restoreSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) {
    useAuthStore.getState().clear();
    return null;
  }
  useAuthStore.getState().setSession(data.session);
  return data.session;
}
export async function refreshSession(): Promise<Session | null> {
  if (!refreshInFlight) refreshInFlight = getSupabaseClient().auth.refreshSession().then(({ data, error }) => {
    if (error || !data.session) {
      useAuthStore.getState().clear();
      return null;
    }
    useAuthStore.getState().setSession(data.session);
    return data.session;
  }).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
export async function clearInvalidSession() {
  await getSupabaseClient().auth.signOut({ scope: "local" });
  useAuthStore.getState().clear();
}
export async function signOut() { await clearInvalidSession(); }
export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error || !data.user) {
    useAuthStore.getState().clear();
    return null;
  }
  useAuthStore.getState().setSession((await getSupabaseClient().auth.getSession()).data.session);
  return data.user;
}
