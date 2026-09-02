import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("./0054_ops_observability.sql", import.meta.url), "utf8");

test("0054 creates the Trace and Worker observability tables", () => {
  assert.match(migration, /create table if not exists public\.ops_request_traces/i);
  assert.match(migration, /create table if not exists public\.ops_job_runs/i);
  for (const column of ["trace_id", "client_request_id", "feature", "status", "last_stage", "started_at", "meta_json", "stages_json", "expires_at"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`, "i"));
  }
});

test("0054 indexes operational query paths and keeps tables server-only", () => {
  assert.match(migration, /ops_request_traces_status_started_at_idx/i);
  assert.match(migration, /ops_request_traces_feature_started_at_idx/i);
  assert.match(migration, /ops_job_runs_job_key_started_at_idx/i);
  assert.match(migration, /alter table public\.ops_request_traces enable row level security/i);
  assert.match(migration, /alter table public\.ops_job_runs enable row level security/i);
  assert.match(migration, /revoke all on public\.ops_request_traces, public\.ops_job_runs/i);
});
