import assert from "node:assert/strict";
import test from "node:test";

import { compressVisionImageForStorage } from "./vision-image-compress.cjs";

test("compressVisionImageForStorage returns jpeg when sharp is available", async () => {
  let sharpAvailable = true;
  try {
    require("sharp");
  } catch {
    sharpAvailable = false;
  }
  if (!sharpAvailable) {
    const passthrough = await compressVisionImageForStorage(Buffer.from([0xff, 0xd8, 0xff, 0xdb]), "image/jpeg");
    assert.equal(passthrough.compressed, false);
    return;
  }

  // Minimal valid-ish buffer; sharp may still process failOn none paths.
  const input = Buffer.alloc(120_000, 10);
  const result = await compressVisionImageForStorage(input, "image/png", {
    maxEdge: 640,
    quality: 70,
  });
  assert.equal(result.contentType, "image/jpeg");
  assert.equal(result.compressed, true);
  assert.ok(result.buffer.length > 0);
  assert.ok(result.buffer.length < input.length);
});
