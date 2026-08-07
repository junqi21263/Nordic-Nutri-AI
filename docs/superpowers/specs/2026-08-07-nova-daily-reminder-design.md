# NOVA 每日提醒设计

## 目标

把教练页顶部卡片从固定式欢迎语升级为一次/天、可缓存的主动营养提醒。它只围绕用户档案、营养目标、饮食偏好、饮食记录和记录习惯工作，不接训练数据，也不自动修改用户目标。

## 范围

- 服务端从真实数据生成 `dailyContext`：用户阶段、今日时段、昨日餐次与完成率、近期记录习惯、偏好与忌口。
- DeepSeek V4 Flash 基于该上下文返回一个受校验的结构化提醒；模型失败时由规则兜底。
- 每个用户每天的提醒缓存一次；上下文变化后可重算，不会重复计量缓存读取。
- 小程序展示「NOVA · 今日提醒」，聊天仍保留为用户主动提问入口。
- 后台可按 `proactive_daily_brief` 识别这类调用与 Token 消耗。

## 非范围

- 训练、恢复、运动表现或训练计划。
- 自动变更热量、宏量营养目标或体重目标。
- 推送通知、任务系统、点击率分析或新的管理页。

## 决策规则

主题限定为 `starter`、`protein_gap`、`energy_gap`、`meal_rhythm`、`dietary_balance`、`progress`、`consistency`。服务端首先选择一个优先主题，模型只负责自然表达；最近三次提醒主题中已出现的主题不重复，除非它是唯一有足够事实支撑的缺口。`first_day`、`first_week`、`habit_building`、`stable_tracking` 与 `goal_progress` 都由服务端从账户创建时间、记录天数和近七日完成情况导出。

## 数据与接口

新增 `GET /coach/daily-brief?date=YYYY-MM-DD`，返回 `greeting`、`summary`、`mealLabel`、`suggestion`、`reason`、`theme`、`action`、`source`、`model`、`cached`。缓存写入 `nova_daily_briefs`，保存上下文哈希、结构化 payload、来源、模型和更新时间。

## 可靠性与额度

一次未命中缓存的 V4 Flash 成功调用记录 `model_tokens`、`model_tokens_input`、`model_tokens_output`，统一标记 `feature: proactive_daily_brief`。缓存命中和规则兜底不记录模型 Token。模型返回必须为 JSON，并进行长度、主题和安全用语校验；失败后返回由同一上下文构造的安全规则提醒。
