import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractFunctionDiagnostics,
  truncateUserId,
} from "../src/api/function-request-id";
import { createWechatFetch } from "../src/lib/wechat-fetch";
import { createAuthHarnessSnapshot } from "../src/dev/auth-harness-state";

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
    expect(supabaseClient).toContain('global: { fetch: getWechatFetch() }');
  });

  it("initializes a redacted snapshot without session or identity data", () => {
    expect(createAuthHarnessSnapshot()).toEqual({
      requestId: null,
      httpStatus: null,
      errorCode: null,
      message: null,
      errorName: null,
      errorKind: null,
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

  it("supports controlled cancellation through the WeChat request task", async () => {
    let aborted = false;
    const fetch = createWechatFetch(() => ({ abort: () => { aborted = true; } }));
    const controller = new AbortController();
    const pending = fetch("https://example.supabase.co/rest/v1/profiles", { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError", message: "请求已取消" });
    expect(aborted).toBe(true);
  });
});
