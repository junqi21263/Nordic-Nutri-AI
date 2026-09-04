import assert from "node:assert/strict";
import test from "node:test";

import {
  createProductUserExists,
  resolveProductSession,
} from "./product-session-auth.cjs";

test("resolveProductSession rejects missing or invalid tokens", async () => {
  const missing = await resolveProductSession({ verifySession: () => null }, null);
  assert.deepEqual(missing, { error: { status: 401, body: { code: "UNAUTHORIZED" } } });

  const invalid = await resolveProductSession({
    verifySession: () => null,
  }, "bad");
  assert.equal(invalid.error.body.code, "UNAUTHORIZED");
});

test("resolveProductSession returns SESSION_USER_MISSING when app_users row is gone", async () => {
  const result = await resolveProductSession({
    verifySession: () => ({ sub: "deleted-user" }),
    productUserExists: async () => false,
  }, "token");
  assert.equal(result.error.status, 401);
  assert.equal(result.error.body.code, "SESSION_USER_MISSING");
});

test("resolveProductSession accepts a live product user", async () => {
  const result = await resolveProductSession({
    verifySession: () => ({ sub: "user-1" }),
    productUserExists: async (id) => id === "user-1",
  }, "token");
  assert.deepEqual(result, { session: { sub: "user-1" } });
});

test("createProductUserExists caches positive and negative lookups briefly", async () => {
  let calls = 0;
  const db = {
    from(table) {
      assert.equal(table, "app_users");
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          calls += 1;
          return { data: calls === 1 ? { id: "user-1" } : null, error: null };
        },
      };
    },
  };
  let now = 1_000;
  const exists = createProductUserExists(db, { ttlMs: 100, clock: () => now });
  assert.equal(await exists("user-1"), true);
  assert.equal(await exists("user-1"), true);
  assert.equal(calls, 1);
  now = 1_200;
  assert.equal(await exists("user-1"), false);
  assert.equal(calls, 2);
});

test("rejects an Android token when app_users.token_version has changed", async () => {
  const db = {
    from(table) {
      assert.equal(table, "app_users");
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: { id: "user-1", status: "active", token_version: 2 }, error: null }; },
      };
    },
  };
  const exists = createProductUserExists(db, { ttlMs: 0, clock: () => 1_000 });
  assert.equal(await exists({ sub: "user-1", ver: 1 }), false);
  assert.equal(await exists({ sub: "user-1", ver: 2 }), true);
});

test("does not cache versioned Android token lookups", async () => {
  let calls = 0;
  const db = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          calls += 1;
          return { data: { id: "user-1", status: "active", token_version: calls === 1 ? 1 : 2 }, error: null };
        },
      };
    },
  };
  const exists = createProductUserExists(db, { ttlMs: 10_000, clock: () => 1_000 });
  assert.equal(await exists({ sub: "user-1", ver: 1 }), true);
  assert.equal(await exists({ sub: "user-1", ver: 1 }), false);
  assert.equal(calls, 2);
});
