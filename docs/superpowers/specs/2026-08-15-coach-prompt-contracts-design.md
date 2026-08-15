# Coach Prompt Contract Design

固定 Prompt 只定义角色、APP_CONTEXT 数据边界、自然回答策略、估算数字表达、医疗安全和禁止内部信息泄漏。模型输入只允许两组应用数据：`userProfile`（目标和饮食偏好）与 `todayContext`（目标、已摄入、剩余、完成度、餐次数）。业务 `weekly` 字段继续保留在内部对象，但永远不序列化给模型。

每次调用的 messages 是：单个含 APP_CONTEXT 的 system message、最多十条真实历史 user/assistant 消息、原始当前用户问题。流式与 JSON 调用共用事实和安全规则，只分别追加纯文本与 JSON schema 输出规则。
