import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("./0051_vision_quota_expiry_reconcile.sql", import.meta.url), "utf8");
const readback = await readFile(new URL("./0051_vision_quota_expiry_reconcile.readback.sql", import.meta.url), "utf8");
const rollback = await readFile(new URL("./0051_vision_quota_expiry_reconcile.rollback.sql", import.meta.url), "utf8");

test("0051 releases expired quota and synchronizes linked analysis state", () => {
  assert.match(sql, /release_expired_vision_quota_reservations/i);
  assert.match(sql, /reservation_state\s*=\s*'released'/i);
  assert.match(sql, /quota_state\s*=\s*'released'/i);
  assert.match(sql, /state\s*=\s*'expired'/i);
  assert.match(sql, /expires_at\s*<=\s*now\(\)/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
});

test("0051 readback proves the expiry function and stale-row repair", () => {
  assert.match(readback, /pg_get_functiondef/i);
  assert.match(readback, /reservation_state/i);
  assert.match(readback, /quota_state/i);
  assert.match(readback, /expired/i);
  assert.doesNotMatch(readback, /\b(insert|delete)\s+into/i);
});

test("0051 rollback is forward-only and does not restore a stale reservation", () => {
  assert.match(rollback, /forward-only/i);
  assert.doesNotMatch(rollback, /update\s+.*quota_state\s*=\s*'reserved'/i);
  assert.doesNotMatch(rollback, /drop\s+function/i);
});
