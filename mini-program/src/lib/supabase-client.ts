import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import { window as taroWindow } from "@tarojs/runtime";
import Taro from "@tarojs/taro";
import { getPublicRuntimeConfig } from "../api/environment";
import { describeInitializationError } from "../dev/supabase-initialization-probe";
import { getWechatFetch, installWechatHeadersCompat } from "./wechat-fetch";
import { unavailableWechatRealtimeTransport } from "./wechat-realtime-transport";
import {
  clearWechatAuthStorage,
  createWechatStorageAdapter,
  getSupabaseAuthStorageKey,
  inspectAuthStorageValue,
  sanitizeWechatAuthStorage,
  type AuthStorageInspection,
} from "./wechat-storage";
import {
  getWechatUrlCompatibilityDiagnostics,
  installWechatUrlCompatibility,
  withWechatAuthLocation,
} from "./wechat-url";

const wechatStorageApi = {
  getStorageSync: Taro.getStorageSync.bind(Taro),
  setStorageSync: Taro.setStorageSync.bind(Taro),
  removeStorageSync: Taro.removeStorageSync.bind(Taro),
};

export const wechatStorage: SupportedStorage = createWechatStorageAdapter(wechatStorageApi);

let singleton: SupabaseClient | null = null;
let createdClientCount = 0;

type InitializationStage = "config-validation" | "url-validation" | "fetch-adapter" | "client-create";
type InitializationCauseName = "ConfigurationError" | "InvalidSupabaseUrlError" | "ReferenceError" | "TypeError" | "WechatFetchUnavailableError";
type InitializationCauseMessage = string;
type MissingCapability = "URL" | "Headers" | "Request" | "Response" | "AbortController" | "wx.request";

function initializationError(
  initializationStage: InitializationStage,
  causeName: InitializationCauseName,
  causeMessage: InitializationCauseMessage,
  missingCapability?: MissingCapability,
  cause?: unknown,
): Error {
  const error = new Error("Supabase 客户端初始化失败");
  error.name = "SupabaseClientInitializationError";
  Object.assign(error, { initializationStage, causeName, causeMessage, ...(missingCapability ? { missingCapability } : {}), ...(cause ? { cause } : {}) });
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
  return { causeName: error.name === "ReferenceError" ? "ReferenceError" : "TypeError", causeMessage: error.message || "Unknown local error" };
}

export function getSupabaseClient(): SupabaseClient {
  if (singleton) return singleton;
  const config = getPublicRuntimeConfig();
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw initializationError("config-validation", "ConfigurationError", "Supabase public configuration is missing");
  }
  installWechatUrlCompatibility();
  try {
    new URL(config.supabaseUrl);
  } catch (error) {
    if (error instanceof ReferenceError) {
      throw initializationError("url-validation", "ReferenceError", error.message, "URL", error);
    }
    const message = error instanceof Error ? error.message : "Supabase URL is invalid";
    throw initializationError("url-validation", "InvalidSupabaseUrlError", message, undefined, error);
  }
  let fetch: typeof globalThis.fetch;
  try {
    fetch = getWechatFetch(config.supabaseUrl);
  } catch (error) {
    if (error instanceof Error && error.name === "WechatFetchUnavailableError") {
      throw initializationError("fetch-adapter", "WechatFetchUnavailableError", "微信网络能力不可用", "wx.request");
    }
    const message = error instanceof Error ? error.message : "Unknown local error";
    throw initializationError("fetch-adapter", "TypeError", message, undefined, error);
  }
  try {
    installWechatHeadersCompat();
    const storageKey = getSupabaseAuthStorageKey(config.supabaseUrl);
    if (storageKey) sanitizeWechatAuthStorage(wechatStorageApi, storageKey);
    singleton = withWechatAuthLocation(taroWindow, () =>
      createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { storage: wechatStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        global: { fetch },
        realtime: { transport: unavailableWechatRealtimeTransport },
      }),
    );
    createdClientCount += 1;
  } catch (error) {
    const cause = classifyClientCreateError(error);
    const wrapped = initializationError("client-create", cause.causeName, cause.causeMessage, cause.missingCapability, error);
    Object.assign(wrapped, {
      localDiagnosticSafe: true,
      ...describeInitializationError("createClientFull", error),
      urlCompatibilityDiagnosticSafe: true,
      urlCompatibility: getWechatUrlCompatibilityDiagnostics(),
    });
    throw wrapped;
  }
  return singleton;
}

export function getSupabaseClientInstanceCount(): number {
  return createdClientCount;
}

export function clearSupabaseAuthCache(): boolean {
  const storageKey = getSupabaseAuthStorageKey(getPublicRuntimeConfig().supabaseUrl);
  if (!storageKey) return false;
  clearWechatAuthStorage(wechatStorageApi, storageKey);
  return true;
}

export function inspectSupabaseAuthCache(): AuthStorageInspection {
  const storageKey = getSupabaseAuthStorageKey(getPublicRuntimeConfig().supabaseUrl);
  if (!storageKey) return inspectAuthStorageValue(null);
  try {
    return inspectAuthStorageValue(wechatStorageApi.getStorageSync(storageKey));
  } catch {
    return inspectAuthStorageValue(null);
  }
}
