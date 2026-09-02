import assert from "node:assert/strict";
import test from "node:test";
import {
  featureCapability,
  featureRouteKeys,
  modelCapabilities,
  normalizeCapabilities,
} from "./model-routing-contract.cjs";

test("maps each configurable feature to its required model capability", () => {
  assert.equal(featureCapability("coach"), "text");
  assert.equal(featureCapability("daily_insight"), "text");
  assert.equal(featureCapability("food_recognition"), "vision");
  assert.equal(featureCapability("food_image_generation"), "image_generation");
  assert.equal(featureCapability("unknown_feature"), null);
  assert.deepEqual(featureRouteKeys("food_recognition"), ["food_recognition", "vision"]);
  assert.deepEqual(featureRouteKeys("food_image_generation"), ["food_image_generation", "food_image"]);
});

test("normalizes model capabilities without accepting unsupported values", () => {
  assert.deepEqual(normalizeCapabilities(["text", "vision", "text", "unknown"]), ["text", "vision"]);
  assert.deepEqual(normalizeCapabilities("text"), []);
});

test("requires explicit capabilities instead of inferring them from a model name", () => {
  assert.deepEqual(modelCapabilities({ modelKey: "any-future-model" }), []);
  assert.deepEqual(modelCapabilities({ modelKey: "any-future-model", capabilities: ["text", "vision"] }), ["text", "vision"]);
});
