import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { normalizeLocale, localeInstruction } = require("./locale.cjs");
const { createDailyTipService } = require("./daily-tip-service.cjs");
const { createProactiveDailyBriefService, validateProactiveDailyBrief } = require("./proactive-daily-brief-service.cjs");

test("legacy clients keep Chinese, explicit locale reaches natural-language fallback", async () => {
  assert.equal(normalizeLocale(undefined), "zh-CN");
  assert.equal(normalizeLocale("zh-HK"), "zh-TW");
  assert.equal(normalizeLocale("de-DE"), "en");
  assert.match(localeInstruction("en"), /English/);
  const tip = createDailyTipService({ random: () => 0 });
  const en = await tip({ date: "2026-09-29", context: { locale: "en" } });
  const tw = await tip({ date: "2026-09-29", context: { locale: "zh-TW" } });
  assert.match(en.content, /vegetables/i);
  assert.match(tw.content, /蔬菜/);
  const brief = createProactiveDailyBriefService({});
  const result = await brief({ date: "2026-09-29", context: { locale: "en" } });
  assert.match(result.suggestion, /^Today:/);
  assert.equal(validateProactiveDailyBrief(result, "en").suggestion, result.suggestion);
});
