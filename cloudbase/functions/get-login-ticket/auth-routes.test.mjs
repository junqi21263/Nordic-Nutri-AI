import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { getAuthRoute, handleAuthRoute } from "./index.js";

function createAuthStub() {
  return {
    async getCaptcha() { return { captchaId: "c1", image: "<svg />", expiresIn: 300 }; },
    async loginEmail(input) { return { route: "email", input }; },
    async loginPhone(input) { return { route: "phone", input }; },
    async loginGoogle(input) { return { route: "google", input }; },
    async sendVerificationCode(input) { return { sent: true, input }; },
    async registerEmail(input) { return { route: "register-email", input }; },
    async registerPhone(input) { return { route: "register-phone", input }; },
    async resetPassword(input) { return { reset: true, input }; },
    async getMe() { return { id: "user-1" }; },
  };
}

async function invoke(route, method, body = null, headers = {}, auth = createAuthStub()) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = headers;
  const result = await new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      writeHead(statusCode) { this.statusCode = statusCode; },
      end(payload = "") {
        try { resolve({ status: this.statusCode, body: JSON.parse(payload || "{}") }); } catch (error) { reject(error); }
      },
    };
    void handleAuthRoute({ req, res, route, service: { auth } }).catch(reject);
    if (body !== null) {
      req.emit("data", Buffer.from(JSON.stringify(body)));
      req.emit("end");
    }
  });
  return result;
}

async function invokeWithTrace(route, body, auth) {
  const req = new EventEmitter();
  req.method = "POST";
  req.headers = { "content-type": "application/json" };
  const traceContext = {};
  const response = await new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      __traceContext: traceContext,
      writeHead(statusCode) { this.statusCode = statusCode; },
      end(payload = "") {
        try { resolve({ status: this.statusCode, body: JSON.parse(payload || "{}") }); } catch (error) { reject(error); }
      },
    };
    void handleAuthRoute({ req, res, route, service: { auth } }).catch(reject);
    req.emit("data", Buffer.from(JSON.stringify(body)));
    req.emit("end");
  });
  return { response, traceContext };
}

test("maps unexpected auth dependency failures to service unavailable", async () => {
  const response = await invoke(
    "/auth/register/email/send-code",
    "POST",
    { email: "user@example.com", captchaId: "c1", captchaAnswer: "abcd" },
    { "content-type": "application/json" },
    { async sendVerificationCode() { throw new Error("database unavailable"); } },
  );

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { code: "AUTH_UNAVAILABLE" });
});

test("captures auth failures in the request trace", async () => {
  const { response, traceContext } = await invokeWithTrace(
    "/auth/login/google",
    { idToken: "token" },
    { async loginGoogle() {
      const error = new Error("Google ID token was rejected");
      error.code = "AUTH_INVALID_CREDENTIALS";
      error.authReason = "audience_mismatch";
      error.verificationAttempts = [{ stage: "google_tokeninfo", code: "AUTH_INVALID_CREDENTIALS" }];
      throw error;
    } },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { code: "AUTH_INVALID_CREDENTIALS" });
  assert.deepEqual(traceContext.internalError, {
    name: "Error",
    code: "AUTH_INVALID_CREDENTIALS",
    message: "Google ID token was rejected",
    authReason: "audience_mismatch",
    verificationAttempts: [{ stage: "google_tokeninfo", code: "AUTH_INVALID_CREDENTIALS" }],
  });
});

test("routes CAPTCHA and password login through the auth service", async () => {
  const captcha = await invoke("/auth/captcha", "POST", {}, { "content-type": "application/json" });
  assert.equal(captcha.status, 200);
  assert.deepEqual(captcha.body, { captchaId: "c1", image: "<svg />", expiresIn: 300 });

  const login = await invoke("/auth/login/email", "POST", { email: "user@example.com", password: "password", captchaId: "c1", captchaAnswer: "abcd" }, { "content-type": "application/json" });
  assert.equal(login.status, 200);
  assert.equal(login.body.route, "email");
});

test("routes Email registration, forgot-password and reset without using the WeChat issue path", async () => {
  const requests = [
    ["/auth/register/email/send-code", { targetType: "email", target: "user@example.com" }],
    ["/auth/register/email", { email: "user@example.com", code: "123456", password: "password" }],
    ["/auth/password/forgot/email", { email: "user@example.com", captchaId: "c1", captchaAnswer: "abcd" }],
    ["/auth/password/reset", { targetType: "email", target: "user@example.com", code: "123456", password: "newpass8" }],
    ["/auth/register/phone/send-code", { phone: "+8613800138000", captchaId: "c1", captchaAnswer: "abcd" }],
    ["/auth/register/phone", { phone: "+8613800138000", code: "123456", password: "password" }],
    ["/auth/password/forgot/phone", { phone: "+8613800138000", captchaId: "c1", captchaAnswer: "abcd" }],
  ];
  for (const [path, body] of requests) {
    const response = await invoke(path, "POST", body, { "content-type": "application/json" });
    assert.equal(response.status, 200, path);
  }
});

test("exposes the Android Email, Phone and Google auth routes", async () => {
  assert.equal(getAuthRoute("/get-login-ticket/auth/register/phone"), "/auth/register/phone");
  assert.equal(getAuthRoute("/get-login-ticket/auth/login/google"), "/auth/login/google");
  assert.equal(getAuthRoute("/get-login-ticket/auth/login/email"), "/auth/login/email");

  const response = await invoke("/auth/login/google", "POST", { idToken: "token" }, { "content-type": "application/json" });
  assert.equal(response.status, 200);
  assert.equal(response.body.route, "google");
});
