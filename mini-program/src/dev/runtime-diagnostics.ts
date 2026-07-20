export type RuntimeCapabilityStatus = "available" | "missing";

export interface AuthHarnessRuntimeDiagnostics {
  fetch: RuntimeCapabilityStatus;
  Headers: RuntimeCapabilityStatus;
  Request: RuntimeCapabilityStatus;
  Response: RuntimeCapabilityStatus;
  URL: RuntimeCapabilityStatus;
  AbortController: RuntimeCapabilityStatus;
  wxRequest: RuntimeCapabilityStatus;
  wxGetStorage: RuntimeCapabilityStatus;
  wxSetStorage: RuntimeCapabilityStatus;
}

type WechatRuntime = {
  fetch?: unknown;
  Headers?: unknown;
  Request?: unknown;
  Response?: unknown;
  URL?: unknown;
  AbortController?: unknown;
  wx?: {
    request?: unknown;
    getStorage?: unknown;
    setStorage?: unknown;
  };
};

function availability(value: unknown): RuntimeCapabilityStatus {
  return typeof value === "function" ? "available" : "missing";
}

/** Development-only, redacted capability probe for the WeChat JavaScript runtime. */
export function getAuthHarnessRuntimeDiagnostics(
  runtime: WechatRuntime = globalThis as unknown as WechatRuntime,
): AuthHarnessRuntimeDiagnostics {
  return {
    fetch: availability(runtime.fetch),
    Headers: availability(runtime.Headers),
    Request: availability(runtime.Request),
    Response: availability(runtime.Response),
    URL: availability(runtime.URL),
    AbortController: availability(runtime.AbortController),
    wxRequest: availability(runtime.wx?.request),
    wxGetStorage: availability(runtime.wx?.getStorage),
    wxSetStorage: availability(runtime.wx?.setStorage),
  };
}
