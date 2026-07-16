import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractFunctionDiagnostics,
  truncateUserId,
} from "../src/api/function-request-id";
import { createWechatFetch, installWechatHeadersCompat } from "../src/lib/wechat-fetch";
import { createAuthHarnessSnapshot } from "../src/dev/auth-harness-state";
import { getAuthHarnessRuntimeDiagnostics } from "../src/dev/runtime-diagnostics";
import {
  describeInitializationError,
  normalizeSupabasePublicConfig,
  probeSupabaseInitialization,
} from "../src/dev/supabase-initialization-probe";

afterEach(() => vi.unstubAllGlobals());

const root = resolve(__dirname, "..");

describe("development auth harness boundary", () => {
  it("registers the harness only through a development route and defines both public auth flags", () => {
    const config = readFileSync(resolve(root, "config/index.ts"), "utf8");
    const appConfig = readFileSync(resolve(root, "src/app.config.ts"), "utf8");
    const supabaseClient = readFileSync(resolve(root, "src/lib/supabase-client.ts"), "utf8");

    expect(appConfig).toContain('"pages/dev-auth-harness/index"');
    expect(appConfig).toContain('process.env.TARO_APP_ENV === "development"');
    expect(config).toContain('"process.env.TARO_APP_ENABLE_REAL_AUTH"');
    expect(config).toContain('"process.env.TARO_APP_USE_REAL_BACKEND"');
    expect(supabaseClient).toContain("global: { fetch }");
  });

  it("initializes a redacted snapshot without session or identity data", () => {
    expect(createAuthHarnessSnapshot()).toMatchObject({
      requestId: null,
      httpStatus: null,
      errorCode: null,
      message: null,
      errorName: null,
      errorKind: null,
      initializationStage: null,
      causeName: null,
      causeMessage: null,
      missingCapability: null,
      rawErrorName: null,
      rawErrorMessage: null,
      rawCauseName: null,
      rawCauseMessage: null,
      stackFrames: [],
      errorFile: null,
      errorFunction: null,
      currentStage: null,
      userId: null,
      sessionStatus: "unknown",
      operationStatus: "idle",
      steps: {
        configCheck: "idle",
        wxLogin: "idle",
        functionInvokeStart: "idle",
        functionInvokeResponse: "idle",
        functionErrorParse: "idle",
        verifyOtp: "idle",
        getUser: "idle",
        profileFetch: "idle",
        userSettings: "idle",
        activeMeals: "idle",
        saveMeal: "idle",
      },
    });
  });

  it("keeps a development-only page out of the tabBar and omits sensitive labels", () => {
    const appConfig = readFileSync(resolve(root, "src/app.config.ts"), "utf8");
    const page = readFileSync(resolve(root, "src/pages/dev-auth-harness/index.tsx"), "utf8");

    expect(appConfig.slice(appConfig.indexOf("tabBar:"))).not.toContain("pages/dev-auth-harness/index");
    expect(page).toContain("执行微信登录");
    expect(page).toContain("config-check");
    expect(page).toContain("function-invoke-start");
    expect(page).toContain("function-error-parse");
    expect(page).toContain("auth.getUser");
    expect(page).toContain("获取 user_settings");
    expect(page).toContain("测试 save-meal");
    expect(page).toContain("运行初始化诊断");
    expect(page).toContain("create-client-minimal");
    expect(page).toContain("HTTP 状态");
    expect(page).toContain("错误码");
    expect(page).toContain("用户 ID");
    expect(page).not.toMatch(/access token|refresh token|openid|unionid|session_key|token_hash/i);
  });

  it("extracts only whitelisted diagnostics from a failed Function response", async () => {
    const diagnostics = await extractFunctionDiagnostics({
      name: "FunctionsHttpError",
      context: {
        status: 401,
        clone: () => ({
          json: async () => ({ requestId: "request-123", error: { code: "UNAUTHORIZED", message: "raw secret-like detail" } }),
        }),
      },
    });

    expect(diagnostics).toEqual({
      httpStatus: 401,
      errorCode: "UNAUTHORIZED",
      message: "认证未通过或会话已过期",
      requestId: "request-123",
      errorName: "FunctionsHttpError",
      errorKind: "FunctionsHttpError",
    });
    expect(truncateUserId("12345678-1234-1234-1234-1234567890ab")).toBe("12345678…90ab");
  });

  it("keeps local Function invocation failures observable without exposing their raw details", async () => {
    const diagnostics = await extractFunctionDiagnostics(Object.assign(new Error("sensitive native detail"), {
      name: "FunctionInvokeRuntimeError",
    }));

    expect(diagnostics).toEqual({
      httpStatus: null,
      errorCode: null,
      message: "函数调用未到达 HTTP 响应层",
      requestId: null,
      errorName: "FunctionInvokeRuntimeError",
      errorKind: "FunctionInvokeRuntimeError",
      initializationStage: null,
      causeName: null,
      causeMessage: null,
      missingCapability: null,
      rawErrorName: null,
      rawErrorMessage: null,
      rawCauseName: null,
      rawCauseMessage: null,
      stackFrames: [],
      errorFile: null,
      errorFunction: null,
    });
  });

  it("distinguishes Supabase client initialization from a Function runtime failure", async () => {
    const diagnostics = await extractFunctionDiagnostics(Object.assign(new Error("sensitive setup detail"), {
      name: "SupabaseClientInitializationError",
    }));

    expect(diagnostics).toEqual({
      httpStatus: null,
      errorCode: null,
      message: "Supabase 客户端初始化失败",
      requestId: null,
      errorName: "SupabaseClientInitializationError",
      errorKind: "SupabaseClientInitializationError",
      initializationStage: null,
      causeName: null,
      causeMessage: null,
      missingCapability: null,
      rawErrorName: null,
      rawErrorMessage: null,
      rawCauseName: null,
      rawCauseMessage: null,
      stackFrames: [],
      errorFile: null,
      errorFunction: null,
    });
  });

  it("surfaces only the safe initialization cause fields required by the development harness", async () => {
    const diagnostics = await extractFunctionDiagnostics(Object.assign(new Error("native detail with a secret"), {
      name: "SupabaseClientInitializationError",
      initializationStage: "fetch-adapter",
      causeName: "WechatFetchUnavailableError",
      causeMessage: "微信网络能力不可用",
      missingCapability: "wx.request",
    }));

    expect(diagnostics).toMatchObject({
      initializationStage: "fetch-adapter",
      causeName: "WechatFetchUnavailableError",
      causeMessage: "微信网络能力不可用",
      missingCapability: "wx.request",
    });
    expect(JSON.stringify(diagnostics)).not.toContain("native detail with a secret");
  });

  it("allows the known missing Headers capability but still redacts unknown native details", async () => {
    const diagnostics = await extractFunctionDiagnostics(Object.assign(new Error("native detail with a secret"), {
      name: "SupabaseClientInitializationError",
      initializationStage: "client-create",
      causeName: "ReferenceError",
      causeMessage: "Headers is not defined",
      missingCapability: "Headers",
    }));

    expect(diagnostics).toMatchObject({
      initializationStage: "client-create",
      causeName: "ReferenceError",
      causeMessage: "Headers is not defined",
      missingCapability: "Headers",
    });
    expect(JSON.stringify(diagnostics)).not.toContain("native detail with a secret");
  });

  it("forwards only diagnostics explicitly marked safe by local initialization code", async () => {
    const diagnostics = await extractFunctionDiagnostics(Object.assign(new Error("generic wrapper"), {
      name: "SupabaseClientInitializationError",
      localDiagnosticSafe: true,
      rawErrorName: "Error",
      rawErrorMessage: "Unknown JavaScript runtime without WebSocket support.",
      rawCauseName: null,
      rawCauseMessage: null,
      stackFrames: ["at RealtimeClient._initializeOptions (vendors.js:1:101)"],
      errorFile: "vendors.js",
      errorFunction: "RealtimeClient._initializeOptions",
    }));

    expect(diagnostics).toMatchObject({
      rawErrorName: "Error",
      rawErrorMessage: "Unknown JavaScript runtime without WebSocket support.",
      stackFrames: ["at RealtimeClient._initializeOptions (vendors.js:1:101)"],
      errorFile: "vendors.js",
      errorFunction: "RealtimeClient._initializeOptions",
    });
  });

  it("bridges Supabase fetch calls to the WeChat request API without exposing request bodies", async () => {
    const requests: Array<{ url: string; method?: string; header?: Record<string, string>; data?: unknown }> = [];
    const fetch = createWechatFetch((options) => {
      requests.push({ url: options.url, method: options.method, header: options.header, data: options.data });
      queueMicrotask(() => options.success?.({
        statusCode: 201,
        data: { success: true, requestId: "request-123" },
        header: { "x-request-id": "request-123", "content-type": "application/json" },
      }));
      return { abort: () => undefined };
    });

    const response = await fetch("https://example.supabase.co/functions/v1/wechat-login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-info": "mini-program" },
      body: JSON.stringify({ code: "must-not-be-logged" }),
    });

    expect(requests).toEqual([{
      url: "https://example.supabase.co/functions/v1/wechat-login",
      method: "POST",
      header: { "content-type": "application/json", "x-client-info": "mini-program" },
      data: JSON.stringify({ code: "must-not-be-logged" }),
    }]);
    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe("request-123");
    await expect(response.json()).resolves.toEqual({ success: true, requestId: "request-123" });
  });

  it("returns a safe local error when WeChat networking fails before an HTTP response", async () => {
    const fetch = createWechatFetch((options) => {
      queueMicrotask(() => options.fail?.({ errMsg: "request:fail timeout" }));
      return { abort: () => undefined };
    });

    await expect(fetch("https://example.supabase.co/functions/v1/wechat-login"))
      .rejects.toMatchObject({ name: "WechatFetchError", message: "微信网络请求失败" });
  });

  it("classifies a synchronous wx.request startup failure without exposing native details", async () => {
    const fetch = createWechatFetch(() => {
      throw new Error("request:fail native implementation detail");
    });

    await expect(fetch("https://example.supabase.co/functions/v1/wechat-login"))
      .rejects.toMatchObject({ name: "WechatRequestStartError", message: "微信网络请求未能启动" });
  });

  it("supports controlled cancellation through the WeChat request task", async () => {
    let aborted = false;
    const fetch = createWechatFetch(() => ({ abort: () => { aborted = true; } }));
    const controller = new AbortController();
    const pending = fetch("https://example.supabase.co/rest/v1/profiles", { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError", message: "请求已取消" });
    expect(aborted).toBe(true);
  });

  it("installs the minimal Headers constructor required by supabase-js when WeChat omits it", () => {
    const runtime = {} as typeof globalThis;

    const installed = installWechatHeadersCompat(runtime);
    const headers = new runtime.Headers([["X-Request-Id", "request-123"]]);
    headers.set("Authorization", "redacted");

    expect(installed).toBe(true);
    expect(headers.get("x-request-id")).toBe("request-123");
    expect(headers.has("authorization")).toBe(true);
  });

  it("reports WeChat runtime capabilities as available or missing without exposing runtime objects", () => {
    expect(getAuthHarnessRuntimeDiagnostics({
      fetch: undefined,
      Headers: undefined,
      Request: class Request {},
      Response: undefined,
      URL: class URL {},
      AbortController: undefined,
      wx: { request: () => ({ abort: () => undefined }), getStorage: () => undefined, setStorage: () => undefined },
    })).toEqual({
      fetch: "missing",
      Headers: "missing",
      Request: "available",
      Response: "missing",
      URL: "available",
      AbortController: "missing",
      wxRequest: "available",
      wxGetStorage: "available",
      wxSetStorage: "available",
    });
  });

  it("keeps a non-sensitive initialization TypeError and its local stack frames observable", () => {
    const error = new TypeError("WebSocket is not a constructor");
    error.stack = [
      "TypeError: WebSocket is not a constructor",
      "    at RealtimeClient._initializeOptions (vendors.js:1:101)",
      "    at new RealtimeClient (vendors.js:1:202)",
      "    at new SupabaseClient (vendors.js:1:303)",
    ].join("\n");

    expect(describeInitializationError("create-client-minimal", error)).toEqual({
      initializationSubstage: "create-client-minimal",
      rawErrorName: "TypeError",
      rawErrorMessage: "WebSocket is not a constructor",
      rawCauseName: null,
      rawCauseMessage: null,
      stackFrames: [
        "at RealtimeClient._initializeOptions (vendors.js:1:101)",
        "at new RealtimeClient (vendors.js:1:202)",
        "at new SupabaseClient (vendors.js:1:303)",
      ],
      errorFile: "vendors.js",
      errorFunction: "RealtimeClient._initializeOptions",
    });
  });

  it("rejects quoted or semicolon-terminated public configuration instead of silently accepting it", () => {
    expect(normalizeSupabasePublicConfig({
      supabaseUrl: " 'https://example.supabase.co'; ",
      supabasePublishableKey: "sb_publishable_example",
    })).toMatchObject({ valid: false, reason: "URL contains quotes or a semicolon" });
  });

  it("identifies the Realtime WebSocket constructor as the first createClient failure when WebSocket is unavailable", async () => {
    vi.stubGlobal("WebSocket", undefined);
    const storage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const matrix = await probeSupabaseInitialization({
      config: {
        supabaseUrl: "https://example.supabase.co",
        supabasePublishableKey: "sb_publishable_example",
      },
      fetch: (() => Promise.resolve({})) as typeof fetch,
      storage,
      getFullClient: () => { throw new Error("full client intentionally not used in this probe"); },
    });

    expect(matrix.createClientMinimal).toMatchObject({
      status: "error",
      error: {
        rawErrorMessage: expect.stringContaining("WebSocket"),
      },
    });
    expect(matrix.storageAdapter.status).toBe("success");
  });

  it("allows Auth and Functions client initialization without WebSocket when Realtime has an explicit unavailable transport", async () => {
    vi.stubGlobal("WebSocket", undefined);
    const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    const unavailableTransport = class { constructor() { throw new Error("Realtime is unavailable in WeChat"); } };
    const matrix = await probeSupabaseInitialization({
      config: {
        supabaseUrl: "https://example.supabase.co",
        supabasePublishableKey: "sb_publishable_example",
      },
      fetch: (() => Promise.resolve({})) as typeof fetch,
      storage,
      realtimeTransport: unavailableTransport,
      getFullClient: () => ({}),
    });

    expect(matrix.createClientMinimal.status).toBe("success");
    expect(matrix.createClientStorage.status).toBe("success");
    expect(matrix.createClientRefresh.status).toBe("success");
  });
});
