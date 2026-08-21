# 二期 P0：AI Provider 与模型配置中心技术设计

## 1. 设计原则

- 配置与调用解耦：业务 service 不再直接读取某个 Provider 的 Key 或模型名。
- 运行时可切换：发布配置后新请求读取新版本，不依赖重新部署函数。
- 密钥最小暴露：业务数据库保存引用和元数据，完整 Key 只在受控密钥存储中使用。
- 测试先行：先在 `test-dev-d4gyxnn0b5dfa2c8a` 建表、部署和验收，再准备生产迁移。
- 失败可回退：保留上一版本，Provider 失败时按显式备用路由处理。

## 2. 架构

```text
业务功能
  ↓ feature key
AI Router
  ↓ 当前已发布 route revision
Provider Adapter
  ↓ secretRef + model + request options
DeepSeek / Qwen / SenseNova
```

现有 `DEEPSEEK_API_KEY`、`QWEN_API_KEY` 等环境变量保留为迁移期 fallback，等所有调用点切换到 Router 后再移除。运行时配置优先级：

```text
已发布数据库配置 > 迁移期环境变量 fallback > 明确失败
```

配置缓存使用短 TTL，并以 `revision` 做失效标记。后台发布成功后主动刷新测试环境缓存；不允许前端直接修改函数内存。

## 3. 数据模型

### `ai_provider_accounts`

- `id` UUID 主键
- `provider`：`deepseek` / `qwen` / `sensenova`
- `display_name`
- `base_url`
- `secret_ref`：外部密钥引用，不是完整 Key
- `key_last4`
- `status`：`active` / `disabled`
- `last_tested_at`
- `last_test_status`
- `created_at` / `updated_at`

### `ai_model_configs`

- `id` UUID 主键
- `account_id` 外键
- `model_id`
- `timeout_ms`
- `max_tokens`
- `temperature`
- `status`
- `created_at` / `updated_at`

### `ai_feature_routes`

- `feature_key`
- `primary_config_id`
- `fallback_config_id` 可空
- `published_revision`
- `updated_at`

### `ai_config_revisions`

- `revision` 唯一版本号
- `snapshot` JSONB 配置快照，不包含完整 Key
- `published_by`
- `publish_reason`
- `created_at`

### `ai_config_audit_logs`

- `action`：create / update / test / publish / rollback / disable
- `feature_key` 可空
- `provider_account_id` 可空
- `from_revision` / `to_revision`
- `result`
- `error_code` 脱敏错误码
- `actor_user_id`
- `created_at`

## 4. 密钥方案

优先使用可由云函数运行时读取的密钥管理服务，`secret_ref` 指向密钥；数据库只保存引用、末四位和状态。若测试环境暂时没有可用密钥管理服务，允许使用“加密后的密钥值 + 云函数启动密钥”作为过渡方案，但必须：

- 加密值不返回前端。
- 启动密钥只存在函数环境变量。
- 日志、错误和审计中不得输出解密值。
- 该过渡方案必须在后续任务中迁移到正式密钥存储。

## 5. API 边界

后台管理 API：

```text
GET    /api/admin/ai/providers
POST   /api/admin/ai/providers
PATCH  /api/admin/ai/providers/:id
POST   /api/admin/ai/providers/:id/test
GET    /api/admin/ai/routes
PUT    /api/admin/ai/routes/:feature
POST   /api/admin/ai/config/publish
POST   /api/admin/ai/config/rollback
GET    /api/admin/ai/audit-logs
```

运行时内部接口：

```text
resolveAiRoute(featureKey)
callProvider(config, input)
```

运行时接口只返回可执行配置，不向前端暴露 `secretRef` 或完整密钥。

## 6. Provider Adapter 合同

每个 Adapter 统一实现：

```text
validateConfig(config)
testConnection(config)
generateText(config, request)
analyzeImage(config, request)
normalizeError(error)
```

模型 ID 由后台配置传入，不在 Adapter 中写死。Provider 不支持某能力时，应返回明确的 `AI_CAPABILITY_UNSUPPORTED`，不得静默调用错误模型。

## 7. 后台页面设计

沿用现有 Admin Console 的 Nordic Nutri 视觉系统和 DEV 标识，不新建独立后台。

页面分为三个工作区：

1. Provider 账号：账号列表、Key 末四位、状态、测试连接、停用。
2. 模型路由：按功能展示主模型、备用模型、参数和当前发布版本。
3. 变更记录：发布、回滚、测试连接结果和错误码。

所有高风险操作使用确认对话框；完整 Key 只在新增/替换时输入一次，保存后不可再次查看。

## 8. 发布与并发控制

- 以 `revision` 作为配置版本。
- 发布使用数据库事务，避免只更新主模型而未更新备用模型。
- 发布时校验 Provider active、Key 可读取、模型 ID 非空。
- 回滚只允许恢复最近一个有效版本。
- 同一时间只允许一个配置发布操作；使用版本号或数据库锁避免覆盖。

## 9. 测试策略

- Repository：配置 CRUD、唯一约束、版本快照不含密钥。
- Router：主模型、备用模型、无配置和 Provider 禁用路径。
- Adapter：请求地址、Bearer Header、模型字段、参数映射和错误标准化。
- Admin API：登录校验、Key 脱敏、发布、回滚、审计。
- 集成验证：在测试环境从后台切换 DeepSeek/Qwen/SenseNova，调用真实低风险请求。
- 安全检查：扫描前端 bundle、日志和响应，确认无完整 Key。

## 10. 生产发布边界

本功能在测试环境完成全部验收前，不允许迁移生产表、不允许写生产 Provider Key、不允许修改生产函数环境变量。生产发布必须使用测试环境已验证的同一 Git 提交号，并单独执行迁移和 Smoke Test。

