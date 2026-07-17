# CloudBase 全量后端切换设计

**状态：已确认，待实施**
**目标环境：`lewis-healthy-d4glgqqzv73a5bc10`（上海区，已验证为 CloudBase PostgreSQL 模式）**
**决策：CloudBase 成为唯一运行时后端；Supabase 仅在迁移期作为只读导出源和回退快照，不再被小程序调用。**

## 目标与边界

本设计将 Nordic Nutri AI 的 Taro 小程序从 Supabase 全量迁移到腾讯云开发，保留现有页面、交互、Zustand 领域状态和首次使用流程。

迁移完成后，小程序不再包含、读取或请求以下 Supabase 运行时能力：`@supabase/supabase-js`、Supabase URL、publishable key、Auth Session、Edge Function、Storage 和 PostgREST/RPC endpoint。

本阶段不改变餐食、身体档案、目标、偏好或登录弹窗的视觉设计；登录弹窗继续是用户确认隐私说明并开始使用的入口，而不是 Token 输入界面。

## 架构选择

采用 **CloudBase PostgreSQL（小程序 RDB SDK + RLS/RPC）+ 小程序原生微信身份**。事件云函数只承担无法由 RDB SDK 安全、稳定完成的身份绑定、一次性迁移和未来私有计算任务。

```text
Taro / React 小程序
  └─ @cloudbase/js-sdk 2.27.3 + @cloudbase/adapter-wx_mp 1.3.1
      ├─ wx.login() → HTTPS get-login-ticket（仅换取短期 ticket 与身份匹配摘要）
      ├─ auth.signInWithCustomTicket()
      ├─ CloudBase RDB SDK
      │   ├─ PostgreSQL 表查询与写入（RLS 将 CloudBase uid 映射为内部用户 UUID）
      │   └─ PostgreSQL RPC（餐食原子保存、原子编辑）
      ├─ CloudBase Storage 私有对象
      └─ PostgreSQL bootstrap_current_user(identityProof) 安全 RPC
          ├─ 使用 auth.uid() 绑定历史账户或创建内部用户
          └─ migration-admin / AI / 私有管理任务
```

小程序绝不提交或信任 `user_id`、OPENID、数据库 owner 字段或管理凭据。目标环境是独立 CloudBase 环境，小程序使用官方适配器及自定义 ticket 登录后才取得受认证的 `auth.uid()`。RLS 通过 `app_users.cloudbase_uid` 将其映射为内部 UUID；客户端读取/写入由 RLS 限制，跨表餐食写入只允许经 PostgreSQL 安全函数完成。OPENID 只在签发 ticket 的服务端内用于一次性历史账户匹配。

此前规划的“所有业务操作均经事件云函数”不再采用：已确认 CloudBase 文档未提供可据以实现 Node 事件函数 PostgreSQL 事务/RPC 网关的稳定受支持接口。为避免猜测服务端数据库 API，业务 CRUD 改用官方 RDB SDK + RLS/RPC；云函数不再承担业务 CRUD。

## 认证与首次使用

### 新用户

1. 用户点击现有“登录并开始使用”按钮后，小程序调用 `wx.login()`，把一次性 code POST 至 `get-login-ticket`。
2. ticket 服务端以环境变量 `WX_APPID`、`WX_SECRET` 向微信换取 session，使用 Custom Login 私钥签发 CloudBase ticket，并用受控 `IDENTITY_HASH_PEPPER` 生成不含 OPENID 的 `identityProof`。
3. 小程序使用官方适配器执行 `auth.signInWithCustomTicket()`，获得 CloudBase Auth 会话；两种身份均不由客户端输入，不需要 Supabase OTP、手工 JWT 或前端持久化 Token。
4. 已认证的小程序调用 `bootstrap_current_user(identityProof)`。该 PostgreSQL `security definer` RPC 只信任 `auth.uid()`：已有映射则返回；未绑定的匹配哈希则绑定原 UUID；无匹配则创建 `app_users`、`profiles`、`user_settings` 默认记录并返回 `onboardingRequired: true`。
5. 小程序沿用现有 onboarding 路由；完成后进入首页。

### 已迁移用户

1. `get-login-ticket` 对当前可信 OPENID 计算迁移匹配哈希；小程序只收到 identityProof，不收到 OPENID。
2. 命中历史身份映射后，将 CloudBase `uid` 绑定到保留的原业务用户 UUID。
3. 已迁移的 Profile、Settings、Body Profile、Goal 和餐食继续由该 UUID 归属；不复制、不拆分用户历史。
4. 若映射不存在，绝不猜测或合并账户，而是创建新用户并记录可运营的人工合并事件。

### 退出登录

微信小程序的 CloudBase 身份是平台身份，不能也不应模拟为 Supabase Session 的服务端注销。产品的“退出登录”改为：清空本地应用 Store、最近用户缓存和本地 onboarding 草稿，回到登录入口；下一次用户主动点击入口才重新换取 ticket、登录并调用 bootstrap RPC。

## 数据与权限模型

### 业务主键和迁移映射

- 现有业务表的 UUID 主键原样保留，确保餐食、餐次项、身体档案、目标和计划的外键关系不变。
- 新增仅服务端可访问的 `identity_migrations` 表，至少保存 `legacy_supabase_user_id`、`legacy_openid_hash`、`cloudbase_uid`、`bound_user_id`、`bound_at` 和审计时间。
- 迁移函数仅复制旧 OPENID 的匹配哈希，不复制 Supabase service role、微信 AppSecret、OTP 链接或客户端 Session。
- `get-login-ticket` 的密钥环境变量保存 `WX_APPID`、`WX_SECRET` 和用于计算 OPENID 哈希的迁移 pepper；Custom Login 私钥只位于该函数的受保护部署包/密钥挂载中。pepper 必须与现有 Supabase 身份哈希算法兼容，且只在切换期保留。

若无法安全取得旧身份哈希算法或 pepper，切换不得继续；这不是可用随机 UUID 或昵称补救的问题。

### PostgreSQL 表与操作

CloudBase PostgreSQL 承载并迁移以下领域：

- 用户与引导：`app_users`、`profiles`、`user_settings`、`body_profiles`、`user_goals`
- 营养数据：`nutrition_plans`、`health_plan_items`、`food_catalog`
- 餐食数据：`meal_records`、`meal_items`
- 上传与 AI：`uploaded_assets`、`ai_analysis`
- 教练：`coach_conversations`、`coach_messages`

所有表保留检查约束、外键、唯一索引、软删除、版本化 current 记录和 `updated_at` 触发器。`bootstrap_current_user`、`save_meal_atomic` 与 `update_meal_atomic` 迁移为 CloudBase PG 安全函数，由已认证的小程序经 RDB SDK 调用；函数内从 `auth.uid()` 解析 owner，绝不接受客户端 owner 参数。`bootstrap_current_user` 只接受 ticket 服务返回的 HMAC identityProof，不接受 OPENID。

业务表启用 RLS；匿名会话不得访问健康数据，认证会话只可访问其映射的内部用户记录。每一个查询、更新、归档、恢复和 RPC 都由 policy 或安全函数以 `auth.uid()` 映射出的 actor 限定 owner。

### 文件与敏感数据

- 食物图片迁入 CloudBase Storage 的专用私有 bucket；路径使用 `userId/yyyy/mm/uuid.ext`。
- 数据库只保存文件键、类型、大小、哈希和状态，不保存公开永久 URL。
- 下载使用 CloudBase Storage 的私有访问能力；如需签名 URL，必须由平台受支持的 SDK 方法生成，不自行拼接存储 URL。
- OPENID、身份映射、健康数据和原图不写入前端日志、CLS 明文日志或错误 Toast。

## 云函数边界

业务 CRUD 不经云函数代理。独立 CloudBase 环境的 Custom Login 例外：`get-login-ticket` 是唯一允许的 HTTP 云函数，且仅接受 POST、只校验一次性微信 code 并返回短期 ticket/identityProof；它不访问业务 PG、不返回 OPENID。其他云函数不为小程序业务创建公开 HTTP 网关。

| 云函数 | 责任 |
| --- | --- |
| `get-login-ticket`（HTTP，仅 POST） | 校验 wx.login code、签发 Custom Login ticket 和 HMAC identityProof；不访问业务 PG、不返回 OPENID |
| `migration-admin` | 仅一次性受管控执行：导入、校验、身份映射和回滚标记；不向小程序开放 |
| 后续 AI / 私有管理函数 | 仅在不能由 RDB/Storage SDK + RLS 安全完成时增加，并单独评审 |

每个函数统一返回 `{ success, data, requestId }` 或 `{ success: false, error: { code, message }, requestId }`。错误信息不暴露 SQL、OPENID、密钥或第三方响应。

## 小程序替换边界

保留页面与 Store 的领域接口，替换底层 runtime adapter：

| 当前区域 | 切换后 |
| --- | --- |
| `src/api/environment.ts` | 改为公开 CloudBase EnvId 与切换期模式；删除 Supabase 公开配置 |
| `src/lib/supabase-client.ts`、微信 URL/fetch/storage 兼容层 | 删除，替换为 CloudBase SDK/小程序适配器、RDB/Storage 客户端和 ticket 调用器 |
| `src/api/auth-api.ts`、`src/auth/session-manager.ts` | 替换为 Custom Ticket 登录、`bootstrap_current_user` RPC 与本地产品会话清理 |
| Profile / Goal / Body Profile / Meal repositories | 保持领域方法签名，改为调用 RDB 表查询、受 RLS 保护的写入和安全 RPC |
| `src/repositories/runtime-adapter.ts` | 删除 Supabase mode；最终只保留 `cloudbase` 和受测试保护的 `fixture` |
| `src/dev/auth-harness/*` | 替换为 CloudBase 环境、函数、用户 bootstrap 与 PG 权限诊断 |
| `@supabase/supabase-js` 与 Supabase 类型 | 在全量验收通过后移除依赖与生成类型 |

开发期间允许 fixture adapter 作为自动化测试与离线视觉回归的测试双，但生产、development 真实联调和发布构建不得再选择 Supabase。

## 全量数据迁移与回退

### 迁移顺序

1. 对 Supabase 数据库、Storage 对象清单和函数配置做加密备份；记录行数、文件数、校验和与导出时间。
2. 在 CloudBase PG 创建完整 schema、约束、函数、RLS、私有 Storage bucket 和云函数；先以空环境验收。
3. 导入无用户依赖的 `food_catalog`，再按外键顺序导入用户、资料、设置、版本化档案、目标、计划、餐食、餐次项、AI/资产和教练数据。
4. 导入身份映射哈希；不导入 Supabase Auth Session、OTP code 或服务密钥。
5. 用表行数、主键集合、外键孤儿检查、聚合营养总量和对象哈希校验源端与目标端一致。
6. 将小程序配置切换到 CloudBase，完成真实微信首次用户、已迁移用户、资料、餐食 CRUD、退出和冷启动验收。
7. 连续观察期内冻结 Supabase 写入并保留只读备份；确认验收后移除所有 Supabase 运行时依赖和环境变量。

### 回退原则

在“删除 Supabase 运行时依赖”之前，保留可重新发布的上一版本小程序构建物和只读 Supabase 导出快照。若 CloudBase 验收失败，停止新版本发布、恢复上一小程序版本并只恢复到最后确认的 Supabase 快照；不进行来源不明的双向数据合并。

本次决策是不再依赖 Supabase，因此不采用长期双写。切换窗口通过短暂冻结写入来保证单一事实来源。

## 验收标准

1. CloudBase 环境明确处于 PostgreSQL 模式，且目标 `EnvId` 被显式写入受控配置。
2. 所有业务表、约束、索引、触发器、原子餐食函数、RLS 和私有 bucket 通过 schema 检查。
3. 新用户只经 CloudBase 原生微信身份即可创建资料并进入 onboarding。
4. 已迁移用户可绑定到原 UUID，读取到完整历史资料和餐食；不能越权读取其他用户数据。
5. 餐食创建、编辑、归档、恢复和幂等重试都在 CloudBase PG 中完成。
6. 构建产物、源代码、配置和依赖树中不存在 Supabase URL、publishable key、service role、Edge Function 调用或 `@supabase/supabase-js`。
7. TypeScript、ESLint、单元测试、微信构建、真实开发者工具联调、权限负向测试和数据校验全部通过。

## 前置条件与阻塞项

- 必须先完成 CloudBase MCP 的设备授权，才能读取环境并确认 PostgreSQL 可用。
- 若目标环境没有 PostgreSQL，必须创建新的 PG 环境；不在只含 NoSQL 的环境中改造本项目关系型数据。
- 迁移执行前必须取得 Supabase 导出权限、Storage 导出权限及现有 OPENID 哈希算法/pepper 的受控访问方式。
- 任何包含用户健康数据的导出、临时文件和日志均需加密、最小保存期限和访问审计。
