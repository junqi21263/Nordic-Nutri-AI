# 视觉识别性能与模型验收

本轮只改后端与验收工具，不发布 APK 或小程序。后台页面尚未新增统计面板；下面的聚合接口已接入后台会话鉴权，普通 App 会话不可访问。

## 性能统计

`GET /api/admin/vision-performance?hours=24`（1–168 小时）

- `requests.submit` / `requests.poll`：提交和状态读取分别统计 P50/P95、请求数和 HTTP 错误数，202 不计作识别成功。
- `queueAndWorkerStartup`：已返回 202 至第一次 Worker 开始的时间，含调度和 Worker 启动；不是单纯消息队列时间。
- `tasks`：只统计异步任务；最终成功率 = completed/(completed+failed+timed_out)，pending 和 cancelled 单列。任务创建至完成不含客户端预处理或最后一次轮询等待。
- `models`：按 provider/model 统计已记录调用的耗时和成功率；失败任务若未持久化 attempts，不纳入该模型分母，因此不能把此值当成完整供应商可用率。
- `tasks.fallbackRate`：仅已完成且明确记录 fallbackUsed 的任务；返回 fallbackObserved 分母，缺字段不当 false。
- `stages`：API 上传等阶段、Worker 模型调用/营养补全/评价/持久化/最终提交。仅使用明确记录的成功阶段时长，缺失历史字段不补 0。
- 包含测试流量。每个数据源上限 10000 行，任一源达到上限保守标记 coverage.complete=false，statistics=null，避免截断后宣称精确全量。

该接口返回聚合值，不返回用户、原图或凭证。

## 模型能力配置

现有 ai-model-configs 管理 API 中写入以下 metadata；旧配置无需补填，当前 DeepSeek 与 Qwen 保留原行为。配置存储、主备选择、凭证引用及配额仍复用现有实现。

```json
{
  "protocol": "openai-chat-completions",
  "timeoutMs": 18000,
  "maxTokens": 4096,
  "metadata": {
    "vision": {
      "imageInput": "auto",
      "thinkingMode": "unsupported",
      "supportsReasoningEffort": false,
      "reasoningEffort": "low",
      "jsonMode": false,
      "supportsTemperature": true,
      "maxTokensField": "max_tokens",
      "imageDetail": null
    }
  }
}
```

- imageInput：auto / url / inline。inline-only 在异步路径由后端读取已上传图片并内联，最大 4MiB，读取超时和模型调用共用总预算；无须客户端传两份图片。
- thinkingMode：enabled / disabled / unsupported；unsupported 不发送 thinking 参数。
- supportsReasoningEffort=true 才发送 reasoning_effort，级别 low / medium / high。
- jsonMode=true 才发送 response_format=json_object，须供应商实际支持。
- supportsTemperature=false 不发送 temperature；maxTokensField 可用 max_tokens / max_completion_tokens / max_new_tokens，按协议声明选择。
- imageDetail：null / auto / low / high。
- timeoutMs 始终受现有任务/租约/单次调用预算约束，配置更大值不能突破它们。
- 当前支持 OpenAI Chat Completions 兼容协议和已有 SenseNova 专用协议（provider=sensenova）。其他原生协议明确报 VISION_PROTOCOL_UNSUPPORTED；需在 vision-model-adapter.cjs 接入专用请求与响应转换，并经过同一结果校验。不是任意供应商填名字就自动兼容。
- 本次未给系统配置页面新增表单控件，可通过现有管理 API 配置 metadata；后续可在后台补可视化编辑。

## 固定餐图集

`samples.json` 包含 5 张真实照片的来源、许可、SHA256、人工可见食物组、明显排除项和复核说明。私有照片不提交 Git，位于 `.local/vision-benchmark/`；原始照片没有营养称重真值。公共照片来源分别为 Wikimedia Commons 的 Cooked Rice（Ananth Pattabiraman，CC BY-SA 4.0）、Bento 001（Ocdp，CC0）、Shabushabu001（Leonardo Sakaki，CC BY-SA 3.0），详情及下载地址见 manifest。不将这些图片并入产品素材。便当使用 1280px 缩略图，其余保留原始下载字节。

```sh
# 无网络调用，验证所有样本哈希
node scripts/vision/benchmark.mjs
# 正常登录取得专用测试会话，通过环境变量注入，勿写在命令行或提交凭证
node --env-file=scripts/api-integrity/.env scripts/vision/benchmark.mjs --run --target dev
# 明确生产目标；仅执行识别，不保存餐次，会产生识别任务和模型调用
node --env-file=scripts/api-integrity/.env scripts/vision/benchmark.mjs --run --target prod
```

结果写入被忽略的本地目录，包含文件哈希、请求 ID、任务 ID、提交耗时、端到端耗时、模型、尝试记录和结构/食物组检查。自动通过不等于准确率：中英文别名、合并菜名会影响匹配，必须查看漏识别和误识别候选，人工签收数量、份量和不确定食材；`humanReview=pending` 不会自动改为通过。两张用户私有图需保留本机副本，公共图重下载后也必须匹配已锁定哈希。

更换模型的验收顺序：配置能力 → 连通与结构检查 → 同一套固定餐图 → 比较速度与漏识别/误识别 → 人工复核 → 才切主模型。既有自动回归覆盖主备切换，但不能替代新供应商真实调用。
