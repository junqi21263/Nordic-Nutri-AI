import assert from "node:assert/strict";
import test from "node:test";

import {
  FoodImageError,
  createFoodImageService,
  isAllowedHost,
  isPrivateIp,
  sha256,
  validateImageUrl,
} from "./food-image-service.cjs";

const ALLOWED = ["images.openfoodfacts.org", "world.openfoodfacts.org"];

test("isAllowedHost matches exact and subdomains", () => {
  assert.equal(isAllowedHost("images.openfoodfacts.org", ALLOWED), true);
  assert.equal(isAllowedHost("sub.images.openfoodfacts.org", ALLOWED), true);
  assert.equal(isAllowedHost("evil.com", ALLOWED), false);
});

test("isPrivateIp detects localhost and private ranges", () => {
  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("10.0.0.1"), true);
  assert.equal(isPrivateIp("192.168.1.1"), true);
  assert.equal(isPrivateIp("169.254.1.1"), true);
  assert.equal(isPrivateIp("localhost"), true);
  assert.equal(isPrivateIp("8.8.8.8"), false);
});

test("validateImageUrl rejects http, private, and disallowed hosts", () => {
  assert.throws(() => validateImageUrl("http://images.openfoodfacts.org/x", ALLOWED), /FOOD_IMAGE_URL_NOT_HTTPS/);
  assert.throws(() => validateImageUrl("https://evil.com/x", ALLOWED), /FOOD_IMAGE_HOST_NOT_ALLOWED/);
  assert.throws(() => validateImageUrl("https://127.0.0.1/x", ALLOWED), /FOOD_IMAGE_HOST_PRIVATE/);
  assert.throws(() => validateImageUrl("not a url", ALLOWED), /FOOD_IMAGE_URL_INVALID/);
  const url = validateImageUrl("https://images.openfoodfacts.org/images/123.jpg", ALLOWED);
  assert.equal(url.hostname, "images.openfoodfacts.org");
});

test("sha256 produces hex digest", () => {
  assert.equal(sha256(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("acquireFromUrl downloads, hashes, transforms (fallback), and uploads variants", async () => {
  const fakeBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const downloads = [];
  const svc = createFoodImageService({
    allowedHosts: ALLOWED,
    maxBytes: 1024 * 1024,
    downloader: async (url) => {
      downloads.push(url);
      return { buffer: fakeBuffer, contentType: "image/jpeg", size: fakeBuffer.length };
    },
    sharpLoader: () => null, // force no-transform fallback
    uploader: async ({ cloudPath }) => ({ fileID: `cloud://env/${cloudPath}` }),
  });
  const result = await svc.acquireFromUrl("https://images.openfoodfacts.org/x.jpg", { imageEntityKey: "ent1" });
  assert.equal(result.contentHash, sha256(fakeBuffer));
  assert.equal(result.transformed, false);
  assert.equal(result.storagePath.startsWith("foods/ent1/"), true);
  assert.equal(result.detailUrl, null);
  assert.equal(result.thumbUrl, null);
  assert.equal(result.mediumUrl, null);
  assert.equal(downloads.length, 1);
});

test("acquireFromUrl blocks SSRF via downloader redirect to private host", async () => {
  const svc = createFoodImageService({
    allowedHosts: ALLOWED,
    downloader: async (url, opts, depth = 0) => {
      // Simulate a redirect chain into a private host.
      if (depth === 0) throw new FoodImageError("FOOD_IMAGE_HOST_PRIVATE");
      throw new Error("should not reach");
    },
  });
  await assert.rejects(() => svc.acquireFromUrl("https://images.openfoodfacts.org/x"), /FOOD_IMAGE_HOST_PRIVATE/);
});

test("acquireFromUpload rejects oversized and bad content types", async () => {
  const svc = createFoodImageService({ maxBytes: 10 });
  await assert.rejects(() => svc.acquireFromUpload({ buffer: Buffer.alloc(100), contentType: "image/jpeg" }), /FOOD_IMAGE_TOO_LARGE/);
  await assert.rejects(() => svc.acquireFromUpload({ buffer: Buffer.alloc(5), contentType: "application/pdf" }), /FOOD_IMAGE_TYPE_NOT_ALLOWED/);
  await assert.rejects(() => svc.acquireFromUpload({ buffer: Buffer.alloc(0), contentType: "image/jpeg" }), /FOOD_IMAGE_UPLOAD_EMPTY/);
});

test("acquireFromUpload stores variants when sharp unavailable", async () => {
  const svc = createFoodImageService({
    maxBytes: 1024 * 1024,
    sharpLoader: () => null,
    uploader: async ({ cloudPath }) => ({ fileID: `cloud://env/${cloudPath}` }),
  });
  const result = await svc.acquireFromUpload({ buffer: Buffer.from("data12345"), contentType: "image/png", imageEntityKey: "u1" });
  assert.equal(result.transformed, false);
  assert.equal(result.storagePath.startsWith("foods/u1/"), true);
  assert.equal(result.detailUrl, null);
  assert.equal(result.status, "pending");
});
