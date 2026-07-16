import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import Taro from "@tarojs/taro";
import { getPublicRuntimeConfig } from "../api/environment";
import { getWechatFetch } from "./wechat-fetch";

const storage: SupportedStorage = {
  getItem: (key) => {
    try { return Taro.getStorageSync(key) || null; } catch { return null; }
  },
  setItem: (key, value) => { try { Taro.setStorageSync(key, value); } catch { /* best effort */ } },
  removeItem: (key) => { try { Taro.removeStorageSync(key); } catch { /* best effort */ } },
};

let singleton: SupabaseClient | null = null;
export function getSupabaseClient(): SupabaseClient {
  if (singleton) return singleton;
  const config = getPublicRuntimeConfig();
  if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error("Supabase public configuration is missing");
  singleton = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: getWechatFetch() },
  });
  return singleton;
}
