import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("./0064_push_delivery_receipts.sql", import.meta.url);

test("push delivery receipts keep token material private and allow staged delivery events", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table (?:if not exists )?public\.push_delivery_attempts/);
  assert.match(sql, /token_hash text not null/);
  assert.match(sql, /status text not null check \(status in \('pending', 'accepted', 'received', 'displayed', 'opened'/);
  assert.match(sql, /received_at timestamptz/);
  assert.match(sql, /displayed_at timestamptz/);
  assert.match(sql, /opened_at timestamptz/);
  assert.match(sql, /revoke all on public\.push_delivery_attempts from anon, authenticated/);
});
