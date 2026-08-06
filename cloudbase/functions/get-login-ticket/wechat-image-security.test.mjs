import assert from "node:assert/strict";
import test from "node:test";

import {
  PublicImageSecurityError,
  createWechatImageSecurity,
  prepareMediaForImgSecCheck,
} from "./wechat-image-security.cjs";

test("assertImageAllowed passes when WeChat returns errcode 0", async () => {
  const calls = [];
  const security = createWechatImageSecurity({
    appId: "wx-app",
    appSecret: "wx-secret",
    sharpFactory: () => null,
    fetchJson: async (url, options = {}) => {
      calls.push({ url, method: options.method || "GET" });
      if (String(url).includes("/cgi-bin/token")) {
        return { statusCode: 200, json: { access_token: "token-1", expires_in: 7200 }, raw: "" };
      }
      return { statusCode: 200, json: { errcode: 0, errmsg: "ok" }, raw: "" };
    },
  });

  await security.assertImageAllowed({
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    contentType: "image/jpeg",
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /cgi-bin\/token/);
  assert.match(calls[1].url, /wxa\/img_sec_check/);
  assert.equal(calls[1].method, "POST");
});

test("assertImageAllowed throws VISION_CONTENT_BLOCKED on errcode 87014", async () => {
  const security = createWechatImageSecurity({
    appId: "wx-app",
    appSecret: "wx-secret",
    sharpFactory: () => null,
    fetchJson: async (url) => {
      if (String(url).includes("/cgi-bin/token")) {
        return { statusCode: 200, json: { access_token: "token-1", expires_in: 7200 }, raw: "" };
      }
      return { statusCode: 200, json: { errcode: 87014, errmsg: "risky content" }, raw: "" };
    },
  });

  await assert.rejects(
    () => security.assertImageAllowed({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
      contentType: "image/jpeg",
    }),
    (error) => error instanceof PublicImageSecurityError
      && error.code === "VISION_CONTENT_BLOCKED"
      && error.message.includes("违规"),
  );
});

test("reuses cached access token until near expiry", async () => {
  let nowMs = 1_000_000;
  let tokenCalls = 0;
  const security = createWechatImageSecurity({
    appId: "wx-app",
    appSecret: "wx-secret",
    sharpFactory: () => null,
    now: () => nowMs,
    fetchJson: async (url) => {
      if (String(url).includes("/cgi-bin/token")) {
        tokenCalls += 1;
        return { statusCode: 200, json: { access_token: `token-${tokenCalls}`, expires_in: 7200 }, raw: "" };
      }
      return { statusCode: 200, json: { errcode: 0, errmsg: "ok" }, raw: "" };
    },
  });

  await security.assertImageAllowed({
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    contentType: "image/jpeg",
  });
  nowMs += 60_000;
  await security.assertImageAllowed({
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    contentType: "image/jpeg",
  });
  assert.equal(tokenCalls, 1);

  nowMs += 7_000_000;
  await security.assertImageAllowed({
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    contentType: "image/jpeg",
  });
  assert.equal(tokenCalls, 2);
});

test("refreshes token once when WeChat returns 40001", async () => {
  let tokenCalls = 0;
  let checkCalls = 0;
  const security = createWechatImageSecurity({
    appId: "wx-app",
    appSecret: "wx-secret",
    sharpFactory: () => null,
    fetchJson: async (url) => {
      if (String(url).includes("/cgi-bin/token")) {
        tokenCalls += 1;
        return { statusCode: 200, json: { access_token: `token-${tokenCalls}`, expires_in: 7200 }, raw: "" };
      }
      checkCalls += 1;
      if (checkCalls === 1) {
        return { statusCode: 200, json: { errcode: 40001, errmsg: "invalid credential" }, raw: "" };
      }
      return { statusCode: 200, json: { errcode: 0, errmsg: "ok" }, raw: "" };
    },
  });

  await security.assertImageAllowed({
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    contentType: "image/jpeg",
  });
  assert.equal(tokenCalls, 2);
  assert.equal(checkCalls, 2);
});

test("prepareMediaForImgSecCheck fails closed when sharp missing and image too large", async () => {
  await assert.rejects(
    () => prepareMediaForImgSecCheck(Buffer.alloc(950 * 1024, 1), "image/jpeg", { sharpFactory: () => null }),
    (error) => error instanceof PublicImageSecurityError && error.code === "VISION_IMAGE_INVALID",
  );
});

test("prepareMediaForImgSecCheck retries lower jpeg quality until under 1MB", async () => {
  const qualities = [];
  const fakeSharp = (input) => {
    const api = {
      metadata: async () => ({ width: 4000, height: 3000 }),
      rotate() { return api; },
      resize() { return api; },
      jpeg({ quality }) {
        qualities.push(quality);
        return api;
      },
      async toBuffer() {
        // First resize (quality 82) and early tighter passes stay oversized; last pass fits.
        if (qualities.length <= 3) return Buffer.alloc(1_100_000, 1);
        return Buffer.alloc(400_000, 1);
      },
    };
    // sharp(buffer) vs sharp(resizedBuffer) — both go through same factory.
    void input;
    return api;
  };
  const prepared = await prepareMediaForImgSecCheck(Buffer.alloc(2_800_000, 1), "image/jpeg", {
    sharpFactory: () => fakeSharp,
  });
  assert.equal(prepared.contentType, "image/jpeg");
  assert.ok(prepared.buffer.length <= 1024 * 1024);
  assert.deepEqual(qualities.slice(0, 4), [82, 65, 50, 38]);
});
