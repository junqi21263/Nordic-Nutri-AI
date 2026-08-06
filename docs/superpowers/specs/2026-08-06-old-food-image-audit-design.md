# 旧图审计与安全重生设计

## 目标

在现有“食材生图”后台中审计已经设为主图的历史生成图片。审计只覆盖高风险加工食品：先以 Food Image Prompt Engine 的最新视觉类型进行规则筛选，再使用视觉模型复核图片主体。只有管理员明确选择重生时，才创建新的候选图任务。

## 范围

- 新增旧图审计运行记录与审计项记录。
- 高风险处理形态：`drink_powder`、`coffee_powder`、`flour_powder`、`dry_spice`、`beverage_liquid`、`alcohol_bottle`、`non_alcohol_wine`、`condiment_liquid`、`sauce_paste`、`dairy_liquid`、`dairy_solid`、`canned_food`、`packaged_snack`、`prepared_dish`。
- 预览扫描仅查询：展示现有主图、新视觉类型、命中关键词与风险原因。
- AI 复核仅分析预览选中的审计项，输出 `pass`、`needs_review` 或 `fail`，以及主体识别、原因和置信度。
- 人工可保留旧图、设置视觉类型覆盖，或为审计项创建现有的强制重生任务。
- 新图继续进入既有候选图审核队列；通过后才会成为主图。

## 非目标

- 不自动删除、拒绝或替换历史主图。
- 不对所有历史图片全量调用视觉模型。
- 不更改现有批量缺图巡检的“已有主图跳过”策略。
- 不修改云函数权限、环境变量、网关或现有图片审核状态机。

## 数据模型

新增独立审计表，避免污染历史食物与图片记录：

- `food_image_audit_runs`：运行范围、高风险类别、发起人、状态、候选数量与复核数量。
- `food_image_audit_items`：运行 ID、食物 ID、旧主图 ID、当前图片 URL 快照、新视觉类型与来源、风险原因、AI 复核结果、人工决定、重生任务 ID、时间戳。

审计项状态为 `pending_review`、`ai_pass`、`needs_review`、`failed`、`kept`、`regeneration_requested`。审计结果和人工决定是追加式记录；旧主图不在审计阶段发生更新。

## 后端

新增 `food-image-audit-service`，依赖现有 food repository、Food Image Prompt Engine、Qwen VL 服务和 food image job service。

1. `previewHighRisk`：读取已有可用主图，重新解析视觉类型，筛选加工食品风险项并写入一次审计运行及待审核项。
2. `reviewItems`：读取已选审计项的图片 URL，调用视觉模型，以“预期视觉类型 + 当前图片主体”作受控判定；持久化判定结果。
3. `keepItem`：将审计项标记为人工保留，不修改图片。
4. `requestRegeneration`：可选先保存 `foods.visual_type` 人工覆盖，再调用现有 `foodImageJobs.regenerate`；将新任务 ID 回写至审计项。

新增管理员路由用于预览、查看运行/项目、启动 AI 复核、保留和请求重生。所有写入继续由现有管理员鉴权保护。

## 后台交互

在 `食材生图` 模块顶部增加“旧图审计”卡片，沿用现有 composer 卡片、中央审核队列和右侧 inspector：

1. 选择扫描数量（20、50、100）后点击“预览风险项”。
2. 在中央审计队列查看旧图、风险原因、新视觉类型和审计状态。
3. 点击“执行 AI 复核”分析选中项；UI 明示调用数量与额度影响。
4. 右侧 inspector 展示旧图、自动提示词诊断、AI 结论和操作按钮。
5. “加入重生队列”仅创建候选图任务；后续复用原有审核与设主图操作。

## 错误处理

- 没有高风险项返回空结果，不创建空重生任务。
- 视觉模型失败仅将对应审计项标记 `failed`，允许再次复核，不影响其他项。
- 已经存在活动生图任务时沿用现有 job service 的取消/强制重生保护。
- 审计项的旧图丢失或 URL 无法访问时显示失败原因，不自动重生。

## 测试与验收

- 高风险加工食品会被选中，普通水果不会被选中。
- 饮料粉、红葡萄酒、苹果醋、番茄酱的风险原因正确。
- AI 判定可映射到 `pass`、`needs_review`、`fail`。
- 保留操作不改变旧主图；请求重生调用已有强制重生逻辑并记录 job ID。
- 管理后台展示审计入口、队列、提示词诊断和安全操作按钮。
- 回归现有 food image jobs、batch、admin HTML 测试；迁移、lint、typecheck 与 build 通过。
