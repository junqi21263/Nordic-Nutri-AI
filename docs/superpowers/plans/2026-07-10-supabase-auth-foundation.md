# Supabase Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为本地开发环境建立可验证的 Supabase Auth 用户、会话、用户投影与 RLS 隔离基础，不接入微信登录。

**Architecture:** `auth.users` 是唯一身份主体；私有的数据库触发器在新用户创建时原子创建 `public.users` 和 `public.profiles`。小程序 Auth 模块依赖可注入的客户端与会话存储接口，不携带特权密钥；`auth-helper` Edge Function 复用现有统一 JWT 校验、错误与响应层。

**Tech Stack:** Supabase Auth、PostgreSQL RLS、Deno TypeScript、微信小程序 TypeScript、Node 内置测试、psql/curl 本地集成测试。

---

### Task 1: 锁定 Auth 投影与全域 RLS 回归

**Files:**
- Modify: `supabase/tests/rls_ownership.sql`
- Create: `supabase/tests/auth_rls_integration.sh`

- [x] **Step 1: 写入失败的 RLS 覆盖测试**

测试需创建两个 `auth.users`，断言触发器投影后，身份 A 只能读取自己的 `profiles`、`user_goals`、`body_profiles`、`nutrition_plans`、`meal_records`。

- [x] **Step 2: 运行 SQL 测试并观察失败**

Run: `PGPASSWORD=postgres psql "postgresql://postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls_ownership.sql`

Expected: 现有测试不覆盖全部用户域表，因此新断言在尚未补齐前失败。

- [x] **Step 3: 最小化补齐测试数据和断言**

保留现有 RLS policies，不放宽数据库授权；只让测试覆盖既有的所有权策略。

- [x] **Step 4: 以本地 Auth API 验证注册、登录与 session**

`auth_rls_integration.sh` 使用临时随机邮箱通过本地 `/auth/v1/signup` 创建两个用户，检查 access token、刷新会话、并携带 A 的 JWT 读取 REST API；所有 token 写临时文件/变量，禁止输出。

### Task 2: 创建受 JWT 保护的 Auth Helper Function

**Files:**
- Create: `supabase/functions/auth-helper/index.ts`
- Modify: `supabase/tests/test_edge_functions_skeleton_static.py`

- [x] **Step 1: 先扩展静态测试**

断言 `auth-helper` 存在，并通过共享 `requireUser`、`withRequestContext` 与 `success` 输出最小用户 DTO；测试初始应因缺少文件失败。

- [x] **Step 2: 最小实现 Function**

仅允许 `POST`；从 Bearer JWT 解析用户，返回 `{ id, email }`，不返回 token、metadata 或特权数据；未认证请求沿用 `UNAUTHORIZED` 统一错误。

- [x] **Step 3: 验证静态合约**

Run: `python3 -m unittest supabase.tests.test_edge_functions_skeleton_static -v`

Expected: PASS。

### Task 3: 创建小程序 Auth 调用边界

**Files:**
- Create: `mini-program/src/services/auth/types.ts`
- Create: `mini-program/src/services/auth/login.ts`
- Create: `mini-program/src/services/auth/session.ts`
- Create: `mini-program/src/services/auth/user.ts`
- Create: `mini-program/src/services/auth/index.ts`
- Create: `mini-program/src/types/auth.ts`
- Create: `mini-program/tsconfig.json`
- Create: `mini-program/src/types/global.d.ts`
- Create: `supabase/tests/test_mini_program_auth_static.py`

- [x] **Step 1: 先写文件边界与 TypeScript 合约测试**

测试应要求 login/session/user 三模块存在，且不包含 `service_role`、微信 code 交换或 AppSecret；初始应失败。

- [x] **Step 2: 最小实现接口驱动封装**

`login.ts` 仅调用注入的 `signUp`/`signInWithPassword`；`session.ts` 仅保存、恢复、刷新、清除会话；`user.ts` 从已验证的客户端用户读取 `id` 与可选 email。微信适配器和微信登录均不实现。

- [x] **Step 3: 编译与静态安全校验**

Run: `pnpm exec tsc --project mini-program/tsconfig.json --noEmit` and `python3 -m unittest supabase.tests.test_mini_program_auth_static -v`

Expected: PASS。

### Task 4: 端到端本地验证

**Files:**
- Modify: `scripts/verify-initialization.test.mjs`

- [x] **Step 1: 执行本地数据库重建**

Run: `pnpm exec supabase db reset --local --yes`

- [x] **Step 2: 执行所有静态、SQL 与 Auth API 测试**

Run: `python3 -m unittest discover -s supabase/tests -p 'test_*.py' -v`; `psql ... -f supabase/tests/rls_ownership.sql`; `bash supabase/tests/auth_rls_integration.sh`; `pnpm exec supabase db advisors --local --type all --level warn --fail-on error`.

- [x] **Step 3: 核对安全范围**

确认 `auth-helper` 只做 JWT 用户解析，且无 `wechat`、`WECHAT_APP_SECRET`、`service_role` 或 AI 代码；不运行远端 `db push`、不部署 Function。
