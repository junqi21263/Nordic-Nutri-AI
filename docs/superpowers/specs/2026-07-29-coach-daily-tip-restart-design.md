# 营养教练对话重启与今日营养建议设计

## 目标

在保持 Nordic Nutri AI 现有教练页面结构、视觉语言和 CloudBase 后端边界的前提下，完成三项改造：

1. 将教练输入框从全圆胶囊统一为方案 A 的圆角长方形。
2. 增加“重启对话”功能，归档当前会话但保留历史记录。
3. 将静态“AI 建议”改为动态“今日营养建议”，通过 CloudBase 云函数安全调用 DeepSeek，随机返回营养建议、食品功能介绍或健康饮食/营销小知识。

## 范围与非目标

本次只改造营养教练页面及其既有 CloudBase 教练服务边界，不重做页面导航、消息气泡、进度卡片、快捷提问或图片识别流程。

DeepSeek Key 只允许存在 CloudBase 云函数环境变量 `DEEPSEEK_API_KEY`，小程序构建产物、前端源码、日志和 API 响应均不得包含 Key。真实 Key 的配置和函数发布属于部署验收步骤，不在代码中硬编码。

## 交互设计

### 输入框

- 保留相机按钮、输入、发送按钮和键盘顶起逻辑。
- 输入区域使用约 12px 圆角的长方形；发送按钮和相机按钮保持小型圆角方块。
- 删除或覆盖旧的全圆胶囊样式，确保最终编译 WXSS 中不会出现 `border-radius: 9999px` 或 `$radius-full` 对输入框生效。
- 保持禁用、空输入、已选图片和安全区行为不变。

### 重启对话

- 顶部品牌栏右侧显示“重启对话”入口，位置对应方案 A。
- 点击后弹出确认框：当前对话会清空，历史记录仍会保留。
- 确认后调用 `POST /coach/restart`。
- 服务端归档当前未归档会话并创建新的空会话；消息不物理删除。
- 服务端成功后前端清空当前消息、输入草稿和待上传图片，生成新的开场提示，并重新加载快捷提问与今日建议。
- 请求失败时不清空页面状态，只显示错误反馈。
- 重启期间按钮不可重复点击。

### 今日营养建议

- 卡片标题由“AI 建议”改为“今日营养建议”。
- 页面进入时自动请求一次 `GET /coach/daily-tip?date=YYYY-MM-DD`。
- 卡片提供“换一条”操作，重新请求建议。
- 返回的建议类型为以下之一：
  - `nutrition_tip`：结合当天缺口的日常营养建议；
  - `food_function`：食品或食材的营养功能介绍；
  - `food_knowledge`：健康饮食或食品营销识别小知识。
- 结构化建议包含 `type`、`headline`、`content` 和可选的 `food` 操作信息。
- 只有返回有效食品操作时才显示现有“加入今晚加餐”卡片；知识类建议不强行绑定食品操作。
- DeepSeek 失败、超时、Key 未配置、返回 JSON 非法或内容不安全时使用服务端内置兜底池，页面仍可用。

## 后端设计

### 服务接口

`POST /coach/restart`

- 认证：现有产品 session Bearer Token。
- 请求体：空对象即可。
- 响应：`{ conversationId: string, messages: [] }`。
- 处理：按当前用户查找未归档会话，写入 `archived_at`，插入新的“营养教练”会话并返回新 ID。
- 历史会话和消息保留，后续 `GET /coach/messages` 只读取新会话。

`GET /coach/daily-tip?date=YYYY-MM-DD`

- 认证：现有产品 session Bearer Token。
- 输入日期复用既有教练日期校验。
- 服务端读取当天摘要、周趋势、用户目标和饮食偏好。
- 服务端随机选择一个建议类型，再向 DeepSeek 请求结构化 JSON。
- 响应只返回校验后的公开字段，不返回系统提示词、上下文原文或供应商凭据。

### DeepSeek 约束

新增每日建议专用服务，复用现有 DeepSeek 请求工厂的超时、模型环境变量和异常处理风格，但使用独立 system prompt。模型必须：

- 只输出 JSON；标题最多 32 字，正文最多 120 字；
- 只能围绕日常营养、食材功能和食品知识；
- 不得诊断、治疗、开药，或对疾病、孕产、药物和进食障碍给出个体化结论；
- 不得声称食品可以治病或保证减重；
- `food_knowledge` 不做品牌推广，重点是帮助用户理解宣传话术与营养事实的区别。

服务端对 JSON、字段长度、类型枚举和危险措辞做二次校验。校验失败统一回退到安全文案池。

## 前端结构

- `mini-program/src/pages/coach/index.tsx`
  - 增加 daily tip 状态、首次加载、换一条和重启处理；
  - 将静态建议标题和正文替换为服务端返回值；
  - 将重启处理绑定到 PageLayout/AppTopBar 的右侧入口。
- `mini-program/src/api/coach-api.ts`
  - 增加 `ProductCoachDailyTip` 类型；
  - 增加 `getProductCoachDailyTip` 和 `restartProductCoachConversation`。
- `mini-program/src/layouts/page-layout/index.tsx` 与 `mini-program/src/components/app-top-bar/index.tsx`
  - 增加可选的品牌栏右侧操作，不影响没有该操作的其他页面。
- `mini-program/src/pages/coach/components/CoachComposer/index.scss`
  - 保留唯一的输入框视觉定义；
  - 清理 `page.scss` 中重复的旧胶囊定义。
- `cloudbase/functions/get-login-ticket/coach-data-service.cjs`
  - 增加会话归档/新建和每日建议上下文服务。
- `cloudbase/functions/get-login-ticket/deepseek-coach-service.cjs`
  - 增加每日建议结构校验与 DeepSeek 服务。
- `cloudbase/functions/get-login-ticket/index.js`
  - 注册新路由及 HTTP 方法处理。

不新增数据库表；现有 `coach_conversations.archived_at` 已满足会话重启的数据模型。

## 错误与回退

- 前端 API 失败：重启不改变当前页面；每日建议显示内置文案并允许再次“换一条”。
- 重启接口重复请求：接口以当前用户为边界，每次只归档当前活动会话；前端在请求期间禁用按钮。
- DeepSeek 失败或返回不合规内容：服务端返回规则池建议，并标记为 `rule_v2`，不向前端暴露内部错误。
- 安全风险文本：丢弃模型结果，返回日常饮食边界提示。

## 验证计划

1. 为每日建议服务、会话重启服务和 HTTP 路由增加失败优先测试。
2. 为 API 边界、页面文案、重启行为和输入框样式增加前端回归断言。
3. 运行 CloudBase 函数测试、Mini Program 类型检查、现有测试和 WXSS 检查。
4. 构建微信小程序。
5. 在微信开发者工具或真机验证：方案 A 输入框形态、重启确认与清空、历史保留、换一条、DeepSeek 成功路径和异常兜底。

## 发布前提

代码完成不等于线上 DeepSeek 已激活。发布前必须在 CloudBase `get-login-ticket` 函数环境中确认 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL` 已配置，然后用非敏感营养问题做一次真实验收。不得把真实 Key 写入仓库或发送到前端。
