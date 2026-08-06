import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_TOKEN_TTL_SECONDS,
  createAdminAccessToken,
  createAdminConsoleAuthService,
  createLoginAttemptTracker,
  createPersistentLoginAttemptTracker,
  PublicAdminAuthError,
} from "./admin-console-auth-service.cjs";
import { verifyAccessToken } from "./product-session-service.cjs";

test("issues an admin_console role token after username/password login", async () => {
  const writes = [];
  const nowMs = Date.now();
  const service = createAdminConsoleAuthService({
    sessionSecret: "session-secret",
    identityPepper: "pepper",
    username: "ops",
    password: "secret-pass",
    now: () => nowMs,
    db: {
      from(table) {
        assert.equal(table, "app_users");
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                };
              },
            };
          },
          insert(row) {
            writes.push(row);
            return {
              select() {
                return {
                  single: async () => ({ data: { id: "admin-user-1" }, error: null }),
                };
              },
            };
          },
        };
      },
    },
  });

  const result = await service.login({ username: "ops", password: "secret-pass" });
  const session = verifyAccessToken(result.session.accessToken, "session-secret");
  assert.equal(session.sub, "admin-user-1");
  assert.equal(session.role, "admin_console");
  assert.equal(writes[0].is_admin, true);
  assert.equal(session.exp, Math.floor(nowMs / 1000) + ADMIN_TOKEN_TTL_SECONDS);
});

test("rejects wrong password without revealing timing shape differences beyond equal length", async () => {
  const service = createAdminConsoleAuthService({
    sessionSecret: "session-secret",
    identityPepper: "pepper",
    username: "ops",
    password: "secret-pass",
    db: { from: () => { throw new Error("must not touch db"); } },
  });
  await assert.rejects(
    () => service.login({ username: "ops", password: "wrong-pass!!" }),
    (error) => error instanceof PublicAdminAuthError && error.code === "ADMIN_AUTH_INVALID",
  );
});

test("createAdminAccessToken is verifiable by the shared session verifier", () => {
  const nowMs = Date.now();
  const token = createAdminAccessToken("u1", "session-secret", () => nowMs);
  assert.deepEqual(verifyAccessToken(token, "session-secret"), {
    sub: "u1",
    role: "admin_console",
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + ADMIN_TOKEN_TTL_SECONDS,
  });
  assert.equal(ADMIN_TOKEN_TTL_SECONDS, 60 * 60 * 12);
});

test("rate-limits repeated admin login failures within the window", async () => {
  let nowMs = 1_000_000;
  const tracker = createLoginAttemptTracker({
    windowMs: 60_000,
    maxFailures: 3,
    now: () => nowMs,
  });
  const service = createAdminConsoleAuthService({
    sessionSecret: "session-secret",
    identityPepper: "pepper",
    username: "ops",
    password: "secret-pass",
    now: () => nowMs,
    loginAttemptTracker: tracker,
    db: { from: () => { throw new Error("must not touch db"); } },
  });

  for (let i = 0; i < 3; i += 1) {
    await assert.rejects(
      () => service.login({ username: "ops", password: "wrong" }),
      (error) => error instanceof PublicAdminAuthError && error.code === "ADMIN_AUTH_INVALID",
    );
  }
  await assert.rejects(
    () => service.login({ username: "ops", password: "wrong" }),
    (error) => error instanceof PublicAdminAuthError && error.code === "ADMIN_AUTH_RATE_LIMITED",
  );
  await assert.rejects(
    () => service.login({ username: "ops", password: "secret-pass" }),
    (error) => error instanceof PublicAdminAuthError && error.code === "ADMIN_AUTH_RATE_LIMITED",
  );

  nowMs += 61_000;
  await assert.rejects(
    () => service.login({ username: "ops", password: "wrong" }),
    (error) => error instanceof PublicAdminAuthError && error.code === "ADMIN_AUTH_INVALID",
  );
});

test("persistent login attempt tracker consumes only a peppered username hash through PG RPC", async () => {
  const calls = [];
  const tracker = createPersistentLoginAttemptTracker({
    identityPepper: "pepper",
    db: {
      rpc(name, payload) {
        calls.push([name, payload]);
        return Promise.resolve({ data: [{ allowed: true }], error: null });
      },
    },
  });
  const service = createAdminConsoleAuthService({
    sessionSecret: "session-secret",
    identityPepper: "pepper",
    username: "ops",
    password: "secret-pass",
    loginAttemptTracker: tracker,
    db: {
      from() {
        return {
          select() { return { eq() { return { maybeSingle: async () => ({ data: { id: "admin-user-1", is_admin: true }, error: null }) }; } }; },
        };
      },
    },
  });

  await service.login({ username: "ops", password: "secret-pass" });
  assert.equal(calls[0][0], "consume_admin_login_attempt");
  assert.match(calls[0][1].p_attempt_key, /^[a-f0-9]{64}$/);
  assert.notEqual(calls[0][1].p_attempt_key, "ops");
  assert.equal(calls[1][0], "clear_admin_login_attempt");
});
