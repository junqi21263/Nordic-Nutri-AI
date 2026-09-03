import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("./food-images.html", import.meta.url);

test("quota workspace combines personal limits with provider/model routes", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /id="quotaUpdatedAt"/);
  assert.match(source, /quota-data-note \{ display: none; \}/);
  assert.match(source, /data-open-provider=/);
  assert.match(source, /当前模型路由 \/ 厂商额度来源/);
  assert.match(source, /id="featureUserQuotaBoard"/);
  assert.doesNotMatch(source, /id="quotaModelTable"/);
});

test("quota workspace exposes only feature-level personal limits", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /功能额度与当前模型路由/);
  assert.match(source, /\/ops\/feature-user-quota-policies/);
  assert.doesNotMatch(source, /策略用量 \/ 内部限额/);
  assert.doesNotMatch(source, /data-edit-model-quota=/);
  assert.doesNotMatch(source, /function saveModelQuotaPolicy/);
});
