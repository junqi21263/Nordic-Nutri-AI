# CloudBase 全量后端切换设计

**状态：已确认，待实施**
**目标环境：`lewis-healthy-d4glgqqzv73a5bc10`（上海区，已验证为 CloudBase PostgreSQL 模式）**
**决策：CloudBase 成为唯一运行时后端；Supabase 仅在迁移期作为只读导出源和回退快照，不再被小程序调用。**

## 目标与边界

本设计将 Nordic Nutri AI 的 Taro 小程序从 Supabase 全量迁移到腾讯云开发，保留现有页面、交互、Zustand 领域状态和首次使用流程。

迁移完成后，小程序不再包含、读取或请求以下 Supabase 运行时能力：`@supabase/supabase-js`、Supabase URL、publishable key、Auth Session、Edge Function、Storage 和 PostgREST/RPC endpoint。

本阶段不改变餐食、身体档案、目标、偏好或登录弹窗的视觉设计；登录弹窗继续是用户确认隐私说明并开始使用的入口，而不是 Token 输入界面。

## 架构选择

采用 **CloudBase PostgreSQL + 事件云函数 + 小程序原生微信身份**。

```text
Taro / React 小程序
  └─ wx.cloud.init({ env: "lewis-healthy-d4glgqqzv73a5bc10" })
      └─ wx.cloud.callFunction
          └─ CloudBase 事件云函数
              ├─ CloudBase Auth 取得可信 uid；上下文读取 OPENID 仅用于旧账户匹配
              ├─ 用户身份绑定与授权
              ├─ CloudBase PostgreSQL 事务 / SQL RPC
              └─ CloudBase Storage 私有对象
```

不让小程序直接提交或信任 `user_id`、OPENID、数据库 owner 字段或管理凭据。云函数以 CloudBase `uid` 作为调用者身份，首次绑定后解析为内部用户 ID；仅在迁移绑定期间读取可信 OPENID 计算旧账户匹配哈希。

选择云函数作为业务边界的原因是本项目保存健康数据且存在跨表事务、历史身份映射和 AI/上传扩展需求；它比在小程序端直接暴露 PostgreSQL CRUD 更容易保持最小权限和一致的授权规则。

## 认证与首次使用

### 新用户

1. 小程序启动时执行一次 `wx.cloud.init`。
2. 用户点击现有“登录并开始使用”按钮，调用 `bootstrap-user` 云函数。
3. 云函数读取 CloudBase Auth 的可信 `uid`；仅在首次绑定时从平台上下文取得 OPENID。两者均不由客户端传入；不需要 Supabase OTP、手工 JWT 或前端持久化 Token。
4. 未找到映射用户时，创建 `app_users`、`profiles`、`user_settings` 默认记录，并将 CloudBase `uid` 绑定到内部用户 ID，返回 `onboardingRequired: true`。
5. 小程序沿用现有 onboarding 路由；完成后进入首页。

### 已迁移用户

1. `bootstrap-user` 对当前可信 OPENID 计算迁移匹配哈希，并记录当前 CloudBase `uid`。
2. 命中历史身份映射后，将 CloudBase `uid` 绑定到保留的原业务用户 UUID。
3. 已迁移的 Profile、Settings、Body Profile、Goal 和餐食继续由该 UUID 归属；不复制、不拆分用户历史。
4. 若映射不存在，绝不猜测或合并账户，而是创建新用户并记录可运营的人工合并事件。

### 退出登录

微信小程序的 CloudBase OPENID 身份是平台身份，不能也不应模拟为 Supabase Session 的服务端注销。产品的“退出登录”改为：清空本地应用 Store、最近用户缓存和本地 onboarding 草稿，回到登录入口；下一次用户主动点击入口才重新调用 `bootstrap-user`。

## 数据与权限模型

### 业务主键和迁移映射

- 现有业务表的 UUID 主键原样保留，确保餐食、餐次项、身体档案、目标和计划的外键关系不变。
- 新增仅服务端可访问的 `identity_migrations` 表，至少保存 `legacy_supabase_user_id`、`legacy_openid_hash`、`cloudbase_uid`、`bound_user_id`、`bound_at` 和审计时间。
- 迁移函数仅复制旧 OPENID 的匹配哈希，不复制 Supabase service role、微信 AppSecret、OTP 链接或客户端 Session。
- CloudBase 云函数的密钥环境变量保存用于计算 OPENID 哈希的迁移 pepper；该 pepper 必须与现有 Supabase 身份哈希算法兼容，且只在切换期保留。

若无法安全取得旧身份哈希算法或 pepper，切换不得继续；这不是可用随机 UUID 或昵称补救的问题。

### PostgreSQL 表与操作

CloudBase PostgreSQL 承载并迁移以下领域：

- 用户与引导：`app_users`、`profiles`、`user_settings`、`body_profiles`、`user_goals`
- 营养数据：`nutrition_plans`、`health_plan_items`、`food_catalog`
- 餐食数据：`meal_records`、`meal_items`
- 上传与 AI：`uploaded_assets`、`ai_analysis`
- 教练：`coach_conversations`、`coach_messages`

所有表保留检查约束、外键、唯一索引、软删除、版本化 current 记录和 `updated_at` 触发器。`save_meal_atomic` 与 `update_meal_atomic` 迁移为 CloudBase PG 函数，并由云函数在单个数据库事务中调用。

业务表启用 RLS；`anon` 与 `authenticated` 不获得直接业务表访问权限。云函数使用受控服务端数据库边界执行读写，并把当前解析出的内部用户 ID 作为不可由客户端伪造的 actor。每一个查询、更新、归档、恢复和 RPC 都必须以 actor ID 限定 owner。

### 文件与敏感数据

- 食物图片迁入 CloudBase Storage 的专用私有 bucket；路径使用 `userId/yyyy/mm/uuid.ext`。
- 数据库只保存文件键、类型、大小、哈希和状态，不保存公开永久 URL。
- 下载通过短期签名 URL 或云函数授权返回。
- OPENID、身份映射、健康数据和原图不写入前端日志、CLS 明文日志或错误 Toast。

## 云函数边界

使用 CloudBase **事件云函数**，小程序通过 `wx.cloud.callFunction` 调用；不为小程序业务创建公开 HTTP 网关。

| 云函数 | 责任 |
| --- | --- |
| `bootstrap-user` | 解析 OPENID、绑定迁移身份或创建新用户、返回最小用户状态 |
| `profile-service` | Profile、Settings、Body Profile、Goal 的读取与版本化写入 |
| `meal-service` | 餐食列表、详情、原子创建、原子编辑、归档与恢复 |
| `asset-service` | 私有图片上传授权、资产元数据与下载签名 |
| `migration-admin` | 仅一次性受管控执行：导入、校验、身份映射和回滚标记；不向小程序开放 |

每个函数统一返回 `{ success, data, requestId }` 或 `{ success: false, error: { code, message }, requestId }`。错误信息不暴露 SQL、OPENID、密钥或第三方响应。

## 小程序替换边界

保留页面与 Store 的领域接口，替换底层 runtime adapter：

| 当前区域 | 切换后 |
| --- | --- |
| `src/api/environment.ts` | 改为公开 CloudBase EnvId 与切换期模式；删除 Supabase 公开配置 |
| `src/lib/supabase-client.ts`、微信 URL/fetch/storage 兼容层 | 删除，替换为一次性 CloudBase 初始化与云函数调用器 |
| `src/api/auth-api.ts`、`src/auth/session-manager.ts` | 替换为 CloudBase bootstrap 与本地产品会话清理 |
| Profile / Goal / Body Profile / Meal repositories | 保持领域方法签名，改为调用相应云函数 |
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
