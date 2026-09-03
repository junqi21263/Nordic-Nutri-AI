# 二期 P0：AI 管理后台 MVP 设计增补

状态：原型已确认，进入实现计划阶段

目标环境：`test-dev-d4gyxnn0b5dfa2c8a`

生产环境：`lewis-healthy-d4glgqqzv73a5bc10`，本阶段不触碰

## 1. 目标与边界

在现有管理后台“额度管理”页面内增加 AI 模型路由管理能力，不重做后台整体布局，不新增独立 Provider 配置中心。

本期只解决：

- 查看当前功能对应的主模型和备用模型
- 测试主模型或备用模型
- 保存路由并立即生效，无需重新部署云函数
- 查看项目自身调用量和模型用途
- 查看切换记录并回滚上一版本
- 明确 DEV 环境和官方额度不可自动获取状态

不包含：

- API Key 的录入、回显或数据库存储
- Provider 账号表、模型账号管理中心
- Draft/Publish/审批/RBAC/实时推送
- 生产数据库、生产函数、生产 Hosting 变更

## 2. 页面结构

沿用当前后台结构：顶部栏、左侧导航、额度统计卡片、模型用量卡片和“模型限额配置”表格均保留。

仅在现有“额度管理”工作区内增加三个 Tab：

1. `模型路由`
2. `模型额度`
3. `切换记录`

顶部必须显示 `DEV 测试环境`，并且不能只依赖 URL 或浏览器标题识别环境。

## 3. 模型路由交互

表格列：

- 功能
- 提供商
- 主模型
- 备用模型
- 限额
- revision
- 状态
- 操作

功能使用现有业务名称，并映射到固定 `featureKey`：

- 食物识别 → `vision-analysis`
- 营养分析/营养教练 → `nutrition-insight` 或 `coach`，以现有业务调用点为准
- 其余已有功能只在已有路由或统计数据能够确认时展示

编辑交互：

```text
点击编辑
  → 展开当前行编辑区
  → 选择主模型
  → 可选选择备用模型
  → 分别测试主模型/备用模型
  → 保存
```

规则：

- 保存即生效，不设置 Publish
- 保存期间禁用当前行保存按钮
- 保存成功后更新 revision，并重新获取 routes 与 quota-overview
- 保存失败保留原生效路由和原表格内容
- 测试失败不阻止保存
- 主模型和备用模型必须分别显示测试状态
- 备用模型为空是合法状态
- 主模型发生可回退错误时才尝试备用模型
- 正在执行的请求继续使用请求开始时解析出的路由

## 4. Provider 展示

Provider 信息从目标 DEV 云函数的 `AI_PROVIDER_CONFIG_JSON` 和环境变量推导，不建立 Provider 数据库表。

页面只展示：

- providerKey
- 配置状态
- API Key：`PRESENT` / `MISSING`
- 可用模型目录
- Endpoint 是否已配置
- 测试结果

禁止返回或展示：

- 完整 API Key
- Secret 原文
- 生产 API 地址
- 生产环境变量内容

Provider 不是固定厂商白名单，前端应按后端返回的 `providerKey -> model` 目录渲染。

## 5. 模型额度交互

额度页只展示两类数据：

### 项目自身用量

来自现有 Trace/Ops：

- 请求数
- 输入 Token
- 输出 Token
- 总 Token
- 成功率
- 失败数
- fallback 次数
- 平均耗时
- P95 耗时
- 当前功能用途

### Provider 官方额度

只有完成可靠的 Provider 官方额度接口后才展示数值；否则固定显示：

> 官方额度：暂不支持自动获取

不得把项目请求数或 Token 显示为 Provider 剩余额度。

当前功能用途从 `ai_feature_routes` 推导，并标记：

- `功能 · 主模型`
- `功能 · 备用模型`

额度页不维护第二套功能与模型绑定关系。

## 6. 切换记录与回滚

复用 `admin_audit_logs`，记录：

- 操作者
- 时间
- featureKey
- 修改前主/备模型
- 修改后主/备模型
- revision
- 操作类型：保存、测试、回滚
- 回滚原因（如有）

回滚交互：

```text
点击“回滚上一版本”
  → 显示前后路由和影响范围
  → 确认
  → 恢复上一套有效路由
  → 立即生效
  → 刷新路由和额度
  → 写入审计记录
```

## 7. API 约束

```text
GET  /api/admin/ai/routes
PUT  /api/admin/ai/routes/:feature
POST /api/admin/ai/routes/:feature/test
POST /api/admin/ai/routes/rollback
GET  /api/admin/ai/quota-overview
GET  /api/admin/ai/audit-logs
GET  /api/admin/ai/providers
POST /api/admin/ai/providers/:provider/test
```

API 复用现有后台认证。前端不得直接连接 PostgreSQL。

`PUT /routes/:feature` 必须在服务端完成：

1. 校验 featureKey、Provider、模型和能力匹配
2. 校验目标环境为 DEV
3. 在合法服务端写入通道中事务更新主模型、备用模型、revision、updated_by、updated_at
4. 使对应 Router 缓存失效
5. 写审计日志
6. 返回脱敏后的最新路由

## 8. 状态文案

必须覆盖：

- 加载中：加载路由/额度/Provider 状态…
- 测试中：测试主模型… / 测试备用模型…
- 测试成功：测试成功 · 耗时 X ms
- 测试失败：测试失败 · 显示脱敏错误码
- 保存中：保存中…
- 保存成功：已保存并立即生效 · revision vN
- 保存失败：保存失败，当前生效路由未改变
- 空数据：暂无调用数据
- 官方额度：暂不支持自动获取
- 0 请求：正常空数据，不显示异常

## 9. 实现顺序

1. Admin Route API 与 DEV 合法写入通道
2. Provider Status API
3. Quota Overview API 与审计查询
4. 在现有额度管理页面增加三个工作区和交互
5. 自动化测试
6. DEV 部署和真实 Coach 热切换验证
7. 视觉功能验证

本阶段不部署生产，不修改生产数据库、函数环境变量、函数代码或 Hosting。
