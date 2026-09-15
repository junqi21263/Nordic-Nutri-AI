import assert from "node:assert/strict";
import test from "node:test";
import { createUserOpsService, UserOpsError } from "./user-ops-service.cjs";

const USER_ID = "11111111-2222-4333-8444-555555555555";

function makeDb() {
  const rows = {
    app_users: [{ id: USER_ID, status: "active", registration_channel: "google", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-15T00:00:00Z" }],
    profiles: [{ id: USER_ID, nickname: "北欧用户", last_login_at: "2026-08-15T10:00:00Z", onboarding_completed_at: "2026-08-01T01:00:00Z" }],
    meal_records: [{ id: "meal-1", user_id: USER_ID, recorded_at: "2026-08-15T09:00:00Z", deleted_at: null }],
    ai_analysis: [{ id: "analysis-1", user_id: USER_ID, client_request_id: "req-1", status: "succeeded", provider: "qwen", created_at: "2026-08-15T09:01:00Z" }],
    coach_messages: [{ id: "coach-1", user_id: USER_ID, role: "assistant", provider: "deepseek", created_at: "2026-08-15T09:02:00Z" }],
    uploaded_assets: [{ id: "asset-1", user_id: USER_ID, status: "attached", created_at: "2026-08-15T09:00:30Z" }],
    user_feedback: [{ id: "feedback-1", user_id: USER_ID, category: "bug", status: "new", content: "不要返回这段正文", created_at: "2026-08-15T09:03:00Z", updated_at: "2026-08-15T09:03:00Z" }],
    content_moderation_flags: [{ id: "flag-1", user_id: USER_ID, source: "feedback", status: "open", snippet: "不要返回这段审核片段", created_at: "2026-08-15T09:04:00Z" }],
    ops_account_deletion_log: [{ id: "deletion-1", user_id: USER_ID, outcome: "failed", error_code: "STORAGE_UNAVAILABLE", created_at: "2026-08-15T09:05:00Z" }],
  };
  return {
    from(table) {
      const state = { table, filters: [], limit: null, single: false };
      const run = async () => {
        let result = [...(rows[state.table] || [])];
        for (const [op, column, value] of state.filters) {
          if (op === "eq") result = result.filter((row) => row[column] === value);
          if (op === "is") result = result.filter((row) => (value === null ? row[column] === null : true));
        }
        if (state.limit !== null) result = result.slice(0, state.limit);
        if (state.single) return { data: result[0] || null, error: null };
        return { data: result, error: null, count: result.length };
      };
      const api = {
        select() { return api; },
        eq(column, value) { state.filters.push(["eq", column, value]); return api; },
        is(column, operator, value) { if (operator === "is") state.filters.push(["is", column, value]); return api; },
        order() { return api; },
        limit(value) { state.limit = value; return api; },
        maybeSingle() { state.single = true; return run(); },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      return api;
    },
  };
}

test("rejects non-admin callers and unknown users", async () => {
  const service = createUserOpsService({ db: makeDb(), isAdmin: async () => false });
  await assert.rejects(() => service.getUserDetail("operator", USER_ID), (error) => error instanceof UserOpsError && error.code === "FORBIDDEN");

  const allowed = createUserOpsService({ db: makeDb(), isAdmin: async () => true });
  await assert.rejects(() => allowed.getUserDetail("operator", "22222222-2222-4333-8444-555555555555"), (error) => error.code === "USER_NOT_FOUND");
});

test("returns bounded user summaries and a redacted operational timeline", async () => {
  const service = createUserOpsService({
    db: makeDb(),
    isAdmin: async () => true,
    hashUserId: (userId) => `hash:${userId}`,
    listTraces: async ({ userHash }) => ({ items: [{ traceId: "trace-1", clientRequestId: "req-1", userHash, feature: "vision", status: "succeeded", startedAt: "2026-08-15T09:01:30Z", durationMs: 1200, errorCode: null }], total: 1 }),
  });

  const detail = await service.getUserDetail("operator", USER_ID);
  assert.equal(detail.id, USER_ID);
  assert.equal(detail.profile.registrationChannel, "google");
  assert.equal(detail.overview.mealsCount, 1);
  assert.equal(detail.aiUsage.visionCount, 1);
  assert.equal(detail.images.count, 1);
  assert.equal(detail.feedback.items[0].id, "feedback-1");
  assert.equal("content" in detail.feedback.items[0], false);
  assert.equal("snippet" in detail.moderation.items[0], false);
  assert.equal("userId" in detail.deletion.items[0], false);

  const timeline = await service.getUserTimeline("operator", USER_ID);
  assert.ok(timeline.items.some((item) => item.type === "vision" && item.traceId === "trace-1"));
  assert.ok(timeline.items.some((item) => item.resourceId === "analysis-1" && item.traceId === "trace-1"));
  assert.ok(timeline.items.some((item) => item.type === "feedback" && item.resourceId === "feedback-1"));
  for (const item of timeline.items) {
    assert.equal("content" in item, false);
    assert.equal("snippet" in item, false);
    assert.equal("imagePath" in item, false);
    assert.equal("openid" in item, false);
  }
});
