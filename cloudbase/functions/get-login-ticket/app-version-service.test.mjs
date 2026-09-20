import assert from "node:assert/strict";
import test from "node:test";

import { createAppVersionService } from "./app-version-service.cjs";

function createDb(row, error = null) {
  const calls = [];
  const query = {
    select(fields) { calls.push(["select", fields]); return this; },
    eq(field, value) { calls.push(["eq", field, value]); return this; },
    in(field, value) { calls.push(["in", field, value]); return this; },
    order(field, value) { calls.push(["order", field, value]); return this; },
    limit(value) { calls.push(["limit", value]); return this; },
    async maybeSingle() { return { data: row, error }; },
  };
  return { db: { from(table) { calls.push(["from", table]); return query; } }, calls };
}

test("returns the latest enabled Android release without private fields", async () => {
  const { db, calls } = createDb({
    platform: "android",
    channel: "direct",
    version_code: 2,
    version_name: "1.1.0",
    apk_url: "https://example.com/nordic-1.1.0.apk",
    apk_sha256: "a".repeat(64),
    market_url: "market://details?id=com.lewislee.nordicnutri",
    release_notes: ["登录状态自动续期"],
  });

  const result = await createAppVersionService({ db }).getLatest({ channel: "direct" });

  assert.deepEqual(result, {
    update: {
      platform: "android",
      channel: "direct",
      versionCode: 2,
      versionName: "1.1.0",
      apkUrl: "https://example.com/nordic-1.1.0.apk",
      apkSha256: "a".repeat(64),
      marketUrl: "market://details?id=com.lewislee.nordicnutri",
      releaseNotes: ["登录状态自动续期"],
    },
  });
  assert.deepEqual(calls.find((call) => call[0] === "in"), ["in", "channel", ["direct", "all"]]);
});

test("returns no update for missing or unsafe release metadata", async () => {
  await assert.deepEqual(await createAppVersionService({ db: createDb(null).db }).getLatest({ channel: "direct" }), { update: null });
  const unsafe = createDb({
    platform: "android", channel: "direct", version_code: 2, version_name: "1.1.0",
    apk_url: "http://example.com/update.apk", apk_sha256: "bad", market_url: null, release_notes: [],
  });
  await assert.deepEqual(await createAppVersionService({ db: unsafe.db }).getLatest({ channel: "direct" }), { update: null });
});
