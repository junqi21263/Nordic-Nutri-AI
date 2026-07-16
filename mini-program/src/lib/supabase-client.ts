import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import Taro from "@tarojs/taro";
import { getPublicRuntimeConfig } from "../api/environment";
import { getWechatFetch, installWechatHeadersCompat } from "./wechat-fetch";

const storage: SupportedStorage = {
  getItem: (key) => {
    try { return Taro.getStorageSync(key) || null; } catch { return null; }
  },
  setItem: (key, value) => { try { Taro.setStorageSync(key, value); } catch { /* best effort */ } },
  removeItem: (key) => { try { Taro.removeStorageSync(key); } catch { /* best effort */ } },
};

let singleton: SupabaseClient | null = null;

type InitializationStage = "config-validation" | "url-validation" | "fetch-adapter" | "client-create";
type InitializationCauseName = "ConfigurationError" | "InvalidSupabaseUrlError" | "ReferenceError" | "TypeError" | "WechatFetchUnavailableError";
type InitializationCauseMessage =
  | "Supabase public configuration is missing"
  | "Supabase URL is invalid"
  | "URL is not defined"
  | "URL is not a constructor"
  | "Headers is not defined"
  | "Headers is not a constructor"
  | "Request is not defined"
  | "Response is not defined"
  | "AbortController is not defined"
  | "微信网络能力不可用"
  | "初始化依赖抛出了本地异常";
type MissingCapability = "URL" | "Headers" | "Request" | "Response" | "AbortController" | "wx.request";

function initializationError(
  initializationStage: InitializationStage,
  causeName: InitializationCauseName,
  causeMessage: InitializationCauseMessage,
  missingCapability?: MissingCapability,
): Error {
  const error = new Error("Supabase 客户端初始化失败");
  error.name = "SupabaseClientInitializationError";
  Object.assign(error, { initializationStage, causeName, causeMessage, ...(missingCapability ? { missingCapability } : {}) });
  return error;
}

function classifyClientCreateError(error: unknown): {
  causeName: InitializationCauseName;
  causeMessage: InitializationCauseMessage;
  missingCapability?: MissingCapability;
} {
  if (!(error instanceof Error)) {
    return { causeName: "TypeError", causeMessage: "初始化依赖抛出了本地异常" };
  }
  const knownCapabilities: Array<[InitializationCauseMessage, MissingCapability]> = [
    ["Headers is not defined", "Headers"],
    ["Headers is not a constructor", "Headers"],
    ["Request is not defined", "Request"],
    ["Response is not defined", "Response"],
    ["AbortController is not defined", "AbortController"],
    ["URL is not defined", "URL"],
    ["URL is not a constructor", "URL"],
  ];
  const capability = knownCapabilities.find(([message]) => error.message === message);
  if (capability) {
    return {
      causeName: error.name === "ReferenceError" ? "ReferenceError" : "TypeError",
      causeMessage: capability[0],
      missingCapability: capability[1],
    };
  }
  return { causeName: "TypeError", causeMessage: "初始化依赖抛出了本地异常" };
}

export function getSupabaseClient(): SupabaseClient {
  if (singleton) return singleton;
  const config = getPublicRuntimeConfig();
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw initializationError("config-validation", "ConfigurationError", "Supabase public configuration is missing");
  }
  try {
    new URL(config.supabaseUrl);
  } catch (error) {
    if (error instanceof ReferenceError) {
      throw initializationError("url-validation", "ReferenceError", "URL is not defined", "URL");
    }
    throw initializationError("url-validation", "InvalidSupabaseUrlError", "Supabase URL is invalid");
  }
  let fetch: typeof globalThis.fetch;
  try {
    fetch = getWechatFetch();
  } catch (error) {
    if (error instanceof Error && error.name === "WechatFetchUnavailableError") {
      throw initializationError("fetch-adapter", "WechatFetchUnavailableError", "微信网络能力不可用", "wx.request");
    }
    throw initializationError("fetch-adapter", "TypeError", "初始化依赖抛出了本地异常");
  }
  try {
    installWechatHeadersCompat();
    singleton = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch },
    });
  } catch (error) {
    const cause = classifyClientCreateError(error);
    throw initializationError("client-create", cause.causeName, cause.causeMessage, cause.missingCapability);
  }
  return singleton;
}
