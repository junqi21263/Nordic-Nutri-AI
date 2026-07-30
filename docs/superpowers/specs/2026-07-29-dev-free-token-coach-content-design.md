# Dev Free Token Coach Content Design

## Goal

将首页 NOVA AI 洞察、教练页今日营养建议和教练页随机快捷问题，从主环境 CloudBase `hy3` 或 DeepSeek API 迁移至 dev 环境的赠送文本 Token。

## Decision

复用 dev 的 `hunyuan-image-worker`，新增三个固定用途且受现有 HMAC 保护的路由：`/daily-insight`、`/daily-tip` 与 `/coach-quick-prompt`。三者均调用 `ai.createModel("hunyuan-exp").generateText({ model: "hunyuan-2.0-instruct-20251111" })`。

主环境仍负责构建用户营养上下文、验证小程序会话及调用 dev；小程序不直接接触 dev 地址或共享密钥。任何 dev 请求超时、状态码异常或响应不符合既有校验规则时，三个页面继续展示原有规则回退结果。

## Out of scope

- 不迁移教练对话、营养计划、餐食估算、照片识别、餐食评价或食品搜索翻译。
- 不变更小程序前端接口、数据库结构、主函数或 dev 函数的密钥配置。

## Acceptance

1. 三个主环境服务均通过签名客户端调用 dev 固定路由，返回 `source: "hunyuan-exp"` 与实际模型名。
2. 服务失败时分别保留现有 `rule_v3` 或 `rule_v2` 回退。
3. dev 调用只接受有效 HMAC 签名，且请求和模型输出按既有字段长度及安全规则校验。
