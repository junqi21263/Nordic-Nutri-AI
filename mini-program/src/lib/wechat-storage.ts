import type { SupportedStorage } from "@supabase/supabase-js";

export interface WechatSyncStorageApi {
  getStorageSync: (key: string) => unknown;
  setStorageSync: (key: string, value: string) => void;
  removeStorageSync: (key: string) => void;
}

export interface AuthStorageInspection {
  valueExists: boolean;
  valueType: "string" | "non-string" | "none";
  jsonParseSucceeded: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  shouldClear: boolean;
}

export function createWechatStorageAdapter(api: WechatSyncStorageApi): SupportedStorage {
  return {
    getItem: (key) => {
      try {
        const value = api.getStorageSync(key);
        return typeof value === "string" ? value : null;
      } catch {
        return null;
      }
    },
    setItem: (key, value) => { try { api.setStorageSync(key, value); } catch { /* best effort */ } },
    removeItem: (key) => { try { api.removeStorageSync(key); } catch { /* best effort */ } },
  };
}

export function getSupabaseAuthStorageKey(supabaseUrl: string): string | null {
  const hostname = supabaseUrl.trim().match(/^https?:\/\/([^/?#:]+)/i)?.[1];
  const projectRef = hostname?.split(".")[0];
  return projectRef ? `sb-${projectRef}-auth-token` : null;
}

export function inspectAuthStorageValue(value: unknown): AuthStorageInspection {
  if (value === null || value === undefined || value === "") {
    return { valueExists: false, valueType: "none", jsonParseSucceeded: false, hasAccessToken: false, hasRefreshToken: false, shouldClear: false };
  }
  if (typeof value !== "string") {
    return { valueExists: true, valueType: "non-string", jsonParseSucceeded: false, hasAccessToken: false, hasRefreshToken: false, shouldClear: true };
  }
  try {
    const parsed = JSON.parse(value) as { access_token?: unknown; refresh_token?: unknown };
    const hasAccessToken = typeof parsed.access_token === "string";
    const hasRefreshToken = typeof parsed.refresh_token === "string";
    return {
      valueExists: true,
      valueType: "string",
      jsonParseSucceeded: true,
      hasAccessToken,
      hasRefreshToken,
      shouldClear: !hasAccessToken || !hasRefreshToken,
    };
  } catch {
    return { valueExists: true, valueType: "string", jsonParseSucceeded: false, hasAccessToken: false, hasRefreshToken: false, shouldClear: true };
  }
}

export function sanitizeWechatAuthStorage(api: WechatSyncStorageApi, key: string): AuthStorageInspection {
  let value: unknown;
  try { value = api.getStorageSync(key); } catch { return inspectAuthStorageValue(null); }
  const inspection = inspectAuthStorageValue(value);
  if (inspection.shouldClear) {
    try { api.removeStorageSync(key); } catch { /* best effort */ }
  }
  return inspection;
}

export function clearWechatAuthStorage(api: WechatSyncStorageApi, key: string): void {
  try { api.removeStorageSync(key); } catch { /* best effort */ }
}
