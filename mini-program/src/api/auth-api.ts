import Taro from "@tarojs/taro";
import { getSupabaseClient } from "../lib/supabase-client";
import { getCurrentUser, restoreSession } from "../auth/session-manager";

let loginInFlight: Promise<Awaited<ReturnType<typeof getCurrentUser>>> | null = null;

export async function exchangeWechatTokenHash(tokenHash: string) {
  const { data, error } = await getSupabaseClient().auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error || !data.session) throw new Error("WeChat session exchange failed");
  return data.session;
}
export async function loginWithWechat() {
  if (!loginInFlight) {
    loginInFlight = (async () => {
      const login = await Taro.login();
      if (!login.code) throw new Error("WeChat login code is missing");
      const { data, error } = await getSupabaseClient().functions.invoke<{ success: boolean; data?: { tokenHash: string } }>("wechat-login", { body: { code: login.code } });
      if (error || !data?.success || !data.data?.tokenHash) throw new Error("WeChat login failed");
      await exchangeWechatTokenHash(data.data.tokenHash);
      const user = await getCurrentUser();
      if (!user) throw new Error("WeChat session verification failed");
      return user;
    })().finally(() => { loginInFlight = null; });
  }
  return loginInFlight;
}
export async function getCurrentProfile() {
  const { data, error } = await getSupabaseClient().from("profiles").select("*").single();
  if (error) throw new Error("Profile request failed");
  return data;
}
export { restoreSession };
