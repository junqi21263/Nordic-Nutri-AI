# DeepSeek 餐食数据链路设计

## 目标

将现有小程序的本地餐食流程接入 CloudBase PostgreSQL，并通过 DeepSeek 为已确认的餐食输入生成受限的营养分析。页面视觉与现有扫码、手动录入、详情和份量调整交互保持不变。

## 安全边界

- DeepSeek 密钥只存在 CloudBase 云函数环境变量 `DEEPSEEK_API_KEY`，不进入小程序构建产物、源码、日志、测试或版本库。
- 小程序只调用已有产品 session 保护的 HTTPS 接口；服务端从 session 解析用户 ID，忽略任何客户端传入的用户 ID。
- 已在聊天中暴露的密钥不得使用；部署前由用户在 DeepSeek 控制台撤销并在 CloudBase 控制台配置新密钥。
- 模型输出仅为营养估算与饮食文案，不得提供疾病诊断、治疗方案或替代专业医疗建议。

## 接口

在现有 `get-login-ticket` HTTP 云函数中添加受产品 session 保护的接口：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/meals?date=YYYY-MM-DD` | 返回当前用户当天未删除餐食及项目 |
| `POST` | `/meal-analysis` | 以已确认的食材与份量调用 DeepSeek，返回并保存结构化分析 |
| `POST` | `/meals` | 创建餐食和项目，可关联已保存分析 |
| `PATCH` | `/meals/:id` | 更新餐食元数据或食材确认份量 |
| `DELETE` | `/meals/:id` | 设置 `deleted_at` 软删除当前用户餐食 |

## 数据处理

1. 客户端提交食材名称、确认份量、餐次、记录时间和幂等 `clientRequestId`。
2. 云函数校验输入范围，调用 DeepSeek Chat Completions，并要求 JSON 响应。
3. 云函数验证模型 JSON 的名称、份量和宏量数值范围，写入 `ai_analysis`。
4. 创建 `meal_records` 与 `meal_items`；数据库现有触发器重新计算餐食总热量及宏量。
5. 读取接口将 PostgreSQL 行映射回既有 `Meal` 页面模型；页面成功写入后刷新本地 store。

## DeepSeek 调用

- 使用官方 `POST https://api.deepseek.com/chat/completions`。
- 使用 `Authorization: Bearer ${process.env.DEEPSEEK_API_KEY}`，请求日志不得记录该请求头或完整提示词。
- 模型名通过 `DEEPSEEK_MODEL` 环境变量读取，默认由部署配置明确指定。
- 超时、限流或非结构化响应统一返回可重试错误；客户端保留当前草稿，不自动保存不可信模型输出。

## 测试与验收

1. 云函数测试：无有效 session 不可读写；跨用户不能读取、更新或删除；模型失败不创建餐食。
2. 云函数测试：合法模型 JSON 才能写分析、餐食和项目；数值范围违规被拒绝。
3. 小程序测试：手动录入、扫描确认、份量调整、删除后刷新真实列表。
4. 回归：全部单测、类型检查、微信构建、WXSS 检查通过；云函数发布后用真实环境变量完成一次非敏感餐食验收。
