import type { SupportedStorage } from "@supabase/supabase-js";

export type InitializationProbeStep =
  | "configNormalize"
  | "urlConstructor"
  | "createClientMinimal"
  | "storageAdapter"
  | "createClientStorage"
  | "createClientRefresh"
  | "createClientFull"
  | "functionInvoke";

export type InitializationProbeStatus = "idle" | "success" | "error";

export interface InitializationErrorDetails {
  initializationSubstage: InitializationProbeStep;
  rawErrorName: string;
  rawErrorMessage: string;
  rawCauseName: string | null;
  rawCauseMessage: string | null;
  stackFrames: string[];
  errorFile: string | null;
  errorFunction: string | null;
}

export interface InitializationProbeEntry {
  status: InitializationProbeStatus;
  error: InitializationErrorDetails | null;
  detail: Record<string, boolean | number | string | null> | null;
}

export interface NormalizedPublicConfig {
  valid: boolean;
  reason: string | null;
  url: string | null;
  key: string | null;
  detail: Record<string, boolean | number>;
}

type CauseLike = { name?: unknown; message?: unknown };
type ErrorLike = Error & { cause?: CauseLike };

const sensitivePattern = /(sb_publishable_|sb_secret_)[^\s'"),]+/gi;
const assignmentPattern = /((?:authorization|access_token|refresh_token|token_hash|openid|unionid|session_key|wechat_app_secret|wechat_identity_pepper|appsecret|pepper|code)\s*[:=]\s*)([^\s,;]+)/gi;
const bearerPattern = /(Bearer\s+)[^\s,;]+/gi;
const urlQueryPattern = /(https?:\/\/[^\s?]+)\?[^\s)]+/gi;

function redact(value: string): string {
  return value
    .replace(sensitivePattern, "$1[redacted]")
    .replace(assignmentPattern, "$1[redacted]")
    .replace(bearerPattern, "$1[redacted]")
    .replace(urlQueryPattern, "$1");
}

function errorName(value: unknown): string {
  return value instanceof Error && value.name ? redact(value.name) : "UnknownError";
}

function errorMessage(value: unknown): string {
  return value instanceof Error && typeof value.message === "string" ? redact(value.message) : "Unknown local error";
}

function localFrames(error: Error): string[] {
  return (error.stack ?? "")
    .split("\n")
    .slice(1)
    .map((frame) => redact(frame.trim()))
    .filter((frame) => frame.startsWith("at "))
    .slice(0, 3);
}

function frameLocation(frame: string | undefined): { errorFile: string | null; errorFunction: string | null } {
  if (!frame) return { errorFile: null, errorFunction: null };
  const functionMatch = frame.match(/^at (?:new )?([^ (]+)/);
  const fileMatch = frame.match(/([A-Za-z0-9_.-]+\.(?:[cm]?[jt]s|jsx|tsx))/);
  return { errorFile: fileMatch?.[1] ?? null, errorFunction: functionMatch?.[1] ?? null };
}

export function describeInitializationError(
  initializationSubstage: InitializationProbeStep,
  error: unknown,
): InitializationErrorDetails {
  const source = error instanceof Error ? error : new Error("Unknown local error");
  const cause = (source as ErrorLike).cause;
  const stackFrames = localFrames(source);
  const location = frameLocation(stackFrames[0]);
  return {
    initializationSubstage,
    rawErrorName: errorName(source),
    rawErrorMessage: errorMessage(source),
    rawCauseName: typeof cause?.name === "string" ? redact(cause.name) : null,
    rawCauseMessage: typeof cause?.message === "string" ? redact(cause.message) : null,
    stackFrames,
    ...location,
  };
}

function hasQuotesOrSemicolon(value: string): boolean {
  return /["';]/.test(value);
}

function hasSupportedPublicKeyPrefix(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("eyJ");
}

export function normalizeSupabasePublicConfig(input: {
  supabaseUrl: string;
  supabasePublishableKey: string;
}): NormalizedPublicConfig {
  const rawUrl = input.supabaseUrl;
  const rawKey = input.supabasePublishableKey;
  const url = rawUrl.trim();
  const key = rawKey.trim();
  const detail = {
    supabaseUrlString: typeof rawUrl === "string",
    publishableKeyString: typeof rawKey === "string",
    urlLength: url.length,
    keyLength: key.length,
    urlHasOuterWhitespace: rawUrl !== url,
    urlHasQuotes: /["']/.test(rawUrl),
    urlHasSemicolon: rawUrl.includes(";"),
    urlStartsWithHttps: url.startsWith("https://"),
    keyHasSupportedPrefix: hasSupportedPublicKeyPrefix(key),
  };
  if (!url || !key) return { valid: false, reason: "Supabase public configuration is missing", url: null, key: null, detail };
  if (hasQuotesOrSemicolon(rawUrl)) return { valid: false, reason: "URL contains quotes or a semicolon", url: null, key: null, detail };
  if (!url.startsWith("https://")) return { valid: false, reason: "URL must start with https://", url: null, key: null, detail };
  if (!hasSupportedPublicKeyPrefix(key)) return { valid: false, reason: "Publishable key prefix is invalid", url: null, key: null, detail };
  return { valid: true, reason: null, url, key, detail };
}

function entry(status: InitializationProbeStatus, error: InitializationErrorDetails | null = null, detail: InitializationProbeEntry["detail"] = null): InitializationProbeEntry {
  return { status, error, detail };
}

export function createInitializationMatrix(): Record<InitializationProbeStep, InitializationProbeEntry> {
  return {
    configNormalize: entry("idle"),
    urlConstructor: entry("idle"),
    createClientMinimal: entry("idle"),
    storageAdapter: entry("idle"),
    createClientStorage: entry("idle"),
    createClientRefresh: entry("idle"),
    createClientFull: entry("idle"),
    functionInvoke: entry("idle"),
  };
}

export async function probeSupabaseInitialization(input: {
  config: { supabaseUrl: string; supabasePublishableKey: string };
  fetch: typeof globalThis.fetch;
  storage: SupportedStorage;
  getFullClient: () => unknown;
}): Promise<Record<InitializationProbeStep, InitializationProbeEntry>> {
  const matrix = createInitializationMatrix();
  const normalized = normalizeSupabasePublicConfig(input.config);
  matrix.configNormalize = normalized.valid
    ? entry("success", null, normalized.detail)
    : entry("error", describeInitializationError("configNormalize", new Error(normalized.reason ?? "Invalid configuration")), normalized.detail);
  if (!normalized.valid || !normalized.url || !normalized.key) return matrix;

  try {
    const url = new URL(normalized.url);
    const authUrl = new URL("auth/v1", url);
    matrix.urlConstructor = entry("success", null, {
      protocolIsHttps: url.protocol === "https:",
      hostnameConfigured: Boolean(url.hostname),
      originMatchesInput: url.origin === normalized.url,
      relativeBaseCompositionSucceeded: authUrl.pathname === "/auth/v1",
    });
  } catch (error) {
    matrix.urlConstructor = entry("error", describeInitializationError("urlConstructor", error));
    return matrix;
  }

  matrix.createClientMinimal = typeof input.fetch === "function"
    ? entry("success", null, { fetchIsFunction: true, createsPersistentClient: false })
    : entry("error", describeInitializationError("createClientMinimal", new TypeError("wechatFetch is not a function")));
  const probeKey = `dev-auth-probe:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  try {
    const setResult = input.storage.setItem(probeKey, "probe");
    const getResult = input.storage.getItem(probeKey);
    const value = await Promise.resolve(getResult);
    const removeResult = input.storage.removeItem(probeKey);
    await Promise.resolve(setResult);
    await Promise.resolve(removeResult);
    const missing = await Promise.resolve(input.storage.getItem(probeKey));
    matrix.storageAdapter = entry("success", null, {
      setReturnsPromise: Boolean(setResult && typeof (setResult as Promise<unknown>).then === "function"),
      getReturnsPromise: Boolean(getResult && typeof (getResult as Promise<unknown>).then === "function"),
      removeReturnsPromise: Boolean(removeResult && typeof (removeResult as Promise<unknown>).then === "function"),
      valueIsString: typeof value === "string",
      missingReturnsNull: missing === null,
    });
  } catch (error) {
    matrix.storageAdapter = entry("error", describeInitializationError("storageAdapter", error));
  }
  matrix.createClientStorage = matrix.storageAdapter.status === "success"
    ? entry("success", null, { usesPersistentStorage: true, createsPersistentClient: false })
    : entry("error", matrix.storageAdapter.error);
  matrix.createClientRefresh = matrix.storageAdapter.status === "success"
    ? entry("success", null, { autoRefreshToken: true, createsPersistentClient: false })
    : entry("error", matrix.storageAdapter.error);
  try {
    input.getFullClient();
    matrix.createClientFull = entry("success");
  } catch (error) {
    matrix.createClientFull = entry("error", describeInitializationError("createClientFull", error));
  }
  return matrix;
}
