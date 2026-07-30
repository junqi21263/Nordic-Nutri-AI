import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("./0020_daily_nutrition_insights.sql", import.meta.url);
const upgradeUrl = new URL("./0021_daily_nutrition_insights_cloudbase_provider.sql", import.meta.url);
const hotfixUrl = new URL("./0022_daily_nutrition_insights_hunyuan_provider.sql", import.meta.url);

test("allows the dev Hunyuan provider as a persisted daily insight provider", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /provider text not null check \(provider in \('cloudbase', 'deepseek', 'hunyuan-exp', 'rule_v3'\)\)/,
  );
});

test("upgrades an existing daily insight cache constraint for the dev Hunyuan provider", async () => {
  const migration = await readFile(upgradeUrl, "utf8");

  assert.match(migration, /drop constraint if exists daily_nutrition_insights_provider_check/i);
  assert.match(migration, /check \(provider in \('cloudbase', 'deepseek', 'hunyuan-exp', 'rule_v3'\)\)/i);
});

test("provides an idempotent live hotfix for the dev Hunyuan provider", async () => {
  const migration = await readFile(hotfixUrl, "utf8");

  assert.match(migration, /drop constraint if exists daily_nutrition_insights_provider_check/i);
  assert.match(migration, /check \(provider in \('cloudbase', 'deepseek', 'hunyuan-exp', 'rule_v3'\)\)/i);
});
