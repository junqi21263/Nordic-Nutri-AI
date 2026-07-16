const MINI_PROGRAM_URL_BASE = "https://mini-program.invalid";

type UrlConstructor = new (url: string, base?: string) => URL;

export interface WechatUrlCompatibilityDiagnostics {
  inputType: "string" | "url-like" | "unknown";
  isRelative: boolean;
  protocol: string | null;
  hostname: string | null;
  pathname: string | null;
  stage: "url-compat";
}

let lastRelativeFallback: WechatUrlCompatibilityDiagnostics | null = null;

function toUrlText(input: unknown): string {
  if (typeof input === "string") return input;
  if (input && typeof (input as { toString?: unknown }).toString === "function") return String(input);
  return String(input);
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function safeDiagnostics(input: unknown, url: URL): WechatUrlCompatibilityDiagnostics {
  const inputType = typeof input === "string"
    ? "string"
    : input && typeof (input as { href?: unknown }).href === "string"
      ? "url-like"
      : "unknown";
  return {
    inputType,
    isRelative: !isAbsoluteHttpUrl(toUrlText(input)),
    protocol: url.protocol || null,
    hostname: url.hostname || null,
    pathname: url.pathname || "/",
    stage: "url-compat",
  };
}

export function getWechatUrlCompatibilityDiagnostics(): WechatUrlCompatibilityDiagnostics | null {
  return lastRelativeFallback;
}

/**
 * Taro's URL implementation rejects the relative value of window.location.href.
 * GoTrue reads that value during initialization, so relative page paths receive
 * a fixed non-business base while absolute Supabase URLs are unchanged.
 */
export function installWechatUrlCompatibility(runtime: typeof globalThis = globalThis): boolean {
  if (typeof runtime.URL !== "function") return false;
  const NativeURL = runtime.URL as unknown as UrlConstructor;
  const probe = "pages/__supabase_url_probe__";
  try {
    new NativeURL(probe);
    return false;
  } catch {
    const CompatibleURL = function (this: unknown, input: unknown, base?: unknown): URL {
      const value = toUrlText(input);
      const resolvedBase = base === undefined
        ? (isAbsoluteHttpUrl(value) ? undefined : MINI_PROGRAM_URL_BASE)
        : toUrlText(base);
      const url = resolvedBase === undefined ? new NativeURL(value) : new NativeURL(value, resolvedBase);
      if (base === undefined && !isAbsoluteHttpUrl(value)) lastRelativeFallback = safeDiagnostics(input, url);
      return url;
    } as unknown as typeof URL;
    (runtime as unknown as { URL: typeof URL }).URL = CompatibleURL;
    return true;
  }
}
