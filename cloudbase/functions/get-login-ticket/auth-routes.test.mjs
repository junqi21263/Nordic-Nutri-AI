import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { getAuthRoute, handleAuthRoute } from "./index.js";

function createAuthStub() {
  return {
    async getCaptcha() { return { captchaId: "c1", image: "<svg />", expiresIn: 300 }; },
    async loginEmail(input) { return { route: "email", input }; },
    async sendVerificationCode(input) { return { sent: true, input }; },
    async registerEmail(input) { return { route: "register-email", input }; },
    async resetPassword(input) { return { reset: true, input }; },
    async getMe() { return { id: "user-1" }; },
  };
}

async function invoke(route, method, body = null, headers = {}) {
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
    void handleAuthRoute({ req, res, route, service: { auth: createAuthStub() } }).catch(reject);
    if (body !== null) {
      req.emit("data", Buffer.from(JSON.stringify(body)));
      req.emit("end");
    }
  });
  return result;
}

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
  ];
  for (const [path, body] of requests) {
    const response = await invoke(path, "POST", body, { "content-type": "application/json" });
    assert.equal(response.status, 200, path);
  }
});

test("does not expose Phone or Google routes in Email Auth V1", () => {
  assert.equal(getAuthRoute("/get-login-ticket/auth/register/phone"), null);
  assert.equal(getAuthRoute("/get-login-ticket/auth/login/google"), null);
  assert.equal(getAuthRoute("/get-login-ticket/auth/login/email"), "/auth/login/email");
});
