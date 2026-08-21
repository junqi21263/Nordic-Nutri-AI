# Implementation Plan

- [ ] 1. 盘点现有 AI 调用点
  - 列出文本、视觉、教练、周报相关 service 的 Provider、模型和 Key 读取位置。
  - 标记迁移期环境变量 fallback。
  - _Requirement: 1, 6_

- [ ] 2. 确定测试环境密钥存储实现
  - 优先确认运行时密钥管理服务可用性。
  - 若不可用，设计加密值过渡方案和迁移出口。
  - _Requirement: 2, 6_

- [ ] 3. 创建测试环境 PostgreSQL 迁移
  - 创建 Provider 账号、模型配置、功能路由、版本和审计表。
  - 添加状态、版本和引用完整性约束。
  - 不修改生产数据库。
  - _Requirement: 1, 2, 5_

- [ ] 4. 实现配置 Repository 与运行时缓存
  - 实现读取已发布 revision、短 TTL 缓存和发布后失效。
  - 确保快照和日志不含完整 Key。
  - _Requirement: 4, 5, 7_

- [ ] 5. 实现 Provider Adapter
  - 统一 DeepSeek、Qwen、SenseNova 的文本/视觉调用合同。
  - 支持 Base URL、model ID、timeout、max tokens、temperature。
  - 标准化错误和能力不支持错误。
  - _Requirement: 1, 3, 7_

- [ ] 6. 实现 AI Router
  - 按 feature key 解析主模型和备用模型。
  - 实现失败 fallback、超时和调用结果元数据。
  - 将现有 service 接入 Router，保留可观测的迁移期 fallback。
  - _Requirement: 1, 4, 7_

- [ ] 7. 实现后台管理 API
  - Provider CRUD、Key 替换/停用、测试连接、路由编辑、发布、回滚、审计查询。
  - 全部接口复用现有后台认证和审计能力。
  - _Requirement: 2, 3, 4, 5, 6

- [ ] 8. 实现后台配置页面
  - 在现有系统配置模块增加 Provider 账号、模型路由和变更记录工作区。
  - 保留 DEV 测试环境标识。
  - Key 输入后只显示末四位。
  - _Requirement: 1, 2, 3, 4, 5, 6

- [ ] 9. 补齐自动化测试
  - 覆盖 Repository、Router、Adapter、管理 API、Key 脱敏、发布和回滚。
  - 增加前端页面结构和环境隔离断言。
  - _Requirement: 1-7

- [ ] 10. 测试环境真实链路验收
  - 仅在 `test-dev-d4gyxnn0b5dfa2c8a` 配置测试 Key。
  - 从 DeepSeek 切换到 Qwen/SenseNova，验证无需重新部署即可生效。
  - 验证失败 fallback、回滚和审计日志。
  - _Requirement: 3, 4, 5, 7

- [ ] 11. 生产发布准备
  - 输出生产迁移脚本、环境变量/密钥清单和回滚方案。
  - 使用已验证提交号创建 release 分支。
  - 未经单独批准，不执行生产迁移或生产部署。
  - _Requirement: 5, 6

