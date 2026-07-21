# Nordic Nutri AI 全接口接入设计

## 目标

在不改变现有页面布局、样式和主要交互顺序的前提下，把仍依赖本地 fixture、Zustand 临时状态或静态文案的核心产品能力迁移到 CloudBase HTTPS 函数与 PostgreSQL。小程序不直接访问 PostgreSQL，不携带用户 ID；服务端只信任 HMAC 产品 session 中的用户身份。

## 范围

本轮完成以下接口边界：

1. 账户：读取资料、当前身体档案、当前目标、饮食设置和当前营养计划；更新资料、设置、身体档案、目标和计划。
2. 餐食：分析、创建、按日期或范围读取、编辑、收藏、软删除和详情读取。
3. 汇总：按日返回目标、摄入、剩余量、完成度和餐食；按周返回 7 天节奏、总餐次、平均完成度与建议。
4. 成就：根据服务端餐食历史计算稳定记录、蛋白达标和餐次累计成就，不新增可伪造的客户端成就写入。
5. AI 教练：保存会话与消息；服务端基于当前计划和当天餐食构建最小上下文，调用 DeepSeek；失败时返回规则化安全建议。
6. 扫描：保留当前 `扫描 -> 分析 -> 份量调整 -> 保存` 页面结构。图片识别独立为可选视觉适配器；没有配置视觉服务时返回明确的 `VISION_SERVICE_NOT_CONFIGURED`，不影响其余接口。
7. 反馈：提交文字反馈到服务端表；隐私和关于页面仍是静态产品说明。

## 接口

所有路径挂载在现有 `/get-login-ticket` HTTP 函数下，除登录外都要求 `Authorization: Bearer <product-session>`。

- `GET /account`
- `PATCH /settings`
- `GET /nutrition-plan`
- `PATCH /nutrition-plan`
- `GET /meals?date=YYYY-MM-DD`
- `GET /meals?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /meals/:id`
- `POST /meal-analysis`
- `POST /meals`
- `PATCH /meals/:id`
- `DELETE /meals/:id`
- `GET /meal-summary?date=YYYY-MM-DD`
- `GET /weekly-review?end=YYYY-MM-DD`
- `GET /achievements?date=YYYY-MM-DD`
- `GET /coach/messages?limit=50`
- `POST /coach-answer`
- `POST /feedback`
- `POST /food-image-analysis`

## 服务端分层

- `product-data-service.cjs`：账户、设置与营养计划。
- `meal-data-service.cjs`：餐食和分析记录。
- `insight-data-service.cjs`：日汇总、周报和成就，全部由权威餐食行计算。
- `coach-service.cjs`：消息存储、上下文裁剪、DeepSeek 调用和安全降级。
- `vision-service.cjs`：仅负责校验图片输入并调用已配置视觉提供方；不复用 DeepSeek 文本接口伪装图片识别。
- `feedback-service.cjs`：限制长度后写入本人反馈。

## 数据模型

新增或补齐：

- `coach_conversations`、`coach_messages`：每个用户默认一个活跃会话，消息保存角色、内容、状态和时间。
- `user_feedback`：用户、正文、来源页面、创建时间。
- `ai_analysis`：保留视觉/文本分析提供方、模型、状态和规范化结果；不保存密钥、图片 base64 或完整提示词。

汇总、周报和成就不创建冗余表，以餐食记录和当前营养计划实时计算，避免客户端与数据库出现两份权威数据。

## 小程序数据流

页面只调用 `src/api/` 中的类型化客户端。API 成功后再 hydrate 对应 Store；失败时显示现有反馈组件。正式登录用户不再把 fixture 当成成功结果，fixture 仅保留给测试和无登录视觉预览。

首页、记录页、周报和成就页从服务端读取；教练发送消息后以服务端返回的已保存消息更新 UI；教练建议加餐复用餐食创建接口。个人中心文案同步改为云端保存事实，不再声称“仅保存在当前设备”。

## 安全与错误

- 用户身份只来自已验证 session，服务端忽略请求体中的 `userId`。
- DeepSeek、视觉服务和 CloudBase API Key 只存在函数环境变量。
- AI 输入、反馈和图片均有大小限制；日志不记录密钥、OpenID、完整提示词、反馈正文或图片。
- 每次写操作都按用户 ID 过滤；餐食创建继续使用 `clientRequestId` 幂等。
- AI 上游超时或异常映射为稳定公开错误码，数据库内部错误不直接返回。

## 验证

每项先写失败测试再实现。完成后运行云函数单元测试、小程序单元测试、TypeScript 检查、微信构建、WXSS 验证、schema 验证和 `git diff --check`。部署前单独确认函数变量、公共访问规则和 30 秒超时；真实微信登录、AI 调用和图片识别必须在微信开发者工具中验收，静态构建不能替代。

## 已知外部前置条件

DeepSeek 文本接口已经配置。真实图片识别不能使用 DeepSeek 文本接口；视觉适配器部署前还需要启用一个支持图片输入的服务并配置独立凭证。未满足时，本轮仍发布其余接口，图片端点保持显式不可用而不是返回 fixture 结果。
