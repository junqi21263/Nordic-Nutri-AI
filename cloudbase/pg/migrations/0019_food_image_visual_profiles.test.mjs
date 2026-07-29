import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("./0019_food_image_visual_profiles.sql", import.meta.url);

test("visual-profile migration deterministically keeps one primary image before adding the unique index", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const indexAt = sql.indexOf("create unique index if not exists food_images_one_primary_per_profile_idx");
  const dedupeAt = sql.indexOf("food_images_ranked_for_visual_profile");

  assert.ok(dedupeAt >= 0, "migration must rank duplicate historical primary images");
  assert.ok(dedupeAt < indexAt, "duplicate primary images must be resolved before the unique index");
  assert.match(sql, /set is_primary\s*=\s*false/i);
});
