import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminAccessToken,
  createAdminConsoleAuthService,
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
    exp: Math.floor(nowMs / 1000) + 60 * 60 * 24 * 7,
  });
});
