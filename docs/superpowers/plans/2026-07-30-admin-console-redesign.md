# Admin Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `cloudbase/admin/food-images.html` into a three-module Admin Console (users, feedback, system config) with new admin list/update APIs, while moving connection settings under the ops guide.

**Architecture:** Keep one static HTML page at `/admin/food-images.html`. Add `admin-console-service.cjs` for admin-only user list and feedback list/status updates, wired through existing `getAdminFoodRoute` + Bearer `requireAdmin` path. Frontend gets a left nav shell; food-image tooling stays intact inside the System Config panel.

**Tech Stack:** CloudBase HTTP function (`get-login-ticket`), PostgREST-style `db.from`, static HTML/CSS/JS admin page, `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-30-admin-console-redesign-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `cloudbase/functions/get-login-ticket/admin-console-service.cjs` | `listUsers`, `listFeedback`, `updateFeedbackStatus` + admin gate |
| `cloudbase/functions/get-login-ticket/admin-console-service.test.mjs` | Service unit tests |
| `cloudbase/functions/get-login-ticket/index.js` | Route parse + handlers for `/api/admin/users` and `/api/admin/feedback` |
| `cloudbase/functions/get-login-ticket/index.test.mjs` | HTTP route tests for new admin endpoints |
| `cloudbase/admin/food-images.html` | Shell rename, left nav, module panels, move utility drawer |
| `cloudbase/admin/food-images.test.mjs` | Static contract tests for shell + modules |

---

### Task 1: Admin console service — failing tests first

**Files:**
- Create: `cloudbase/functions/get-login-ticket/admin-console-service.test.mjs`
- Create: `cloudbase/functions/get-login-ticket/admin-console-service.cjs`

- [ ] **Step 1: Write failing service tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createAdminConsoleService, AdminConsoleError } from "./admin-console-service.cjs";

function makeDb({ users = [], profiles = [], feedback = [] } = {}) {
  return {
    from(table) {
      const state = { table, filters: [], op: "select", payload: null, limitN: null };
      const api = {
        select() { state.op = "select"; return api; },
        eq(col, val) { state.filters.push(["eq", col, val]); return api; },
        neq(col, val) { state.filters.push(["neq", col, val]); return api; },
        in(col, vals) { state.filters.push(["in", col, vals]); return api; },
        ilike(col, val) { state.filters.push(["ilike", col, val]); return api; },
        order() { return api; },
        limit(n) { state.limitN = n; return api; },
        update(payload) { state.op = "update"; state.payload = payload; return api; },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => {
          if (state.table === "user_feedback" && state.op === "update") {
            const row = feedback.find((f) => state.filters.some(([, c, v]) => c === "id" && f.id === v));
            if (!row) return { data: null, error: { message: "missing" } };
            Object.assign(row, state.payload);
            return { data: row, error: null };
          }
          return { data: null, error: { message: "missing" } };
        },
        then(resolve) {
          if (state.table === "app_users") {
            let rows = users.filter((u) => u.status !== "deleted");
            for (const [op, col, val] of state.filters) {
              if (op === "neq" && col === "status") rows = rows.filter((u) => u[col] !== val);
              if (op === "eq" && col === "id") rows = rows.filter((u) => u.id === val);
            }
            return resolve({ data: rows.slice(0, state.limitN ?? 50), error: null });
          }
          if (state.table === "profiles") {
            let rows = profiles;
            for (const [op, col, val] of state.filters) {
              if (op === "in" && col === "id") rows = rows.filter((p) => val.includes(p.id));
              if (op === "ilike" && col === "nickname") {
                const needle = String(val).replace(/%/g, "").toLowerCase();
                rows = rows.filter((p) => String(p.nickname || "").toLowerCase().includes(needle));
              }
            }
            return resolve({ data: rows, error: null });
          }
          if (state.table === "user_feedback") {
            let rows = [...feedback];
            for (const [op, col, val] of state.filters) {
              if (op === "eq" && col === "status") rows = rows.filter((f) => f.status === val);
              if (op === "eq" && col === "id") rows = rows.filter((f) => f.id === val);
            }
            return resolve({ data: rows.slice(0, state.limitN ?? 50), error: null });
          }
          return resolve({ data: [], error: null });
        },
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
  const rows = [{
    id: "f1", user_id: "u1", category: "product", content: "希望加餐筛选", status: "new",
    created_at: "2026-07-30T02:00:00Z", updated_at: "2026-07-30T02:00:00Z",
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
  const updated = await svc.updateFeedbackStatus("admin", "f1", { status: "reviewing" });
  assert.equal(updated.status, "reviewing");
});

test("rejects invalid feedback status", async () => {
  const svc = createAdminConsoleService({ db: makeDb({ feedback: [] }), isAdmin: async () => true });
  await assert.rejects(
    () => svc.updateFeedbackStatus("admin", "f1", { status: "nope" }),
    (e) => e instanceof AdminConsoleError && e.code === "FEEDBACK_STATUS_INVALID",
  );
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd cloudbase/functions/get-login-ticket && node --test admin-console-service.test.mjs`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `admin-console-service.cjs`**

```js
const FEEDBACK_STATUSES = new Set(["new", "reviewing", "resolved", "closed"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AdminConsoleError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function createAdminConsoleService({ db, isAdmin }) {
  if (!db?.from || typeof isAdmin !== "function") throw new Error("Admin console deps missing");

  async function requireAdmin(userId) {
    if (!userId) throw new AdminConsoleError("UNAUTHORIZED");
    if (!(await isAdmin(userId))) throw new AdminConsoleError("FORBIDDEN");
  }

  function mapUser(row, profile) {
    return {
      id: row.id,
      nickname: profile?.nickname ?? null,
      isAdmin: Boolean(row.is_admin),
      lastLoginAt: profile?.last_login_at ?? null,
      createdAt: row.created_at,
    };
  }

  function mapFeedback(row, nickname) {
    return {
      id: row.id,
      userId: row.user_id,
      nickname: nickname ?? null,
      category: row.category,
      content: row.content,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  return {
    async listUsers(userId, { q = "", limit = 50 } = {}) {
      await requireAdmin(userId);
      const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const query = String(q || "").trim();

      let profileIds = null;
      if (query && !UUID_RE.test(query)) {
        const profileResult = await db.from("profiles").select("id,nickname,last_login_at").ilike("nickname", `%${query}%`);
        if (profileResult.error) throw new AdminConsoleError("USERS_LIST_FAILED");
        profileIds = (profileResult.data || []).map((p) => p.id);
        if (!profileIds.length) return { items: [], nextCursor: null };
      }

      let userQuery = db.from("app_users").select("id,is_admin,status,created_at").neq("status", "deleted").order("created_at", { ascending: false }).limit(cap);
      if (UUID_RE.test(query)) userQuery = userQuery.eq("id", query);
      else if (profileIds) userQuery = userQuery.in("id", profileIds);

      const usersResult = await userQuery;
      if (usersResult.error) throw new AdminConsoleError("USERS_LIST_FAILED");
      const users = usersResult.data || [];
      const ids = users.map((u) => u.id);
      const profilesResult = ids.length
        ? await db.from("profiles").select("id,nickname,last_login_at").in("id", ids)
        : { data: [], error: null };
      if (profilesResult.error) throw new AdminConsoleError("USERS_LIST_FAILED");
      const profileMap = new Map((profilesResult.data || []).map((p) => [p.id, p]));
      return { items: users.map((u) => mapUser(u, profileMap.get(u.id))), nextCursor: null };
    },

    async listFeedback(userId, { status, limit = 50 } = {}) {
      await requireAdmin(userId);
      const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
      let query = db.from("user_feedback").select("id,user_id,category,content,status,created_at,updated_at").order("created_at", { ascending: false }).limit(cap);
      if (status) {
        if (!FEEDBACK_STATUSES.has(status)) throw new AdminConsoleError("FEEDBACK_STATUS_INVALID");
        query = query.eq("status", status);
      }
      const result = await query;
      if (result.error) throw new AdminConsoleError("FEEDBACK_LIST_FAILED");
      const rows = result.data || [];
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const profilesResult = ids.length
        ? await db.from("profiles").select("id,nickname").in("id", ids)
        : { data: [], error: null };
      if (profilesResult.error) throw new AdminConsoleError("FEEDBACK_LIST_FAILED");
      const nickMap = new Map((profilesResult.data || []).map((p) => [p.id, p.nickname]));
      return { items: rows.map((r) => mapFeedback(r, nickMap.get(r.user_id))), nextCursor: null };
    },

    async updateFeedbackStatus(userId, feedbackId, { status } = {}) {
      await requireAdmin(userId);
      if (!UUID_RE.test(String(feedbackId || ""))) throw new AdminConsoleError("FEEDBACK_NOT_FOUND");
      if (!FEEDBACK_STATUSES.has(status)) throw new AdminConsoleError("FEEDBACK_STATUS_INVALID");
      const result = await db.from("user_feedback").update({ status }).eq("id", feedbackId).select("id,user_id,category,content,status,created_at,updated_at").single();
      if (result.error || !result.data) throw new AdminConsoleError("FEEDBACK_NOT_FOUND");
      const profile = await db.from("profiles").select("nickname").eq("id", result.data.user_id).maybeSingle();
      return mapFeedback(result.data, profile.data?.nickname);
    },
  };
}

module.exports = { createAdminConsoleService, AdminConsoleError };
```

Adjust the fake `makeDb` in the test if the real query chain uses `.select().eq().single()` differently — keep tests green against the real API surface.

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd cloudbase/functions/get-login-ticket && node --test admin-console-service.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cloudbase/functions/get-login-ticket/admin-console-service.cjs \
  cloudbase/functions/get-login-ticket/admin-console-service.test.mjs
git commit -m "$(cat <<'EOF'
feat: add admin console user and feedback service

EOF
)"
```

---

### Task 2: Wire admin users / feedback HTTP routes

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: Add failing route tests in `index.test.mjs`**

Near existing admin food-image route tests, add:

```js
test("admin users and feedback routes require session and accept admin", async () => {
  const calls = [];
  const { baseUrl, close } = await startServer({
    // reuse existing harness pattern; inject:
    adminConsole: {
      listUsers: async (userId, query) => { calls.push(["users", userId, query]); return { items: [], nextCursor: null }; },
      listFeedback: async (userId, query) => { calls.push(["feedback", userId, query]); return { items: [], nextCursor: null }; },
      updateFeedbackStatus: async (userId, id, body) => { calls.push(["patch", userId, id, body]); return { id, status: body.status }; },
    },
    foodRepository: { isAdmin: async () => true },
    verifySession: (token) => (token === "valid-session" ? { sub: "admin-1" } : null),
  });
  try {
    const denied = await fetch(`${baseUrl}/get-login-ticket/api/admin/users`);
    assert.equal(denied.status, 401);

    const users = await fetch(`${baseUrl}/get-login-ticket/api/admin/users?q=北`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(users.status, 200);

    const feedback = await fetch(`${baseUrl}/get-login-ticket/api/admin/feedback?status=new`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(feedback.status, 200);

    const patched = await fetch(`${baseUrl}/get-login-ticket/api/admin/feedback/11111111-2222-4333-8444-555555555555`, {
      method: "PATCH",
      headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    assert.equal(patched.status, 200);
    assert.equal(calls.some((c) => c[0] === "patch"), true);
  } finally {
    await close();
  }
});
```

Adapt `startServer` injection to match how other admin services are stubbed in this file (mirror `foodImageBatches` wiring).

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd cloudbase/functions/get-login-ticket && node --test index.test.mjs --test-name-pattern "admin users and feedback"`

Expected: FAIL (404 / missing handler)

- [ ] **Step 3: Wire service + routes in `index.js`**

1. Require and construct:

```js
const { createAdminConsoleService, AdminConsoleError } = require("./admin-console-service.cjs");
// inside createService:
adminConsole: createAdminConsoleService({
  db,
  isAdmin: (userId) => foodRepository.isAdmin(userId),
}),
```

2. Extend `getAdminFoodRoute`:

```js
if (path === "/users") return { operation: "listUsers" };
if (path === "/feedback") return { operation: "listFeedback" };
const feedbackMatch = path.match(/^\/feedback\/([0-9a-f-]{36})$/i);
if (feedbackMatch) return { operation: "patchFeedback", feedbackId: feedbackMatch[1] };
```

3. In the `adminFoodRoute` handler block, before food-image branches:

```js
if (adminFoodRoute.operation === "listUsers") {
  if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
  return sendJson(res, 200, await service.adminConsole.listUsers(session.sub, {
    q: url.searchParams.get("q") || "",
    limit: url.searchParams.get("limit"),
  }));
}
if (adminFoodRoute.operation === "listFeedback") {
  if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
  return sendJson(res, 200, await service.adminConsole.listFeedback(session.sub, {
    status: url.searchParams.get("status") || undefined,
    limit: url.searchParams.get("limit"),
  }));
}
if (adminFoodRoute.operation === "patchFeedback") {
  if (req.method !== "PATCH") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
  const body = await readJsonBody(req);
  return sendJson(res, 200, await service.adminConsole.updateFeedbackStatus(session.sub, adminFoodRoute.feedbackId, body || {}));
}
```

Map `AdminConsoleError` codes:

- `UNAUTHORIZED` → 401
- `FORBIDDEN` → 403
- `FEEDBACK_STATUS_INVALID` → 400
- `FEEDBACK_NOT_FOUND` → 404
- else → 503

- [ ] **Step 4: Run route + service tests — expect PASS**

Run:

```bash
cd cloudbase/functions/get-login-ticket && node --test admin-console-service.test.mjs index.test.mjs
```

Expected: PASS (or only pre-existing unrelated failures — new tests must pass)

- [ ] **Step 5: Commit**

```bash
git add cloudbase/functions/get-login-ticket/index.js \
  cloudbase/functions/get-login-ticket/index.test.mjs
git commit -m "$(cat <<'EOF'
feat: expose admin users and feedback HTTP APIs

EOF
)"
```

---

### Task 3: Admin page shell — title, left nav, move connection card

**Files:**
- Modify: `cloudbase/admin/food-images.html`
- Modify: `cloudbase/admin/food-images.test.mjs`

- [ ] **Step 1: Add failing page contract tests**

```js
test("admin console shell uses left nav modules and renames the page", async () => {
  const source = await pageSource();
  assert.match(source, /<h1>管理后台<\/h1>/);
  assert.match(source, /Admin Console/);
  assert.match(source, /data-module="users"/);
  assert.match(source, /data-module="feedback"/);
  assert.match(source, /data-module="system"/);
  assert.match(source, /id="moduleUsers"/);
  assert.match(source, /id="moduleFeedback"/);
  assert.match(source, /id="moduleSystem"/);
});

test("connection settings sit below the workflow guide inside system config", async () => {
  const source = await pageSource();
  const guide = source.indexOf('id="workflowGuide"');
  const tools = source.indexOf('id="utilityDrawer"') >= 0
    ? source.indexOf('id="utilityDrawer"')
    : source.indexOf("连接设置与运行诊断");
  const batch = source.indexOf("batch-controller");
  assert.ok(guide >= 0 && tools > guide, "tools after guide");
  assert.ok(batch > tools, "batch composer after connection tools");
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test cloudbase/admin/food-images.test.mjs --test-name-pattern "admin console shell|connection settings sit"`

Expected: FAIL

- [ ] **Step 3: Restructure HTML shell**

Target structure:

```html
<main class="ops-shell admin-shell">
  <header class="ops-header">
    <div class="brand">... eyebrow Admin Console · h1 管理后台 ...</div>
    <div class="header-actions">status · refresh · 连接设置</div>
  </header>
  <div class="admin-layout">
    <nav class="admin-nav" aria-label="后台模块">
      <button type="button" class="admin-nav__item" data-module="users">用户数据</button>
      <button type="button" class="admin-nav__item" data-module="feedback">问题反馈</button>
      <button type="button" class="admin-nav__item active" data-module="system">系统配置</button>
    </nav>
    <div class="admin-main">
      <section id="moduleUsers" class="admin-module" hidden>...</section>
      <section id="moduleFeedback" class="admin-module" hidden>...</section>
      <section id="moduleSystem" class="admin-module">
        <!-- move workflowGuide here -->
        <!-- move utility drawer / 连接设置与运行诊断 here, immediately after guide -->
        <!-- existing batch-controller + ops-workspace -->
      </section>
    </div>
  </div>
</main>
```

CSS sketch:

```css
.admin-layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; align-items: start; }
.admin-nav { position: sticky; top: 16px; display: grid; gap: 6px; }
.admin-nav__item { text-align: left; ... }
.admin-nav__item.active { background: var(--green); color: #fff; }
.admin-module[hidden] { display: none !important; }
@media (max-width: 760px) { .admin-layout { grid-template-columns: 1fr; } }
```

JS:

```js
function setModule(name) {
  document.querySelectorAll("[data-module]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.module === name);
  });
  $("moduleUsers").hidden = name !== "users";
  $("moduleFeedback").hidden = name !== "feedback";
  $("moduleSystem").hidden = name !== "system";
  if (name === "users") loadUsers().catch(...);
  if (name === "feedback") loadFeedback().catch(...);
}
document.querySelectorAll("[data-module]").forEach((btn) => {
  btn.onclick = () => setModule(btn.dataset.module);
});
$("openTools").onclick = () => {
  setModule("system");
  const drawer = $("utilityDrawer") || document.querySelector("#moduleSystem details.utility-drawer");
  if (drawer) { drawer.open = true; drawer.scrollIntoView({ behavior: "smooth", block: "start" }); }
};
```

Keep existing food-image JS working when `moduleSystem` is visible. Update empty-state copy that says「请先在下方连接设置」→「请先在系统配置中连接后台」.

- [ ] **Step 4: Run page tests + script check**

```bash
node --test cloudbase/admin/food-images.test.mjs
sed -n '/<script>/,/<\/script>/p' cloudbase/admin/food-images.html | sed '1d;$d' | node --check
```

Expected: PASS / exit 0

- [ ] **Step 5: Commit**

```bash
git add cloudbase/admin/food-images.html cloudbase/admin/food-images.test.mjs
git commit -m "$(cat <<'EOF'
feat: reshape food-images page into admin console shell

EOF
)"
```

---

### Task 4: Users + feedback module UI

**Files:**
- Modify: `cloudbase/admin/food-images.html`
- Modify: `cloudbase/admin/food-images.test.mjs`

- [ ] **Step 1: Add contract tests for module markup/API paths**

```js
test("users and feedback modules call admin list endpoints", async () => {
  const source = await pageSource();
  assert.match(source, /id="userSearch"/);
  assert.match(source, /id="userTable"/);
  assert.match(source, /\/users\?/);
  assert.match(source, /id="feedbackStatusFilter"/);
  assert.match(source, /id="feedbackTable"/);
  assert.match(source, /\/feedback/);
  assert.match(source, /method:\s*"PATCH"/);
});
```

- [ ] **Step 2: Implement users panel**

```html
<section id="moduleUsers" class="admin-module" hidden>
  <div class="module-toolbar">
    <h2>用户数据</h2>
    <input id="userSearch" placeholder="搜索昵称或用户 ID" />
    <button id="refreshUsers" class="button secondary">刷新</button>
  </div>
  <div id="userTable" class="data-table">请先连接后台</div>
</section>
```

```js
async function loadUsers() {
  if (!token()) { $("userTable").innerHTML = `<p class="muted">请先在系统配置中连接后台</p>`; return; }
  const q = encodeURIComponent(($("userSearch").value || "").trim());
  const data = await api(`/users?q=${q}&limit=50`);
  // render table rows: nickname | lastLoginAt | isAdmin | createdAt | id
}
```

- [ ] **Step 3: Implement feedback panel**

```html
<section id="moduleFeedback" class="admin-module" hidden>
  <div class="module-toolbar">
    <h2>问题反馈</h2>
    <select id="feedbackStatusFilter">
      <option value="">全部状态</option>
      <option value="new">new</option>
      <option value="reviewing">reviewing</option>
      <option value="resolved">resolved</option>
      <option value="closed">closed</option>
    </select>
    <button id="refreshFeedback" class="button secondary">刷新</button>
  </div>
  <div id="feedbackTable" class="data-table">请先连接后台</div>
</section>
```

```js
async function loadFeedback() {
  if (!token()) { ...; return; }
  const status = $("feedbackStatusFilter").value;
  const qs = status ? `?status=${encodeURIComponent(status)}&limit=50` : "?limit=50";
  const data = await api(`/feedback${qs}`);
  // render rows with <select data-feedback-id> for status; on change:
  // await api(`/feedback/${id}`, { method: "PATCH", body: { status } });
}
```

Reuse existing `api()` helper (paths relative to `/api/admin`).

- [ ] **Step 4: Run all admin page tests**

Run: `node --test cloudbase/admin/food-images.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cloudbase/admin/food-images.html cloudbase/admin/food-images.test.mjs
git commit -m "$(cat <<'EOF'
feat: add admin users and feedback panels

EOF
)"
```

---

### Task 5: Deploy and smoke

**Files:** none (ops)

- [ ] **Step 1: Deploy function**

```bash
cd cloudbase/functions/get-login-ticket && printf '\n\n' | tcb fn deploy get-login-ticket --force --env-id lewis-healthy-d4glgqqzv73a5bc10
```

Expected: `Cloud function deployed successfully`

- [ ] **Step 2: Deploy static page**

```bash
tcb hosting deploy /Users/lewis/Documents/Nordic-Nutri-AI/cloudbase/admin/food-images.html /admin/food-images.html --env-id lewis-healthy-d4glgqqzv73a5bc10 --yes
```

Expected: upload success

- [ ] **Step 3: Manual smoke**

1. Open hosting URL for `/admin/food-images.html`
2. Connect with admin token
3. 系统配置：确认连接卡片在操作流程下方；批次列表仍可用
4. 用户数据：搜索可见用户
5. 问题反馈：改一条状态为 `reviewing`，刷新仍正确

- [ ] **Step 4: Final commit only if smoke required docs/note changes** — otherwise done

---

## Done when

- Spec acceptance criteria all met
- `admin-console-service` + route + page tests pass
- Deployed function + hosting page verified manually
