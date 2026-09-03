import assert from "node:assert/strict";
import test from "node:test";
import { createVisionAdapterRegistry } from "./vision-adapter-registry.cjs";

test("registry exposes only registered adapters without provider-specific router logic", () => {
  const registry = createVisionAdapterRegistry({
    acme: () => async () => ({ provider: "acme", model: "acme-vision" }),
  });
  assert.equal(typeof registry.get("acme"), "function");
  assert.equal(registry.get("unknown"), null);
  assert.deepEqual(registry.keys(), ["acme"]);
});
