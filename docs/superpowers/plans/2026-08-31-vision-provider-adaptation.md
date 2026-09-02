# 多厂商视觉模型适配方案

## 目标

在不破坏现有小程序 `POST /vision-analysis` 拍照/上传分析链路的前提下，将视觉模型调用从当前的 DeepSeek/Qwen 特殊判断改造成可扩展的厂商适配层。DeepSeek 在 DEV 中继续作为当前首选，Qwen 作为数据库路由配置的兜底；后续新增厂商只需实现适配器并登记能力，不再修改业务流程或写新的厂商分支。

## 当前问题与范围

- `cloudbase/functions/get-login-ticket/vision-provider-router.cjs` 当前只在 DeepSeek 失败时寻找 Qwen，第三方厂商无法按配置加入候选链。
- `qwen-vision-service.cjs` 同时承担通用 OpenAI-compatible 请求、Qwen/DeepSeek 请求差异和营养结果校验，职责边界不清。
- 数据库配置已有 `provider_key`、`model_key`、`feature_keys`、`metadata.routeRoles`，但路由没有统一读取模型能力、优先级、传输方式和错误策略。
- 失败日志需要明确记录每次尝试的实际 provider/model、阶段、耗时、错误分类和是否发生降级，不能只显示固定的外层 provider。

本阶段只改 DEV 代码和 DEV 部署验证，不触碰生产环境；不启用尚未完成验收的异步视觉基础设施，也不把后台 UI 重做混入本次后端适配范围。

## 需求与验收标准

### 功能需求

1. 路由从 `ai_model_configs` 动态生成视觉候选链：启用、绑定 `vision`、适配器已注册、模型配置有效的候选才可参与；`primary` 优先，其次按 `metadata.vision.priority` 或明确的稳定排序。
2. 候选链不依赖厂商名称。DeepSeek、Qwen、VITA、OpenAI-compatible 以及未来厂商都通过注册表加入；未注册的配置必须返回可诊断的未配置错误。
3. 每个适配器声明并执行自己的图片传输方式、MIME 限制、模型/endpoint 规则、请求体、响应解析和错误分类。业务层只接收统一的视觉结果或统一错误。
4. 仅对可重试错误执行下一个候选：超时、网络中断、临时不可用、限流；认证失败、参数错误、媒体不支持、结果校验失败、非食物不得盲目切换。
5. DeepSeek 仍保持当前优先级；Qwen 仍可作为 fallback，但优先级必须来自模型配置，而不是代码中的 `selectedProvider === "deepseek"` 判断。
6. 保持现有客户端请求 schema、图片预处理、上传、营养补全、结果持久化、额度提交和错误业务码兼容。
7. 可观测数据必须显示真实的最后成功厂商和模型，并保留尝试链摘要；不得记录 API key、原始图片或完整 provider 响应。

### 非功能需求

- 新增适配器不能要求修改视觉业务服务。
- 单个厂商协议差异必须隔离在适配器内。
- 路由和适配器单元测试覆盖无配置、单厂商成功、多候选降级、不可重试错误、全部失败和真实 provider/model 元数据。
- 所有 CloudBase 操作明确绑定 DEV `test-dev-d4gyxnn0b5dfa2c8a`；本阶段不执行生产写入。

### 验收场景

- DeepSeek 成功：只调用 DeepSeek，结果中的 provider/model 和 trace 一致。
- DeepSeek 超时、Qwen 可用：按配置切到 Qwen，trace 显示两次尝试及降级原因。
- 新增一个测试厂商适配器：只增加注册项和配置即可参与路由，无需修改路由器条件分支。
- 首选厂商认证失败或请求参数错误：不错误切换到另一家，返回原始业务可理解错误并记录分类。
- 所有候选失败：返回现有 `VISION_SERVICE_UNAVAILABLE` 或 `VISION_TIMEOUT` 语义，不破坏小程序页面处理。
- 视觉成功但持久化/额度阶段失败：阶段错误仍准确显示为 persistence/quota，不伪装为 provider 失败。

## 设计

### 1. 统一适配器契约

新增 `vision-adapter-contract.cjs`，定义适配器创建结果和调用接口：

```js
{
  providerKey,
  modelKey,
  capabilities: {
    imageTransports: ["inline_data_url", "https_url", "object_ref"],
    mimeTypes: ["image/jpeg", "image/png"],
    maxImageBytes
  },
  analyze({ imageUrl, imageDataUrl, contentType, budget, observe })
}
```

适配器返回统一的 `content/usage/provider/model/diagnostics`，由共享结果规范化器完成营养 JSON 校验；适配器只负责其协议和响应差异。错误统一为 `VISION_PROVIDER_TIMEOUT`、`VISION_PROVIDER_NETWORK`、`VISION_PROVIDER_AUTH`、`VISION_PROVIDER_RATE_LIMIT`、`VISION_PROVIDER_BAD_REQUEST`、`VISION_PROVIDER_MEDIA_UNSUPPORTED`、`VISION_PROVIDER_INVALID_RESPONSE`、`VISION_PROVIDER_UNAVAILABLE` 等类别，并保留现有对外业务码映射。

### 2. 注册表与候选链

新增 `vision-adapter-registry.cjs`，注册 `providerKey -> factory/adapter`。注册表负责：

- 判断配置的厂商是否有适配器；
- 根据配置声明的模型能力选择可用传输方式；
- 生成脱敏的候选描述；
- 不在代码中判断 DeepSeek、Qwen 等具体名称。

重构 `vision-provider-router.cjs`：先读取所有符合 `vision` 绑定的启用模型，解析 `metadata.routeRoles.vision`、`metadata.vision.priority`、`metadata.vision.fallbackGroup` 和能力字段，生成有序候选链；逐个调用适配器，只按统一错误策略决定是否继续。路由结果附带 `attempts`、`selectedProvider`、`selectedModel` 和 `fallbackUsed`，供上层 trace 使用。

排序规则固定为：明确 `primary` 优先；同角色按 priority 降序；再按配置更新时间和 provider/model 稳定排序。`fallbackGroup` 用于限制只在同一视觉方案组内降级，避免将不兼容的模型混入食物识别链路。

### 3. 协议适配

- 将当前 `qwen-vision-service.cjs` 中通用请求完成部分抽到 `openai-compatible-vision-adapter.cjs`，支持 inline data URL、HTTPS 临时 URL、模型和 endpoint 的配置注入。
- DeepSeek 和 Qwen 保留薄封装，只提供各自默认值、图片传输偏好和响应细节；不再由路由器识别厂商。
- 后续厂商若使用 multipart、专用图片引用或不同响应结构，只实现新的适配器，不改变营养分析业务服务。

### 4. 观测与错误传播

在视觉阶段观测中加入 `attempts[]`：每项只包含 provider、model、stage、durationMs、分类后的 errorCode、httpStatus、requestIdHash。外层 `provider/model` 取最终成功候选；全失败时取最后一次实际尝试，而不是初始化时的默认值。API key、图片 data URL、完整请求/响应正文均禁止进入日志。

### 5. 配置兼容

继续兼容现有字段 `feature_keys`、`metadata.routeRoles` 和 `metadata.route_roles`。新字段全部放入 `metadata.vision`，例如：

```json
{
  "vision": {
    "priority": 100,
    "fallbackGroup": "food-recognition",
    "imageTransports": ["inline_data_url"],
    "capabilities": ["food-recognition"]
  }
}
```

旧配置没有这些字段时使用安全默认值；不要求迁移现有配置才能运行。

## 实施任务

1. 为契约、错误分类、候选排序和注册表增加失败优先的单元测试。
2. 实现契约与注册表，先把 DeepSeek/Qwen 接入，保证调用参数和现有图片传输策略不变。
3. 重构通用 OpenAI-compatible 请求适配，保留 DeepSeek inline data URL 与 Qwen HTTPS 图片策略。
4. 重构视觉路由为动态候选链，删除 DeepSeek→Qwen 的硬编码分支。
5. 将尝试链和最终 provider/model 接入现有 trace、失败诊断和 `vision-data-service`，保持当前业务码兼容。
6. 增加一个仅用于测试的第三厂商适配器，证明新增厂商无需修改路由器条件分支；测试完成后不加入生产配置。
7. 运行后端视觉测试、函数打包检查和小程序现有 typecheck/build/verify；先部署 DEV 函数，再用新 trace 验证 DeepSeek 成功/超时降级/全失败三条路径。
8. 只有 DEV 验收通过后，另行评估后台模型目录 UI 是否需要展示能力、优先级、主备链和实际模型名；本方案不自动修改生产配置或生产代码。

## 风险与边界

- 当前 DEV 中 DeepSeek 仍可能因上游响应时间超过预算而超时；适配层只能正确分类和降级，不能保证上游延迟本身消失。
- 如果配置中只有一个 DeepSeek 模型，动态路由不会凭空创建备用厂商；需要后台配置已启用且有 API key 的候选。
- 现有异步视觉基础设施不作为本次超时修复的隐式依赖，避免把未验收的数据库状态机引入线上链路。
- 代码测试通过不等于真实设备、真实上游和生产验收通过；这些证据必须单独记录。
