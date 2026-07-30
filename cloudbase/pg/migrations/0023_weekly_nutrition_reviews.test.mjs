import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("./0023_weekly_nutrition_reviews.sql", import.meta.url);

test("creates a server-only, date-versioned weekly nutrition review cache", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create table if not exists public\.weekly_nutrition_reviews/i);
  assert.match(migration, /unique \(user_id, end_date\)/i);
  assert.match(migration, /provider text not null check \(provider in \('deepseek', 'rule_v1'\)\)/i);
  assert.match(migration, /alter table public\.weekly_nutrition_reviews enable row level security/i);
  assert.match(migration, /weekly reviews: server only/i);
});
