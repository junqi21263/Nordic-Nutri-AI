import assert from "node:assert/strict";
import test from "node:test";

import { createPasswordService } from "./services/auth.cjs";

test("password service delegates hashing and verification to Argon2id", async () => {
  const calls = [];
  const argon2 = {
    argon2id: "argon2id",
    async hash(password, options) {
      calls.push(["hash", password, options]);
      return "argon2id$hash";
    },
    async verify(hash, password) {
      calls.push(["verify", hash, password]);
      return hash === "argon2id$hash" && password === "password";
    },
  };
  const service = createPasswordService({ argon2 });

  assert.equal(await service.hash("password"), "argon2id$hash");
  assert.equal(await service.verify("password", "argon2id$hash"), true);
  assert.equal(calls[0][2].type, "argon2id");
});
