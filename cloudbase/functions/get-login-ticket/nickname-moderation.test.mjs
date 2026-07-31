import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNicknameAllowed,
  findBannedNicknameTerm,
  NICKNAME_MODERATION_MESSAGE,
} from "./nickname-moderation.cjs";

test("detects banned nicknames after normalization", () => {
  assert.equal(findBannedNicknameTerm("Nordic Nutri AI"), "nordicnutri");
  assert.equal(findBannedNicknameTerm("加 微 信"), "加微信");
  assert.equal(findBannedNicknameTerm("林间慢慢走"), null);
});

test("assertNicknameAllowed throws a product-invalid error", () => {
  assert.throws(
    () => assertNicknameAllowed("管理员小号"),
    (error) => error instanceof Error && error.message === NICKNAME_MODERATION_MESSAGE && error.code === "PRODUCT_DATA_INVALID",
  );
});
