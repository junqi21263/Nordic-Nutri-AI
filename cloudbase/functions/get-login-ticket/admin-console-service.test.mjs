import assert from "node:assert/strict";
import test from "node:test";
import { createAdminConsoleService, AdminConsoleError } from "./admin-console-service.cjs";

function makeDb({ users = [], profiles = [], feedback = [] } = {}) {
  return {
    from(table) {
      const state = { table, filters: [], op: "select", payload: null, limitN: null, singleMode: null };
      const run = async () => {
        if (state.table === "app_users") {
          let rows = users.filter((u) => u.status !== "deleted");
          for (const [op, col, val] of state.filters) {
            if (op === "neq" && col === "status") rows = rows.filter((u) => u[col] !== val);
            if (op === "eq" && col === "id") rows = rows.filter((u) => u.id === val);
            if (op === "in" && col === "id") rows = rows.filter((u) => val.includes(u.id));
          }
          rows = rows.slice(0, state.limitN ?? 50);
          if (state.singleMode === "maybe") return { data: rows[0] ?? null, error: null };
          if (state.singleMode === "single") {
            return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "missing" } };
          }
          return { data: rows, error: null };
        }
        if (state.table === "profiles") {
          let rows = [...profiles];
          for (const [op, col, val] of state.filters) {
            if (op === "in" && col === "id") rows = rows.filter((p) => val.includes(p.id));
            if (op === "eq" && col === "id") rows = rows.filter((p) => p.id === val);
            if (op === "ilike" && col === "nickname") {
              const needle = String(val).replace(/%/g, "").toLowerCase();
              rows = rows.filter((p) => String(p.nickname || "").toLowerCase().includes(needle));
            }
          }
          if (state.singleMode === "maybe") return { data: rows[0] ?? null, error: null };
          if (state.singleMode === "single") {
            return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "missing" } };
          }
          return { data: rows, error: null };
        }
        if (state.table === "user_feedback") {
          if (state.op === "update") {
            const row = feedback.find((f) => state.filters.some(([op, c, v]) => op === "eq" && c === "id" && f.id === v));
            if (!row) return { data: null, error: { message: "missing" } };
            Object.assign(row, state.payload, { updated_at: "2026-07-30T03:00:00Z" });
            if (state.singleMode === "single" || state.singleMode === "maybe") return { data: { ...row }, error: null };
            return { data: [{ ...row }], error: null };
          }
          let rows = [...feedback];
          for (const [op, col, val] of state.filters) {
            if (op === "eq" && col === "status") rows = rows.filter((f) => f.status === val);
            if (op === "eq" && col === "id") rows = rows.filter((f) => f.id === val);
          }
          rows = rows.slice(0, state.limitN ?? 50);
          if (state.singleMode === "maybe") return { data: rows[0] ?? null, error: null };
          if (state.singleMode === "single") {
            return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "missing" } };
          }
          return { data: rows, error: null };
        }
        return { data: [], error: null };
      };
      const api = {
        select() { return api; },
        eq(col, val) { state.filters.push(["eq", col, val]); return api; },
        neq(col, val) { state.filters.push(["neq", col, val]); return api; },
        in(col, vals) { state.filters.push(["in", col, vals]); return api; },
        ilike(col, val) { state.filters.push(["ilike", col, val]); return api; },
        order() { return api; },
        limit(n) { state.limitN = n; return api; },
        update(payload) { state.op = "update"; state.payload = payload; return api; },
        maybeSingle() { state.singleMode = "maybe"; return run(); },
        single() { state.singleMode = "single"; return run(); },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      return api;
    },
  };
}

test("rejects non-admin callers", async () => {
  const svc = createAdminConsoleService({
    db: makeDb(),
    isAdmin: async () => false,
  });
  await assert.rejects(() => svc.listUsers("u1", {}), (e) => e instanceof AdminConsoleError && e.code === "FORBIDDEN");
});

test("lists users with profile nickname and login time", async () => {
  const svc = createAdminConsoleService({
    db: makeDb({
      users: [{ id: "u1", is_admin: true, status: "active", created_at: "2026-07-01T00:00:00Z" }],
      profiles: [{ id: "u1", nickname: "北欧", last_login_at: "2026-07-30T01:00:00Z" }],
    }),
    isAdmin: async () => true,
  });
  const result = await svc.listUsers("admin", {});
  assert.equal(result.items[0].nickname, "北欧");
  assert.equal(result.items[0].isAdmin, true);
  assert.equal(result.items[0].lastLoginAt, "2026-07-30T01:00:00Z");
});

test("lists feedback and updates status", async () => {
  const feedbackId = "11111111-2222-4333-8444-555555555555";
  const rows = [{
    id: feedbackId,
    user_id: "u1",
    category: "product",
    content: "希望加餐筛选",
    status: "new",
    created_at: "2026-07-30T02:00:00Z",
    updated_at: "2026-07-30T02:00:00Z",
  }];
  const svc = createAdminConsoleService({
    db: makeDb({
      feedback: rows,
      profiles: [{ id: "u1", nickname: "北欧", last_login_at: null }],
    }),
    isAdmin: async () => true,
  });
  const listed = await svc.listFeedback("admin", {});
  assert.equal(listed.items[0].content, "希望加餐筛选");
  assert.equal(listed.items[0].nickname, "北欧");
  const updated = await svc.updateFeedbackStatus("admin", feedbackId, { status: "reviewing" });
  assert.equal(updated.status, "reviewing");
});

test("rejects invalid feedback status", async () => {
  const svc = createAdminConsoleService({ db: makeDb({ feedback: [] }), isAdmin: async () => true });
  await assert.rejects(
    () => svc.updateFeedbackStatus("admin", "11111111-2222-4333-8444-555555555555", { status: "nope" }),
    (e) => e instanceof AdminConsoleError && e.code === "FEEDBACK_STATUS_INVALID",
  );
});
