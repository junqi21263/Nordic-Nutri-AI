import assert from "node:assert/strict";
import test from "node:test";
import { createVisionModelAdapter } from "./vision-model-adapter.cjs";
const result = {
  mealName: "rice",
  mealType: "lunch",
  confidence: 0.9,
  items: [
    {
      name: "rice",
      quantityG: 100,
      caloriesPer100g: 130,
      proteinPer100g: 2,
      carbsPer100g: 28,
      fatPer100g: 0.3,
    },
  ],
};
test("a custom compatible provider receives only declared capabilities and keeps the stable food contract", async () => {
  let sent, url;
  const analyze = createVisionModelAdapter(
    {
      providerKey: "custom",
      modelKey: "custom-v",
      baseUrl: "https://model.example/v1",
      protocol: "openai-chat-completions",
      credential: "private",
      maxTokens: 1234,
      timeoutMs: 1000,
      metadata: {
        vision: {
          imageInput: "inline",
          thinkingMode: "disabled",
          jsonMode: true,
          supportsTemperature: false,
          maxTokensField: "max_completion_tokens",
        },
      },
    },
    {
      fetchImpl: async (u, init) => {
        url = u;
        sent = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(result) } }],
          }),
        };
      },
    },
  );
  const output = await analyze({
    imageUrl: "https://storage.test/x",
    imageDataUrl: "data:image/jpeg;base64,YQ==",
  });
  assert.equal(url, "https://model.example/v1/chat/completions");
  assert.equal(sent.model, "custom-v");
  assert.equal(sent.max_completion_tokens, 1234);
  assert.equal(sent.max_tokens, undefined);
  assert.equal(sent.temperature, undefined);
  assert.deepEqual(sent.thinking, { type: "disabled" });
  assert.equal(sent.reasoning_effort, undefined);
  assert.deepEqual(sent.response_format, { type: "json_object" });
  assert.equal(output.mealName, "rice");
  assert.equal(output.provider, "custom");
  assert.equal(JSON.stringify(output).includes("private"), false);
});
test("unknown wire protocols are rejected before any network call", () => {
  assert.throws(
    () =>
      createVisionModelAdapter({
        protocol: "anthropic-native",
        providerKey: "x",
        modelKey: "x",
        credential: "private",
      }),
    { code: "VISION_PROTOCOL_UNSUPPORTED" },
  );
});

test("inline-only models can consume an existing async uploaded asset without a client change", async () => {
  let downloaded = 0,
    sent;
  const analyze = createVisionModelAdapter(
    {
      providerKey: "custom",
      modelKey: "v",
      baseUrl: "https://model.test/v1",
      credential: "private",
      metadata: { vision: { imageInput: "inline" } },
    },
    {
      downloadImage: async (url, options) => {
        downloaded++;
        assert.equal(url, "https://storage.test/x");
        assert.equal(options.maxBytes, 4 * 1024 * 1024);
        return {
          buffer: Buffer.from([255, 216, 255, 0]),
          contentType: "image/jpeg",
        };
      },
      fetchImpl: async (_url, init) => {
        sent = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(result) } }],
          }),
        };
      },
    },
  );
  await analyze({ imageUrl: "https://storage.test/x" });
  assert.equal(downloaded, 1);
  assert.match(
    sent.messages[1].content[1].image_url.url,
    /^data:image\/jpeg;base64,/,
  );
});
