# Dev Text Insight Worker Design

## Goal

让食物详情页的营养洞察使用 `dev-d8g3hqv2b0de38046` 小程序成长计划的免费文本 Token，而不迁移主环境的用户、食物数据或登录体系。

## Decision

采用双环境受签名调用：主环境继续处理小程序 Bearer 会话、查询食物事实和规则回退；dev 环境复用已上线的 `hunyuan-image-worker` HTTP 函数，在不改变既有 `/generate` 生图路由的前提下增加 `/nutrition-insight` 路由，并以 `hunyuan-exp` 生成文本。该路由复用已有的服务端 HMAC 签名机制；小程序不直接访问 dev，也不持有共享密钥。

不采用直接让小程序调用 dev：现有会话仅由主环境验证，且任何前端共享密钥都会公开。也不迁移整个业务后端：dev 没有主环境的业务数据与身份配置，迁移会扩大范围。

## Contract

- 主环境到 dev：`POST /nutrition-insight`，JSON 为 `{ foodContext }`。
- 鉴权头：`x-nordic-worker-timestamp` 与 `x-nordic-worker-signature`；签名为 `HMAC-SHA256(timestamp + "." + rawBody)`。
- dev 成功返回 `{ headline, content, source: "hunyuan-exp", model }`；无效签名为 `401`，无效请求为 `400`，模型错误为 `503`。
- 主环境在 dev 超时、非 200 或返回格式不合法时继续返回本地事实规则洞察，不让请求失败泄漏到用户界面。

## Acceptance

1. dev 的 `hunyuan-exp` 文本调用产生 `module:llm` 日志并消耗 dev 赠送 Token。
2. 主环境的食物详情 API 仍需要现有用户会话，且不会把 Token 或共享密钥传给客户端。
3. 请求或模型失败时食物详情仍展示事实规则回退。
