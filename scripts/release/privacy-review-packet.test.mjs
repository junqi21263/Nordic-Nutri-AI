import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = resolve(dirname(new URL(import.meta.url).pathname), "../..");

test("privacy review packet has the required evidence sections and explicit owner gates", async () => {
  const packet = await readFile(resolve(root, "docs/WECHAT_PRIVACY_REVIEW_PACKET.md"), "utf8");
  for (const required of [
    "处理范围",
    "AI 用途",
    "删除路径",
    "真实运营主体全称",
    "有效联系邮箱/电话",
    "微信公众平台隐私指引",
    "删除核验",
  ]) {
    assert.match(packet, new RegExp(required));
  }
  assert.match(packet, /DRAFT — OWNER INPUT REQUIRED/);
});

test("privacy review packet contains no credential-shaped material", async () => {
  const files = [
    "docs/WECHAT_PRIVACY_REVIEW_PACKET.md",
    "docs/PRODUCTION_SECRET_ROTATION_RUNBOOK.md",
  ];
  const text = await Promise.all(files.map((file) => readFile(resolve(root, file), "utf8")));
  const combined = text.join("\n");
  assert.doesNotMatch(combined, /-----BEGIN [A-Z ]+-----/);
  assert.doesNotMatch(combined, /Bearer\s+[A-Za-z0-9._-]{20,}/i);
  assert.doesNotMatch(combined, /(?:api[_-]?key|secret|token)\s*[:=]\s*[A-Za-z0-9+/=_-]{24,}/i);
});
