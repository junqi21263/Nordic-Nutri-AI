# Nordic Nutri 管理后台改版设计

**日期：** 2026-07-30  
**状态：** 待实现  
**页面路径：** 继续部署 `cloudbase/admin/food-images.html` → 静态托管 `/admin/food-images.html`

## 背景

现有页面是「食物图片审核台」单页控制台。需要升格为「管理后台」，并纳入小程序「反馈与帮助」写入的数据，以及基础用户列表。食物图片生成与审核下沉为「系统配置」模块。

## 已确认决策

| 项 | 选择 |
|---|---|
| 信息架构 | 左侧导航：用户数据 / 问题反馈 / 系统配置 |
| 用户数据 | 只读列表 + 搜索（昵称 / 登录时间 / 是否管理员） |
| 问题反馈 | 列表 + 可更新 `status` |
| 页面交付 | 仍使用 `/admin/food-images.html`，不新增入口路径 |
| 实现形态 | 扩展现有单页 HTML（不另起 React 管理端） |

## 目标

1. 标题与品牌改为「管理后台」。
2. 左侧模块切换；系统配置保留现有批次生成与审核能力。
3. 「连接设置与运行诊断」移到「操作流程与状态说明」正下方。
4. 新增管理员可读用户列表与反馈列表；反馈可改状态。
5. 所有新接口复用现有管理员 Bearer 会话校验。

## 非目标

- 用户资料/目标的详情页或编辑。
- 修改 `is_admin`、停用账号、删除用户。
- 反馈管理员备注字段（本版不扩展 schema）。
- 拆多 HTML 或新建 `/admin/index.html`。
- 改变现有 food-image batch / review / diagnose 业务语义。

## 信息架构

```
管理后台
├─ 顶栏：品牌「管理后台」· 连接状态 · 刷新
├─ 左侧导航
│  ├─ 用户数据
│  ├─ 问题反馈
│  └─ 系统配置（默认进入）
└─ 主区
   ├─ 用户数据：搜索 + 表格
   ├─ 问题反馈：状态筛选 + 表格 + 状态操作
   └─ 系统配置（自上而下）
      1. 操作流程与状态说明（可折叠）
      2. 连接设置与运行诊断（可折叠，默认展开更合理；与现网一致即可）
      3. 批次 composer + 审核工作台（现有 UI）
```

顶栏「连接设置」若保留，行为改为滚动/展开系统配置内的连接卡片，不再依赖页底位置。

## UI 与交互

### 壳层

- eyebrow：`Nordic Nutri · Admin Console`
- h1：`管理后台`
- 左侧导航高亮当前模块；未连接时用户/反馈列表展示引导文案，提示先到系统配置完成连接。

### 用户数据

- 搜索框：按昵称模糊匹配（空昵称用占位「未设置昵称」展示，仍可按 id 前缀搜索可选）。
- 表格列：昵称、上次登录、管理员、注册时间、用户 ID（可缩短展示）。
- 分页：`limit` 默认 50；有 `nextCursor` 则「加载更多」。

### 问题反馈

- 筛选：全部 / new / reviewing / resolved / closed。
- 表格列：提交时间、分类、状态、昵称、内容摘要、操作。
- 操作：下拉或按钮将状态改为允许值之一；成功后刷新该行。
- 点击内容可展开全文（同页详情区或行内展开）。

### 系统配置

- 现有审核台逻辑整体迁入本模块，DOM/脚本尽量复用。
- 连接设置卡片从页面底部移到操作流程说明下方。
- 统计、诊断、批次、队列、审批行为不变。

## API 设计

Base：现有 admin API 前缀（`/get-login-ticket/api/admin/...`），鉴权：`Authorization: Bearer <admin session>`，与 food-image admin 相同（`requireAdmin`）。

### `GET /api/admin/users`

Query：

- `q` optional string — 昵称 ILIKE；若像 UUID 则额外匹配 `app_users.id`
- `limit` optional int，默认 50，最大 100
- `cursor` optional — `created_at` + `id` 复合游标（ISO 时间 + uuid）

Response：

```json
{
  "items": [
    {
      "id": "uuid",
      "nickname": "字符串或 null",
      "isAdmin": false,
      "lastLoginAt": "ISO-8601 | null",
      "createdAt": "ISO-8601"
    }
  ],
  "nextCursor": "opaque | null"
}
```

数据源：`app_users` LEFT JOIN `profiles`。排除 `status = 'deleted'`（若有）。

### `GET /api/admin/feedback`

Query：

- `status` optional — `new|reviewing|resolved|closed`
- `limit` / `cursor` — 同用户列表模式，按 `created_at desc`

Response：

```json
{
  "items": [
    {
      "id": "uuid",
      "userId": "uuid",
      "nickname": "字符串或 null",
      "category": "product|bug|feature|support",
      "content": "string",
      "status": "new|reviewing|resolved|closed",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "nextCursor": "opaque | null"
}
```

数据源：`user_feedback` JOIN `profiles`（nickname）。

### `PATCH /api/admin/feedback/:id`

Body：`{ "status": "reviewing" }`（仅允许四态之一）

Response：更新后的单条反馈对象（同上 item 形状）。

非法 status → 400；不存在 → 404；非管理员 → 401/403（与现有 admin 一致）。

## 后端实现要点

- 新增小服务模块（如 `admin-console-service.cjs`）或扩展现有 admin 服务：`listUsers`、`listFeedback`、`updateFeedbackStatus`，内部均 `requireAdmin`。
- 在 `index.js` 注册三条路由，风格对齐现有 `/api/admin/food-image-*`。
- 不新增 migration：`user_feedback.status` 与 `profiles` / `app_users.is_admin` 已存在。
- 单测：管理员可列用户/反馈；非管理员拒绝；PATCH 状态成功与非法状态失败。

## 前端实现要点

- 重构 `food-images.html`：左侧 shell + 三个 panel；系统配置 panel 内重排连接卡片位置。
- 共用现有 `api()` / token / baseUrl。
- 更新 `food-images.test.mjs`：断言标题「管理后台」、侧栏三模块、连接卡片位于操作流程之后、用户/反馈相关文案或选择器存在。

## 错误处理

- 未连接：侧栏可切，主区显示「请先连接后台」。
- 列表失败：toast + 保留上次成功数据（若有）。
- 状态更新失败：toast，不乐观覆盖。

## 验收标准（EARS）

- WHEN 打开 `/admin/food-images.html`，系统 SHALL 显示标题「管理后台」与左侧三模块。
- WHEN 进入系统配置，系统 SHALL 在「操作流程与状态说明」下方展示「连接设置与运行诊断」。
- WHEN 管理员已连接并打开用户数据，系统 SHALL 展示可搜索的只读用户列表。
- WHEN 管理员打开问题反馈，系统 SHALL 列出反馈，并允许将 status 更新为合法值。
- WHEN 非管理员调用新 admin API，系统 SHALL 拒绝。
- WHEN 使用现有食物图片批次/审核流程，系统 SHALL 保持与改版前等价行为。

## 测试计划

1. `node --test cloudbase/admin/food-images.test.mjs`
2. 新增 admin users/feedback 服务与路由测试（`node --test`）
3. 手工：连接 → 用户搜索 → 反馈改状态 → 系统配置生图/审核冒烟
4. 部署：`tcb fn deploy get-login-ticket` + hosting 部署 `food-images.html`

## 风险

- 单页 HTML 体积继续增大：可接受；若后续再增模块再考虑拆分。
- 用户量增大时全表 ILIKE：本版 limit/cursor 足够；必要时后续加索引或专用搜索。
