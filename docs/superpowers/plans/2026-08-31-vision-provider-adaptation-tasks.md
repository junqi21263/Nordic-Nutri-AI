# 实施任务清单：多厂商视觉模型适配

## 阶段 A：契约与测试先行

- [ ] 新增统一适配器契约和错误分类测试。
- [ ] 新增候选配置归一化、角色/优先级/能力解析测试。
- [ ] 新增注册表测试：未注册厂商、注册厂商、重复注册和测试第三厂商。
- [ ] 新增路由测试：primary 成功、retryable 降级、non-retryable 终止、全失败。

## 阶段 B：适配器实现

- [ ] 从当前视觉请求服务抽出通用 OpenAI-compatible 请求适配器。
- [ ] 将 DeepSeek/Qwen 改为薄配置适配器，保留各自图片传输和模型默认值。
- [ ] 保持统一营养 JSON 校验和当前对外业务码。

## 阶段 C：动态路由与观测

- [ ] 删除 provider 名称条件分支，改用注册表和数据库候选链。
- [ ] 将实际 provider/model/attempts/fallback reason 接入 trace 和错误诊断。
- [ ] 校验日志脱敏：无 API key、无图片正文、无完整 provider body。

## 阶段 D：DEV 验证

- [ ] 在本地 Node 24 环境运行后端定向测试和完整相关测试。
- [ ] 构建并检查 `get-login-ticket` 函数产物。
- [ ] 绑定并确认 CloudBase DEV `test-dev-d4gyxnn0b5dfa2c8a` 后部署函数。
- [ ] 查询新鲜 `ops_request_traces`，验证 DeepSeek 成功、DeepSeek 超时后 Qwen 降级、全部失败三条路径。
- [ ] 运行小程序 typecheck/build/verify；真实微信开发者工具/设备结果单独标记，未执行则写 `NOT VERIFIED`。

## 明确不做

- [ ] 不修改生产环境 `lewis-healthy-d4glgqqzv73a5bc10`。
- [ ] 不把 Qwen 或 DeepSeek 写成永久唯一厂商。
- [ ] 不在本阶段启用异步视觉基础设施。
- [ ] 不把 API key 写入代码、Git、前端或日志。
