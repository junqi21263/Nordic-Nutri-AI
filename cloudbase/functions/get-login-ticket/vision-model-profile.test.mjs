import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveVisionProfile,
  visionRequestParameters,
  selectVisionImage,
} from "./vision-model-profile.cjs";

test("legacy profiles preserve thinking without leaking it to unknown providers", () => {
  assert.deepEqual(
    visionRequestParameters(
      resolveVisionProfile({ providerKey: "deepseek", modelKey: "vision" }),
    ),
    { thinking: { type: "enabled" }, reasoning_effort: "low" },
  );
  assert.deepEqual(
    visionRequestParameters(
      resolveVisionProfile({ providerKey: "custom", modelKey: "vision" }),
    ),
    {},
  );
});
test("explicit model capabilities override vendor defaults and select supported media", () => {
  const p = resolveVisionProfile({
    providerKey: "custom",
    modelKey: "v",
    metadata: {
      vision: {
        imageInput: "inline",
        thinkingMode: "disabled",
        supportsReasoningEffort: true,
        reasoningEffort: "medium",
        jsonMode: true,
      },
    },
  });
  assert.deepEqual(visionRequestParameters(p), {
    thinking: { type: "disabled" },
    reasoning_effort: "medium",
    response_format: { type: "json_object" },
  });
  assert.equal(
    selectVisionImage(p, "https://x.test/food", "data:image/jpeg;base64,YQ=="),
    "data:image/jpeg;base64,YQ==",
  );
  assert.throws(() => selectVisionImage(p, "https://x.test/food", null), {
    code: "VISION_MEDIA_UNSUPPORTED",
  });
});
test("unsupported protocols and malformed capability values fail before model invocation", () => {
  assert.throws(() => resolveVisionProfile({ protocol: "unknown" }), {
    code: "VISION_PROTOCOL_UNSUPPORTED",
  });
  assert.throws(
    () => resolveVisionProfile({ metadata: { vision: { imageInput: "raw" } } }),
    { code: "VISION_MODEL_CONFIG_INVALID" },
  );
});
