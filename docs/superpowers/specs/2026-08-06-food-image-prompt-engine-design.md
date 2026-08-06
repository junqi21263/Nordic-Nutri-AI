# Food Image Prompt Engine 重构设计

## 目标

将食物图片提示词从“一级分类/材料词模板”重构为基于真实视觉形态的统一 Food Image Prompt Engine。引擎必须优先识别食品最终呈现形态，避免“饮料粉”被生成成水果、“葡萄酒”被生成成葡萄、“苹果醋”被生成成苹果等错误。

## 已确认的识别硬规则

识别顺序固定为：

1. 人工视觉类型覆盖；
2. 完整食品形态词；
3. 加工形态词；
4. `foodForm` 与标签；
5. 名称中的原材料词和风味词；
6. 一级分类；
7. `unknown`。

在第 2 至第 5 层内统一采用“长词优先、加工形态优先、完整词优先”：

- 先匹配更长的完整词；同长度时加工形态词优先；
- 完整食品形态词一旦命中，禁止继续回退到水果、蔬菜、肉类、谷物等原材料词；
- 风味词（如橙味、草莓味、水果味）只作为辅助信号，不能决定主体形态；
- 规则必须覆盖：橙味饮料粉 → `drink_powder`，水果味饮料粉 → `drink_powder`，葡萄酒 → `alcohol_bottle`，草莓味蛋白粉 → `flour_powder`，苹果醋 → `condiment_liquid`。

## 视觉类型

统一导出 `FoodVisualType`，至少覆盖：

`raw_meat`、`processed_meat`、`whole_fish`、`fish_fillet`、`shellfish`、`egg`、`dairy_liquid`、`dairy_solid`、`tofu_soy`、`grain`、`flour_powder`、`bread_baked`、`root_tuber`、`leafy_vegetable`、`whole_vegetable`、`whole_fruit`、`cut_fruit`、`nuts_seeds`、`oil_liquid`、`condiment_liquid`、`sauce_paste`、`dry_spice`、`beverage_liquid`、`drink_powder`、`coffee_powder`、`tea_leaf`、`alcohol_bottle`、`non_alcohol_wine`、`canned_food`、`packaged_snack`、`prepared_dish`、`unknown`。

每种类型绑定主体模板、状态描述、服务/摆放描述和负面提示词。加工食品必须描述最终食用形态，并禁止原材料的表皮、叶片、果肉切面等特征被继承。

## 数据流与兼容性

保留现有单一提示词入口 `food-image-prompts.cjs`，在其中引入识别器、模板注册表和计划输出，不创建第二套任务队列。`buildFoodImagePromptPlan` 返回识别结果、命中信号、模板、主体、负面提示词和最终 prompt。

现有 `food-image-job-service.cjs`、`food-image-batch-service.cjs`、Hunyuan worker、审核、拒绝重试和重新生图继续使用同一 builder。批量项的 `prompt_plan_json` 和任务记录保存完整识别快照，重新生图只叠加审核反馈，不改变视觉类型判断。

若现有食物表没有人工视觉类型字段，增加兼容迁移；自动识别不覆盖人工配置。人工覆盖传入引擎后标记 `decisionSource=manual_override`，后台可以查看和修改。

当前 Hunyuan 调用只接受正向 `prompt`。负面提示词继续作为正向提示词中的约束段传给模型，同时在计划快照和审核页单独展示，避免误以为已调用独立 `negative_prompt` 参数。

## 后台审核体验

沿用 `cloudbase/admin/food-images.html` 现有 inspector、审核和重新生图操作，扩展“查看自动提示词”区域展示：视觉类型、中文标签、识别来源、命中信号、主体描述、最终正向提示词和负面提示词。人工覆盖使用现有页面交互风格，不改变审核状态机。

## 测试与验收

先补充失败测试，至少验证：

- 橙味饮料粉、水果味饮料粉、低热量橙味早餐饮料粉 → `drink_powder`；
- 葡萄酒、仙粉黛红葡萄酒 → `alcohol_bottle`；
- 草莓味蛋白粉 → 粉剂形态；
- 苹果醋 → `condiment_liquid`；
- 完整形态词命中后 prompt 不包含水果表皮、叶片、果肉切面等原材料描述；
- 人工覆盖优先于自动识别；
- 任务创建、批量快照、审核查看、拒绝重试和重新生图继续传递同一视觉类型；
- 正向 prompt 保持模型长度限制，负面提示词单独可审计。

验收分为自动化测试、函数/后台静态检查和实际生成运行检查三层；自动化通过不等同于真实图片已经通过人工审核。
