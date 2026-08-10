# 扫描分析结果页第二轮 Reveal 动画实现报告

## 范围

仅改造 `mini-program/src/pages/analysis-result/index.tsx` 的扫描分析结果出现方式。保存后的 Meal Detail 页面未修改；所有现有布局、文案、颜色、字号、间距、圆角、按钮样式及交互均保持不变。

## 修改文件

- `mini-program/src/features/scanner/meal-recognition-motion.ts`：统一动画配置、阶段顺序和基于真实食材数量的 stagger 延迟。
- `mini-program/src/features/scanner/meal-recognition-motion.test.ts`：验证新版阶段顺序与动态 stagger。
- `mini-program/src/hooks/useMealRecognitionMotion.ts`：按配置驱动可取消的 phase 定时器。
- `mini-program/src/pages/analysis-result/index.tsx`：把既有节点标记到 reveal phase；接入真实数值 count-up，并提供无可见 UI 的开发态 replay。
- `mini-program/src/components/app-card/index.tsx`、`mini-program/src/components/ai-insight-card/index.tsx`：仅支持 `data-motion-layer` 标记，不改变组件静态外观。
- `mini-program/src/styles/page.scss`：只增加 opacity / transform transition；不改变任何布局指标。
- `mini-program/tests/meal-recognition-motion.test.ts`：将上一版时间线契约更新为本轮已确认时间线。

## 动画时间线

| 时间 | Phase | 既有内容 |
|---|---|---|
| 0–280ms | `baseReveal` | 标题、副标题、AI 完成状态、主图、可信度、数据来源、餐别选择以 `opacity + translateY(8px)` 出现。 |
| 250–590ms | `nutritionReveal` | 既有营养评分卡以 `opacity + translateY(12px)` 出现。 |
| 600–1360ms | `metricsCount` | 圆环、评分百分比、kcal、评分卡内蛋白/碳水/脂肪从真实值 0 补间至 API 真实值。 |
| 1400–2200ms | `contentReveal` | 识别食材卡、列表、下方宏量营养条与 NOVA 洞察出现；食材项目按 80ms stagger，宏量数值/进度按 60ms stagger。 |
| 2200–2540ms | `bottomActionReveal` | 既有营养识别提示与既有“调整份量 / 保存本餐”区域以 `opacity + translateY(24px)` 上滑出现。 |
| 2600ms | `complete` | 解除暂态 data attribute；最终截图恢复为页面原有静态样式。 |

## Phase 触发

`useMealRecognitionMotion` 只在扫描页完成一次真实识别并通过 `scanner.consumeResultRevealPending()` 进入结果页时启动。正常从历史路径打开结果页不会触发 reveal 或重新请求识别接口。

## 数值 Count-up

`useCountUp` 通过 `requestAnimationFrame`（无 rAF 的运行时使用 16ms fallback）把 kcal 和宏量营养素从 0 补间到 `adjusted` 的真实值，结束帧强制写入真实目标。圆环复用 `CircularProgress` 的真实百分比输入，进度条复用 `MacroProgress` / `AnimatedProgressBar` 的真实进度输入；动画只改变显示过程，不改变目标数据。

## 进度条

评分圆环在 `metricsCount` 开始由 0 到真实百分比。下方三条宏量进度条在 `contentReveal` 开始，由 0 向各自真实完成比例生长；每条延迟 60ms，避免同时跳出。

## 底部操作区

未新增 Bottom Sheet 或更改按钮层级。仅向原有免责声明与动作容器添加 `data-motion-layer="bottom"`，在 `bottomActionReveal` 启动渐显与 24px 上移过渡；按钮原布局、点击行为及固定安全区逻辑保持不变。

## Replay Debug Mode

开发环境挂载无可见 UI 的 `globalThis.__NORDIC_REPLAY_MEAL_REVEAL__()`。在开发工具控制台调用它即可用当前内存中的识别数据重播动画，不会触发任何识别、保存或 API 请求。生产构建不会挂载该函数。

## 与 Stitch 的保留差异

本轮遵守“当前 UI 冻结”约束，因此没有加入 Stitch 中未存在于线上页面的扫描遮罩、重设计卡片或新粒子效果。仅复刻其“分层逐步揭示”的节奏；最终静态页面仍为当前线上页面。
