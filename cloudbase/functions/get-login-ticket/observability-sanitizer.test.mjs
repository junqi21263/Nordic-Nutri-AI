import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAuditSnapshot } from "./observability-sanitizer.cjs";

test("audit snapshots keep allowlisted scalar fields only", () => {
  assert.deepEqual(
    sanitizeAuditSnapshot({ name: "鸡蛋", status: "published", token: "secret", imageUrl: "https://secret" }),
    { name: "鸡蛋", status: "published" },
  );
});
