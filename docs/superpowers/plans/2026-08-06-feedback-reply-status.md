# 用户反馈处理与后台回复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 让后台可用中文状态回复用户反馈，并让用户在「反馈与帮助」中查看处理状态与回复、通过未读铃铛发现新回复。

**Architecture:** user_feedback 保持服务器专用。迁移新增回复与已读字段；用户服务只读取/更新当前会话用户，管理员服务处理状态和回复写入。个人中心继续复用现有 BottomSheet，以模式下拉切换提交和处理记录。

**Tech Stack:** CloudBase PostgreSQL、Node.js CommonJS HTTPS function、Taro 4 + React + TypeScript、node:test、Vitest。

---

## File map

| Path | Responsibility |
|---|---|
| cloudbase/pg/migrations/0039_feedback_replies.sql | 追加回复、回复时间和用户已读时间。 |
| cloudbase/pg/migrations/0039_feedback_replies.test.mjs | 锁定字段、约束、索引和 server-only 权限。 |
| cloudbase/functions/get-login-ticket/feedback-data-service.cjs | 用户反馈列表、未读数、批量已读。 |
| cloudbase/functions/get-login-ticket/admin-console-service.cjs | 管理员状态和回复。 |
| cloudbase/functions/get-login-ticket/index.js | 用户与管理员 HTTP 路由。 |
| cloudbase/admin/food-images.html | 中文状态、操作列和回复弹窗。 |
| mini-program/src/api/feedback-api.ts | 强类型用户端反馈 API。 |
| mini-program/src/pages/profile/index.tsx | 下拉切换、处理记录和铃铛。 |

## Task 1: 数据库回复字段

**Files:**
- Create: cloudbase/pg/migrations/0039_feedback_replies.sql
- Create: cloudbase/pg/migrations/0039_feedback_replies.test.mjs

- [ ] **Step 1: 写失败的迁移契约测试。**

    test("feedback reply migration adds bounded reply and unread lookup", async () => {
      const sql = await readFile(new URL("./0039_feedback_replies.sql", import.meta.url), "utf8");
      assert.match(sql, /add column if not exists admin_reply text/i);
      assert.match(sql, /char_length\(btrim\(admin_reply\)\) between 1 and 2000/i);
      assert.match(sql, /add column if not exists replied_at timestamptz/i);
      assert.match(sql, /add column if not exists reply_read_at timestamptz/i);
      assert.match(sql, /user_feedback_user_reply_unread_idx/i);
    });

- [ ] **Step 2: 验证失败。**

Run: node --test cloudbase/pg/migrations/0039_feedback_replies.test.mjs

Expected: FAIL，迁移文件不存在。

- [ ] **Step 3: 写最小可重放迁移。**

    alter table public.user_feedback
      add column if not exists admin_reply text,
      add column if not exists replied_at timestamptz,
      add column if not exists reply_read_at timestamptz;

    create index if not exists user_feedback_user_reply_unread_idx
      on public.user_feedback (user_id, replied_at desc)
      where admin_reply is not null and reply_read_at is null;

用 DO 块检查后再创建名为 user_feedback_admin_reply_length_check 的约束，限制非空回复去除首尾空格后为 1–2,000 字。不得新增客户端 grant 或 RLS 放行策略。

- [ ] **Step 4: 验证通过并提交。**

Run: node --test cloudbase/pg/migrations/0039_feedback_replies.test.mjs

Expected: PASS。

    git add cloudbase/pg/migrations/0039_feedback_replies.sql cloudbase/pg/migrations/0039_feedback_replies.test.mjs
    git commit -m "feat: add feedback reply persistence"

## Task 2: 用户反馈处理 API

**Files:**
- Modify: cloudbase/functions/get-login-ticket/feedback-data-service.cjs
- Modify: cloudbase/functions/get-login-ticket/feedback-data-service.test.mjs
- Modify: cloudbase/functions/get-login-ticket/index.js
- Modify: cloudbase/functions/get-login-ticket/index.test.mjs

- [ ] **Step 1: 写服务失败测试。**

为 listFeedbackForUser("user-a") 断言查询有 .eq("user_id", "user-a")，返回：

    {
      items: [{ id, category, content, status, createdAt, adminReply, repliedAt, replyReadAt }],
      unreadReplyCount: 1,
    }

为 markRepliesRead("user-a", [id]) 断言更新同时限制 user_id = user-a、admin_reply 非空及 reply_read_at 为空；空数组返回 markedCount: 0，超过 50 个或非 UUID 输入抛 PublicFeedbackError。

- [ ] **Step 2: 验证失败。**

Run: node --test cloudbase/functions/get-login-ticket/feedback-data-service.test.mjs

Expected: FAIL，两个方法尚未实现。

- [ ] **Step 3: 实现最小服务。**

在 createFeedbackDataService 中增加：

    async listFeedbackForUser(userId, { limit = 30 } = {}) { /* own rows, newest first */ }
    async markRepliesRead(userId, feedbackIds) { /* own replied unread rows only */ }

所有字段从 PG snake_case 映射为 camelCase；不返回 device_context。未读数只统计 admin_reply 非空且 reply_read_at 为空的当前用户记录。

- [ ] **Step 4: 写并验证 HTTP 路由测试。**

测试 GET /feedback 返回 200，POST /feedback/read 加 feedbackIds 后返回 200；匿名为 401，GET /feedback/read 为 405，service 实参只能是验证出的 session.sub。

实现 GET /feedback、POST /feedback/read；两者均先 authorizeProductRequest，保留原 POST /feedback。用户输入错误为 400 FEEDBACK_INVALID，服务不可用为 503。

- [ ] **Step 5: 验证通过并提交。**

Run: node --test cloudbase/functions/get-login-ticket/feedback-data-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs

Expected: PASS。

    git add cloudbase/functions/get-login-ticket/feedback-data-service.cjs cloudbase/functions/get-login-ticket/feedback-data-service.test.mjs cloudbase/functions/get-login-ticket/index.js cloudbase/functions/get-login-ticket/index.test.mjs
    git commit -m "feat: expose feedback reply status to users"

## Task 3: 后台回复和中文状态

**Files:**
- Modify: cloudbase/functions/get-login-ticket/admin-console-service.cjs
- Modify: cloudbase/functions/get-login-ticket/admin-console-service.test.mjs
- Modify: cloudbase/functions/get-login-ticket/index.js
- Modify: cloudbase/functions/get-login-ticket/index.test.mjs
- Modify: cloudbase/admin/food-images.html
- Create: cloudbase/admin/food-images.test.mjs

- [ ] **Step 1: 写管理员 service 失败测试。**

    const updated = await svc.updateFeedback("admin", feedbackId, { reply: "我们已加入计划" });
    assert.equal(updated.status, "resolved");
    assert.equal(updated.adminReply, "我们已加入计划");
    assert.ok(updated.repliedAt);
    assert.equal(updated.replyReadAt, null);

覆盖空白/超过 2,000 字回复、非法状态、既无状态也无回复；再次保存不同回复必须清空 reply_read_at。

- [ ] **Step 2: 验证失败并实现 service。**

Run: node --test cloudbase/functions/get-login-ticket/admin-console-service.test.mjs

Expected: FAIL，updateFeedback 和回复映射不存在。

扩展 mapFeedback，使用单一 updateFeedback(userId, feedbackId, { status, reply })。有效回复的 patch 为：

    {
      admin_reply: normalizedReply,
      replied_at: new Date().toISOString(),
      reply_read_at: null,
      status: "resolved",
    }

仅有状态时只更新状态，更新前必须 requireAdmin(userId)。

- [ ] **Step 3: 更新管理员路由并验证。**

让 PATCH /api/admin/feedback/:id 调用 updateFeedback。测试 reply body 被传递；匿名为 401、非 PATCH 为 405。

Run: node --test cloudbase/functions/get-login-ticket/admin-console-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs

Expected: PASS。

- [ ] **Step 4: 写后台页面失败合同测试。**

    assert.match(source, /new: "已收到", reviewing: "处理中", resolved: "已回复", closed: "已关闭"/);
    assert.match(source, /回复反馈/);
    assert.match(source, /保存回复并通知用户/);
    assert.match(source, /body: { reply }/);

Run: node --test cloudbase/admin/food-images.test.mjs

Expected: FAIL。

- [ ] **Step 5: 实现后台页面。**

定义：

    const feedbackStatusLabels = { new: "已收到", reviewing: "处理中", resolved: "已回复", closed: "已关闭" };

筛选和状态 option 显示中文、保留英文 value。表格新增「操作」列和「回复反馈」按钮。复用 food-admin-modal 的关闭/遮罩方式，弹窗展示上下文、已有回复、最大 2,000 字输入框与「保存回复并通知用户」。保存请求为 PATCH /feedback/:id、body 为 reply；成功后清空 60 秒缓存并重新加载。

- [ ] **Step 6: 验证通过并提交。**

Run: node --test cloudbase/admin/food-images.test.mjs cloudbase/functions/get-login-ticket/admin-console-service.test.mjs

Expected: PASS。

    git add cloudbase/functions/get-login-ticket/admin-console-service.cjs cloudbase/functions/get-login-ticket/admin-console-service.test.mjs cloudbase/functions/get-login-ticket/index.js cloudbase/functions/get-login-ticket/index.test.mjs cloudbase/admin/food-images.html cloudbase/admin/food-images.test.mjs
    git commit -m "feat: reply to feedback from admin console"

## Task 4: 小程序反馈处理和铃铛

**Files:**
- Modify: mini-program/src/api/feedback-api.ts
- Create: mini-program/src/assets/icons/bell.svg
- Modify: mini-program/src/components/nordic-icon/index.tsx
- Modify: mini-program/src/pages/profile/index.tsx
- Modify: mini-program/src/styles/page.scss
- Create: mini-program/tests/feedback-reply-flow.test.ts
- Modify: mini-program/tests/feedback-api-boundary.test.ts

- [ ] **Step 1: 写小程序失败合同测试。**

要求 API 导出 getMyFeedback 与 markFeedbackRepliesRead，页面包含「反馈处理」、Picker、NordicIcon name=bell、「我们的回复」与 markFeedbackRepliesRead；图标类型和来源均包含 bell。

- [ ] **Step 2: 验证失败。**

Run: pnpm --dir mini-program test:unit -- tests/feedback-reply-flow.test.ts tests/feedback-api-boundary.test.ts

Expected: FAIL。

- [ ] **Step 3: 实现 API、图标与页面状态。**

    export const getMyFeedback = () => requestProductApi<MyFeedbackResult>("/feedback", {
      method: "GET", fallbackMessage: "反馈处理记录加载失败，请稍后重试",
    });
    export const markFeedbackRepliesRead = (feedbackIds: string[]) =>
      requestProductApi<{ markedCount: number }>("/feedback/read", {
        method: "POST", data: { feedbackIds }, fallbackMessage: "反馈已读状态更新失败，请稍后重试",
      });

添加本地 Lucide Bell SVG，按 NordicIcon 注册模式加入 bell。ProfilePage 增加 feedbackMode、反馈列表和未读数量；入页静默获取列表，不能阻塞资料/周报。抽屉使用 Picker 在「提交反馈」/「反馈处理」间切换。处理记录按时间倒序显示中文状态、原反馈和存在时的「我们的回复」。首次切到记录时只调用一次 markFeedbackRepliesRead(unreadIds)，成功后清零本地未读数。入口通过 ListItem.trailing 显示 bell，仅当未读数大于零。

- [ ] **Step 4: 添加样式并验证。**

新增 profile-feedback-mode-picker、profile-feedback-list、profile-feedback-card、profile-feedback-status、profile-feedback-reply、profile-feedback-bell。沿用浅米色卡片、深绿文字、浅绿色回复区；不显示数字 badge。确保抽屉列表可滚动，现有 textarea 行为不变。

Run: pnpm --dir mini-program test:unit -- tests/feedback-reply-flow.test.ts tests/feedback-api-boundary.test.ts tests/profile-bottom-sheet.test.ts tests/coach-profile.test.ts

Expected: PASS。

- [ ] **Step 5: 提交用户端。**

    git add mini-program/src/api/feedback-api.ts mini-program/src/assets/icons/bell.svg mini-program/src/components/nordic-icon/index.tsx mini-program/src/pages/profile/index.tsx mini-program/src/styles/page.scss mini-program/tests/feedback-reply-flow.test.ts mini-program/tests/feedback-api-boundary.test.ts
    git commit -m "feat: show feedback replies in profile"

## Task 5: 全量验证和真机验收

**Files:** Verify only: 上述所有文件。

- [ ] **Step 1: 运行自动验证。**

    pnpm run check
    pnpm --dir mini-program typecheck
    pnpm --dir mini-program lint
    pnpm --dir mini-program test:unit
    node --test cloudbase/functions/get-login-ticket/*.test.mjs cloudbase/pg/migrations/*.test.mjs cloudbase/admin/food-images.test.mjs
    pnpm --dir mini-program build:weapp
    pnpm --dir mini-program verify:weapp
    git diff --check

Expected: 所有命令退出码为 0。

- [ ] **Step 2: 在开发者工具和真机验收。**

用专用测试账号确认：仅改为「处理中」不出现铃铛；保存回复后入口出现铃铛；进入「反馈处理」可看到上下文、中文状态和回复并清除铃铛；管理员再次回复后铃铛重新出现；普通用户无法读取另一用户反馈，管理员 API 无会话返回 401。

- [ ] **Step 3: 提交验证结果。**

仅在工作区没有无关改动时运行：

    git add -A
    git commit -m "test: verify feedback reply flow"

若有无关改动，只暂存本计划列出的文件。
