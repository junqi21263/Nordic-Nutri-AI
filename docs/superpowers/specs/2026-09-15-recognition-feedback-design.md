# P0-5：AI 识别纠错反馈设计

## 状态

方案已确认，等待实现计划审阅。

## 目标

降低用户因一次识别错误而失去对 AI 识别结果信任的概率。用户在识别结果页指出问题后，反馈流程必须尽量直接修正当前记录，而不是只提交一条意见。

## 范围

本次改动覆盖：

- Android-dev 分支中的 Taro Mini Program/H5 识别结果页。
- 识别结果页的纠错入口、原因 Bottom Sheet 和对应修正路径。
- 独立的 `recognition_feedback` PostgreSQL 表。
- 现有 CloudBase HTTPS 函数中的独立反馈 API。
- Android DEV APK 和 Mini Program/H5 的 focused tests、构建与真实链路验收。

本次不包含：

- 不修改 `/vision-analysis` 的上传、模型调用、流式响应、解析、状态更新或现有错误处理链路。
- 不重构现有识别结果保存、份量调整、食物目录或餐次提醒功能。
- 不新增第三方 UI 或动画依赖。
- 不新增后台管理页面；后台先通过独立表和 API 保留数据，后续如需要再单独设计查询视图。

## 现有链路保护原则

识别纠错是识别结果页上的旁路能力（sidecar）。进入识别结果页时不等待反馈相关请求；用户未操作反馈时，不产生任何额外请求。

现有链路保持不变：

1. 图片上传和视觉分析仍由当前逻辑负责。
2. 分析结果仍按当前 store、解析和展示逻辑进入结果页。
3. “保存本餐”仍使用当前的 `createProductMeal` 和后续同步逻辑。
4. 份量调整仍使用当前的 portion-adjustment 页面和保存逻辑。
5. 反馈创建、修正快照和反馈关联餐记录失败时，不得阻塞识别结果展示或当前餐记录保存。

任何反馈请求都必须独立捕获错误，只显示非阻塞提示或记录可诊断日志，不能改变视觉分析请求的完成状态。

## 用户流程

### 入口

识别结果页在识别可信度/结果摘要区域下方增加轻量文本入口：

> 识别不准确？ →

入口不改变现有结果卡片和主要保存按钮的层级。

### 第一层原因 Bottom Sheet

点击入口后使用项目现有 `BottomSheet` 组件打开：

标题：`哪里不准确？`

说明：`告诉我们问题，我们会帮你直接修正这次记录`

原因选项：

- 食物识别错了
- 少识别了食物
- 多识别了食物
- 份量不准确
- 营养数据看起来不对
- 其他

每个选项都可点击，使用现有页面的视觉 token、间距、圆角和交互反馈，不引入全新的弹窗体系。

### 选择原因后的行为

选择原因时立即创建反馈记录，获得 `feedbackId`。创建失败只提示“反馈暂时未保存，请稍后再试”，当前识别结果仍可正常操作。

随后按原因进入纠错：

| 原因 | 修正当前记录 |
| --- | --- |
| 食物识别错了 | 选择当前食物项后进入食物目录，替换为正确食物 |
| 少识别了食物 | 进入食物目录，选择食物并追加到当前结果 |
| 多识别了食物 | 在当前食物项列表中删除错误项 |
| 份量不准确 | 复用现有份量调整页 |
| 营养数据看起来不对 | 提供“调整份量”和“修改食材”入口；不直接编辑汇总四项营养值 |
| 其他 | 展示可选备注，允许只提交反馈而不强制修改 |

若当前分析尚未保存，纠错操作只更新本次识别结果的本地草稿；用户点击“保存本餐”后，再用真实 `mealId` 关联反馈。

## 纠错状态

使用最小的临时状态保存当前反馈上下文，不复制整套分析状态：

- `feedbackId`
- `analysisId`（可为空）
- `feedbackType`
- 当前原始结果快照
- 当前纠正结果快照（可为空）
- `mealId`（可为空）
- 当前待替换食物项 id（仅替换路径需要）

状态仅服务于一次识别结果页会话。离开结果流程或完成保存后清理，不能把上一餐的纠错上下文带到下一次识别。

食物目录通过已有 `food-selection-store` 返回选择结果；只增加识别纠错所需的 mode/context，不改变现有手动记餐的 `mode=select` 语义。

## 结果快照边界

`original_result` 和 `corrected_result` 只保存纠错所需的结构化最小快照，不保存原始图片、base64、认证信息或完整请求响应。

快照允许包含：

- 分析结果中的食物项 id（如有）、名称、数量、单位。
- 每项必要的营养字段和餐次类型。
- 份量调整使用的必要参数。
- 结果摘要中用于定位问题的有限字段。

后端对快照做白名单筛选、字符串长度限制、数组数量限制和整体 JSON 大小限制。客户端传入的快照只作为无 `analysisId` 时的降级信息；有 `analysisId` 时，服务端优先从归属校验通过的 `ai_analysis` 记录生成原始快照，并拒绝跨用户资源引用。

## PostgreSQL 数据模型

新增独立表 `public.recognition_feedback`，不复用现有 `user_feedback`：

| 字段 | 类型 | 约束/用途 |
| --- | --- | --- |
| `id` | `uuid` | 主键，服务端生成 |
| `user_id` | `uuid` | 必填，关联 `app_users(id)` |
| `meal_id` | `uuid` | 可空，关联 `meal_records(id)`；保存成功后补齐 |
| `analysis_id` | `uuid` | 可空，关联 `ai_analysis(id)` |
| `feedback_type` | `text` | 白名单：`wrong_food`、`missing_food`、`extra_food`、`portion_inaccurate`、`nutrition_data`、`other` |
| `original_result` | `jsonb` | 必填，过滤后的原始结果快照 |
| `corrected_result` | `jsonb` | 可空，过滤后的纠正快照 |
| `model` | `text` | 可空，来源模型名 |
| `model_version` | `text` | 可空，来源模型版本；没有可靠版本时保持为空 |
| `image_sha256` | `char(64)` | 可空，仅保存合法 hash，不保存图片内容 |
| `created_at` | `timestamptz` | 必填，默认当前时间 |
| `updated_at` | `timestamptz` | 必填，默认当前时间 |

表开启 RLS，并保持客户端不可直接访问；只允许现有服务端数据库访问层通过 HTTPS 函数写入和更新。外键删除策略不应让删除餐记录导致反馈数据丢失：`meal_id` 使用 `ON DELETE SET NULL`，`user_id` 使用项目现有用户删除策略。

迁移使用 `cloudbase/migrations/` 下的版本化 SQL 文件，先检查当前 Android-dev 对应环境的 schema，再执行迁移。不得直接修改生产环境。

## API 契约

API 复用现有 `get-login-ticket` HTTPS 函数的鉴权和路由入口，但使用独立 service/table。

### 创建反馈

`POST /recognition-feedback`

请求：

```json
{
  "analysisId": "uuid-or-null",
  "feedbackType": "wrong_food",
  "originalResult": {
    "mealType": "breakfast",
    "items": []
  },
  "note": "可选，其他原因使用"
}
```

响应：

```json
{
  "feedbackId": "uuid"
}
```

服务端行为：

- 校验登录用户、UUID、原因白名单和快照边界。
- `analysisId` 存在时校验该分析记录属于当前用户。
- 读取并保存模型、模型版本和 image SHA-256（若可用）。
- 新建记录时 `meal_id` 和 `corrected_result` 可以为空。

### 更新纠正结果和餐记录关联

`PATCH /recognition-feedback/:feedbackId`

请求：

```json
{
  "mealId": "uuid-or-null",
  "correctedResult": {
    "mealType": "breakfast",
    "items": []
  }
}
```

服务端行为：

- 只允许反馈所属用户更新。
- `mealId` 存在时校验餐记录属于当前用户。
- 更新 `corrected_result`、`meal_id` 和 `updated_at`。
- 不允许客户端修改 `user_id`、`analysis_id`、模型信息、hash 或创建时间。

反馈 API 的异常必须返回稳定的业务错误结构，前端只依赖成功/失败和 `feedbackId`，不依赖数据库错误文本。

## 服务端实现边界

建议新增独立的 `recognition-feedback-data-service.cjs`，负责：

- 白名单常量和快照规范化。
- 用户资源归属校验。
- `recognition_feedback` 的 insert/update。
- 从 `ai_analysis` 提取有限原始结果元数据。

现有视觉分析 service、解析函数和餐记录 service 不迁移、不重命名、不改变返回结构。路由分支只在现有路由解析之后新增识别反馈分支，避免触碰 `/vision-analysis` 的控制流。

## 前端实现边界

在 `analysis-result` 页只增加：

- 纠错入口和 Bottom Sheet 可见状态。
- 原因选择与反馈创建调用。
- 反馈上下文和修正结果回填。
- 修正完成后的非阻塞 PATCH。

对现有保存流程仅增加一个成功后的旁路同步点：当 `createProductMeal` 返回真实餐记录 id 后，若存在未关联的 `feedbackId`，尝试 PATCH `mealId` 和最新纠正快照。该 PATCH 失败不能回滚或阻止原餐记录保存。

份量调整、食物目录选择和删除操作应复用现有逻辑；如果某个现有页面无法携带识别纠错上下文，优先增加最小的 mode/context 参数，不复制页面。

## 错误处理

- 创建反馈失败：保留结果页，Toast 提示，不能阻塞保存。
- 食物目录加载失败：保留当前识别结果和当前草稿，可返回重试。
- 纠正草稿保存失败：保留本地草稿，不丢失用户当前选择。
- 关联真实 `mealId` 的 PATCH 失败：餐记录仍视为保存成功，只提示“纠错反馈稍后同步”。
- 非法或越权资源：服务端拒绝，前端不展示内部错误细节。
- 重复点击原因或保存：Bottom Sheet 防重复提交；更新操作必须避免把一次点击造成多次状态跳转。

## 测试与验收

### 静态/单元/契约测试

- 原因白名单和快照规范化测试。
- 超长文本、过多食物项、非法 UUID、非法字段和越权 `analysisId`/`mealId` 被拒绝。
- POST 创建立即返回 `feedbackId`，允许 `meal_id`/`corrected_result` 为空。
- PATCH 只允许同用户更新，并正确补齐 `mealId` 与 `correctedResult`。
- 识别结果页入口和 Bottom Sheet 只出现一层，原因映射到正确修正路径。
- 替换、追加、删除、份量调整和“其他”路径的上下文回填。
- feedback API 失败不影响现有识别结果展示和餐记录保存测试。
- 后端服务与现有 `user_feedback`、视觉分析和餐记录接口隔离测试。

### 构建验收

- Mini Program/H5 focused tests 通过。
- Android DEV debug APK 构建通过。
- 不改变现有视觉分析相关测试、API 契约和上传/流式链路测试结果。

### 真实验收

在 Android DEV APK 和 Mini Program/H5 各验证一次：

1. 完成一次识别并进入结果页。
2. 点击“识别不准确？”，选择每类原因至少一条代表路径。
3. 确认选择原因后反馈记录立即可写入。
4. 完成修正并保存本餐。
5. 确认反馈行最终具有正确的用户、分析、餐记录和纠正快照关联。
6. 断开或模拟反馈 API 失败，确认结果展示和餐记录保存仍正常。

CloudBase 表行核验、APK 安装、真实设备交互和视觉验收分别报告，不互相替代；未实际验证的项目必须标记为 `NOT VERIFIED`。

## 隐私与运维

- 不存储图片二进制、base64、token、密码或不必要的完整模型响应。
- JSON 快照只保存纠错所需字段，并设置大小上限。
- 服务端日志只记录稳定错误码、反馈 id 和 trace id，不打印原始快照。
- 迁移和 API 部署必须明确 DEV EnvId；未获得显式部署授权前只做本地代码和测试。

