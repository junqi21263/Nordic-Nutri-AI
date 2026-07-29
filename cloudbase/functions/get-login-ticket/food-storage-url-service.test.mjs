import assert from "node:assert/strict";
import test from "node:test";

import {
  createFoodStorageUrlResolver,
  normalizeStoragePath,
} from "./food-storage-url-service.cjs";

const CDN = "https://6c65-lewis-healthy-d4glgqqzv73a5bc10-1420560890.tcb.qcloud.la";

test("resolves generated food image variants from storage path", () => {
  const resolver = createFoodStorageUrlResolver({ baseUrl: CDN });
  assert.deepEqual(resolver.resolveVariants("food-library/food-1/image-1"), {
    thumbnailUrl: `${CDN}/food-library/food-1/image-1/thumbnail.webp`,
    listUrl: `${CDN}/food-library/food-1/image-1/list.webp`,
    detailUrl: `${CDN}/food-library/food-1/image-1/detail.webp`,
  });
});

test("resolves imported food image variants without persisting URLs", () => {
  const resolver = createFoodStorageUrlResolver({ baseUrl: CDN });
  const resolved = resolver.resolveVariants("foods/chicken/hash-1");
  assert.equal(resolved.thumbnailUrl, `${CDN}/foods/chicken/hash-1/thumb.webp`);
  assert.equal(resolved.listUrl, `${CDN}/foods/chicken/hash-1/medium.webp`);
  assert.equal(resolved.detailUrl, `${CDN}/foods/chicken/hash-1/detail.webp`);
});

test("does not resolve an unsafe CDN base URL", () => {
  assert.throws(() => createFoodStorageUrlResolver({ baseUrl: "http://example.com" }), /FOOD_IMAGE_CDN_BASE_URL_INVALID/);
});

test("normalizes cloud file IDs to storage paths", () => {
  assert.equal(
    normalizeStoragePath("cloud://lewis-healthy-d4glgqqzv73a5bc10/food-library/a/detail.webp"),
    "food-library/a/detail.webp",
  );
});
