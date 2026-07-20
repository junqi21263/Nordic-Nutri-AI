import test from "node:test";
import assert from "node:assert/strict";
import { validatePgBaseline } from "./record-pg-baseline.mjs";

test("validates a PostgreSQL baseline", () => {
  assert.equal(validatePgBaseline({
    envId: "lewis-healthy-d4glgqqzv73a5bc10",
    runtimeMode: "postgresql",
    capturedAt: "2026-07-17T00:00:00.000Z",
    objects: [],
  }), true);
});

test("rejects a baseline for a different environment", () => {
  assert.equal(validatePgBaseline({
    envId: "another-environment",
    runtimeMode: "postgresql",
    capturedAt: "2026-07-17T00:00:00.000Z",
    objects: [],
  }), false);
});
