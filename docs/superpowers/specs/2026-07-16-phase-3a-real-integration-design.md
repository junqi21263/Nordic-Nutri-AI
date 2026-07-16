# Phase 3A：小程序单纵向链路真实联调设计

**状态：已确认，待实施**
**范围：3A-1 与 3A-2**
**不在范围内：AI 餐食识别、计划生成、教练回复、图片上传、全量页面重构、tabBar 与视觉重设计**

## 目标

将现有小程序的一条用户业务链路从 fixture 模式逐步接入 development Supabase：

`启动 → Session 恢复或微信登录 → Profile / Settings → Body Profile → Health Goal → 手工餐食 CRUD → 退出登录`

现有页面的视觉结构、字体、主题、tabBar 和正式文案保持不变。只增加必要的 loading、空态、错误、重试、保存中禁用、登录失效提示与登录入口。

## 方案选择

采用 **Repository + Adapter（方案 A）**。

- 页面和 Zustand store 只依赖领域模型与 repository，不直接调用 `supabase.from` 或 `functions.invoke`。
- 每个领域同时提供 fixture adapter 和 Supabase adapter。
- development 中 `TARO_APP_USE_REAL_BACKEND=true` 时使用 Supabase adapter；其他环境保持 fixture adapter。
- `TARO_APP_ENABLE_REAL_AUTH=true` 仅控制真实认证；生产构建默认两项真实开关均为 `false`。
- 服务端 Secret 仅保留在 Edge Function 环境，前端仅使用 Supabase URL 与 publishable key。

这避免了全量重写当前 fixture 交互，并使同一页面在开发联调与默认演示模式间保持相同的数据契约。

## 登录和会话流程

### 状态机

`initializing → authenticated | unauthenticated`

`authenticated` 仅在 Session、`auth.getUser()` 与基础 Profile 均有效后进入。`unauthenticated` 不携带上一用户的业务状态。

### 启动

1. 应用只启动一个 Auth Bootstrap promise。
2. 从微信 storage 恢复 Supabase Session。
3. 有 Session 时，调用 `auth.getUser()`；必要时只刷新一次 access token 后重试。
4. 验证成功后读取 Profile 与 user_settings，写入 Auth Store 和业务 store。
5. 没有可用 Session 时，首次进入可静默发起一次 `wx.login` 建立应用身份。
6. Bootstrap 完成前只显示必要 loading，不让业务页各自恢复 Session 或重复跳转。

### 主流小程序登录交互

- `wx.login` 只用于应用身份建立，不额外要求昵称、头像、手机号等授权。
- 首次登录的 Profile 使用后端默认值；昵称和头像仍由既有个人资料页主动编辑。
- 登录成功的 Session 由既有微信 storage adapter 持久化，冷启动优先恢复，不重复调用 `wx.login`。
- 用户主动退出或刷新失败后，进入简洁的登录入口；此时仅在用户点击“微信登录”后重新登录，避免退出后立即自动登录。
- 登录入口、loading 与错误信息不显示 token、code、openid 或服务端错误细节。

### 失效、重试和退出

- 受保护请求出现 401 时，由统一 request wrapper 刷新 Session 并重试一次。
- 刷新或重试失败时，清除 Supabase auth storage、Auth Store、Profile Store、Meal Store 和与用户相关的 query cache。
- 同一轮请求不允许再次刷新，避免循环。
- `signOut` 调用 Supabase 本地退出，清空所有用户状态并显示登录入口。
- 用户切换时，先清除上一用户数据，再读取新用户的 Profile、Settings 与餐食数据。

## Repository 与适配器

统一基础返回结构包含领域数据、分页游标/范围、规范化错误和可追踪 requestId。

| Repository | Supabase 数据源 | 核心职责 |
| --- | --- | --- |
| `auth-repository` | Auth + `wechat-login` | Bootstrap、微信登录、刷新、退出、当前用户 |
| `profile-repository` | `profiles` | 读取和更新 nickname、avatar_path、timezone、language；禁止写 id |
| `settings-repository` | `user_settings` | 读取和更新饮食、忌口、每日餐数、单位、语言、通知、主题 |
| `body-profile-repository` | `body_profiles` | current、历史、创建新版本；不修改历史版本 |
| `health-goal-repository` | `user_goals` | current、历史、创建新版本；不修改历史版本 |
| `meal-repository` | `save_meal_atomic`、`active_meal_records`、`meal_records`、`meal_items` | 原子创建、读取、编辑、软删除、归档恢复、筛选、分页 |

Repository 内使用现有 Supabase adapter 与 `withAuthRefresh`。页面不得知晓当前是 fixture 还是 Supabase。

## Profile、Settings、Body Profile 与 Goal

### Profile / Settings

- 认证触发器创建的 Profile 与 user_settings 被视为唯一初始记录；前端仅读取、更新，不插入重复记录。
- 保存完成后，以服务端响应或重新读取的结果更新 store。
- Profile 更新字段限定为 nickname、avatar_path、timezone、language / locale 的可映射字段，禁止写 owner id。
- 所有编辑页统一处理 loading、saving、校验错误、网络错误和 retry。

### Body Profile

- current 使用 `is_current=true` 读取，历史按 `effective_at` 倒序读取。
- 首次保存插入一条 current 版本；后续修改始终插入新版本，由后端触发器退役旧版本。
- 数据库的 `age` 仍为必填字段：保存时由 `birth_date` 按本地日期计算 age，并同时写入 `birth_date`；读取时优先以 `birth_date` 计算展示年龄。两者都只写入新的版本，避免篡改历史记录。
- 校验出生日期、身高、体重、活动等级、训练天数与单位换算。
- 并发提交以 UI 保存中锁定处理；数据库 current 唯一索引是最终保护。

### Health Goal

- current 使用 `is_current=true` 读取，历史按 `created_at` 倒序读取。
- 每次修改插入新的 current Goal，由后端触发器退役旧版本。
- 校验 goal_type、目标体重、目标日期不得早于本地当天、异常体重范围。
- 没有 Body Profile 时，保留现有页面并显示必要引导，不创建不完整 Goal。

## 手工餐食 CRUD

- 手工创建餐食只调用现有 `save_meal_atomic`，一次提交至少一个 item 与唯一 `client_request_id`。
- 保存中禁用重复点击；网络重试复用同一个 `client_request_id`，由后端唯一约束保证幂等。
- 服务端触发器根据 item 重新计算营养总量；客户端传入总量不作为最终来源。
- 常规列表读取 `active_meal_records`，按日期、餐次、名称、时间排序和分页；归档列表显式读取 `meal_records.deleted_at is not null`。
- 详情读取餐食及 items。现有 `save_meal_atomic` 只创建记录，不能安全地替换多个既有 item；因此新增最小的 `update_meal_atomic` SECURITY INVOKER RPC，在单一事务中校验归属、更新 meal、替换 items、由触发器重算并返回最终结果。任一 item 失败时整次编辑回滚。
- 删除采用 `deleted_at` 软删除；恢复清除 `deleted_at`。列表和详情通过 store 的失效重读保持一致。
- 不接图片、不调用 `analyze-food`、`generate-plan` 或 `coach-answer`。

## Store 与页面接入

- Auth Store 仅保存可序列化的状态、Session、User 与 bootstrap 状态，不保存 Supabase Client。
- Profile Store 与 Meal Store 分离 fixture 数据、远端数据、loading 和 error；不能在页面卸载时清除全局 Session。
- 页面请求带 request generation；组件卸载或用户切换后忽略过期响应。
- 接入页面：Profile、Profile Edit、Diet Preferences、Body Profile、Goal Adjust、Manual Meal、Meal Records、Meal Detail，以及必要的启动 / 登录入口。
- Auth Harness 只保留在 development 路由，不进入 tabBar、生产构建或正式登录入口。

## 测试和验收

测试先行，至少覆盖：

1. Session 恢复、刷新、401 单次重试、刷新失败清理、退出、用户切换和无并发 `wx.login`。
2. Profile / Settings 的获取、更新、校验和跨用户隔离。
3. Body Profile / Goal 的首次创建、新版本、current 唯一与历史读取。
4. 手工餐食的多 item 原子创建、幂等重试、失败回滚、详情编辑、软删除、恢复、筛选和分页。
5. 页面 loading、empty、error、retry、保存中禁用，以及退出后 store 清理。
6. TypeScript、ESLint、Vitest、WeChat 构建、生产 feature flag、Secret 扫描和 `git diff --check`。

真实 development 复验包括：首次微信登录、同一用户再次登录、Profile / Settings 不重复创建、`last_login_at` 更新、冷启动恢复、`getUser`、退出与受保护请求拒绝。

## 分阶段实施

### 3A-1

Auth Bootstrap 与登录入口；统一 repository 基础设施；Profile、Settings、Body Profile、Health Goal 和对应 store / 页面接入。

### 3A-2

新增最小的原子编辑 RPC 迁移并部署；Meal Repository；手工餐食原子保存、列表、详情、编辑、归档恢复、筛选分页和对应 store / 页面接入。

每个阶段在完成后独立执行单元测试、真实 development 联调和 WeChat 构建。任何 AI、全局视觉或无关页面改动都不属于本阶段。
