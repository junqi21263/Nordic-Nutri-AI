import assert from "node:assert/strict";
import test from "node:test";
import {
  VISION_PROVIDER_ERRORS,
  classifyVisionProviderError,
  isRetryableVisionProviderError,
} from "./vision-adapter-contract.cjs";

test("vision provider errors normalize to a stable retry policy", () => {
  assert.equal(classifyVisionProviderError({ code: "VISION_TIMEOUT" }), VISION_PROVIDER_ERRORS.TIMEOUT);
  assert.equal(classifyVisionProviderError({ status: 401 }), VISION_PROVIDER_ERRORS.AUTH);
  assert.equal(classifyVisionProviderError({ status: 429 }), VISION_PROVIDER_ERRORS.RATE_LIMIT);
  assert.equal(classifyVisionProviderError({ status: 400 }), VISION_PROVIDER_ERRORS.BAD_REQUEST);
  assert.equal(isRetryableVisionProviderError({ code: "VISION_TIMEOUT" }), true);
  assert.equal(isRetryableVisionProviderError({ status: 401 }), false);
});
