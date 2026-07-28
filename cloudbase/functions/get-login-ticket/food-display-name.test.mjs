import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getFoodDisplayName } = require("./food-display-name.cjs");

test("keeps an existing Chinese food name", () => {
  assert.equal(
    getFoodDisplayName({ nameZh: "鸡胸肉", nameEn: "Chicken breast" }),
    "鸡胸肉",
  );
});

test("localizes common USDA primary names when Chinese is missing", () => {
  assert.equal(getFoodDisplayName({ nameZh: null, nameEn: "CHICKEN" }), "鸡肉");
  assert.equal(getFoodDisplayName({ nameZh: null, nameEn: "BEEF, NFS" }), "牛肉");
  assert.equal(getFoodDisplayName({ nameZh: null, nameEn: "Soup, chicken" }), "鸡肉汤");
  assert.equal(
    getFoodDisplayName({ nameZh: null, nameEn: "Chicken, chicken roll, roasted" }),
    "烤鸡肉卷",
  );
});

test("does not replace an unknown name with a misleading translation", () => {
  assert.equal(
    getFoodDisplayName({ nameZh: null, nameEn: "Arctic char, smoked" }),
    "Arctic char, smoked",
  );
});
