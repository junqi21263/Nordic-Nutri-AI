import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("feedback reply migration adds bounded reply and unread lookup", async () => {
  const sql = await readFile(new URL("./0039_feedback_replies.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists admin_reply text/i);
  assert.match(sql, /char_length\(btrim\(admin_reply\)\) between 1 and 2000/i);
  assert.match(sql, /add column if not exists replied_at timestamptz/i);
  assert.match(sql, /add column if not exists reply_read_at timestamptz/i);
  assert.match(sql, /user_feedback_user_reply_unread_idx/i);
  assert.match(sql, /revoke all on public\.user_feedback from public, anon, authenticated/i);
});
