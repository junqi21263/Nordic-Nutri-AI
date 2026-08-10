# AI 餐食识别结果渐进呈现动画 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 AI 餐食识别结果页任何现有视觉结构、文案、数据和接口的前提下，仅为“本次真实识别完成后首次进入”的结果页加入约 3.2 秒的渐进呈现动画。

**Architecture:** 扫描页在真实识别成功、写入既有 `analysisStore` 后写入一次性瞬态触发标记；结果页在首次挂载时消费该标记，并由页级 `useMealRecognitionMotion` 驱动阶段与延迟。照片、状态、食材、营养、数值/进度和操作区均只新增 motion class/轻量包装，不改变 API、数据模型、保存链路或历史查看入口。数值使用局部 `requestAnimationFrame` 计数器，条形进度以既有 transform 组件受控从 0 过渡到真实目标。

**Tech Stack:** Taro、React、TypeScript、Zustand、SCSS、Vitest、微信小程序构建。

---

## 范围与不变量

- 仅改动 motion 层：不得改分析结果页布局、组件排序、图片、按钮、字体、间距、文案、接口、后端、数据库、路由或真实营养数据。
- 只在扫码/相册的**真实识别成功**进入结果页时播放一次；历史记录、直接进入、刷新/返回结果页不得播放。
- 保留扫描页的现有加载态；结果页动画不制造食材、热量或营养数据的假结果。
- 使用 CSS class、`transition`、`requestAnimationFrame`；不引入 Framer Motion、DOM 依赖或新动画库。
- 所有时间参数集中在一个配置文件；默认总时长约 3200ms。

## 受控时间线

| 阶段 | 触发时间 | 呈现 |
| --- | ---: | --- |
| `imageReady` | 0ms | 原图 opacity `0→1`、scale `.985→1`、translateY `6px→0`，300ms |
| `status` | 300ms | “AI 完成” opacity `0→1`、translateY `5px→0`，约 260ms |
| `foodReveal` | 700ms | 每项食材 opacity `0→1`、translateY `8px→0`，250ms，90ms stagger |
| `nutritionReveal` | 1600ms | 评分/营养区 opacity `0→1`、translateY `10px→0`，340ms |
| `nutritionCounting` | 1900ms | 热量、三大营养素从 0 计到真实值；760ms，宏量每项 60ms stagger |
| `actionReveal` | 2700ms | 保存/调整操作 opacity `0→1`、translateY `8px→0`，280ms |
| `complete` | 3200ms | 释放临时计时器，保持最终真实页面 |

统一缓动：`cubic-bezier(.22, 1, .36, 1)`。

## Task 1：建立可测的一次性识别触发契约

**Files:**
- Modify: `mini-program/src/stores/scanner-store.ts`
- Modify: `mini-program/src/pages/food-scanner/index.tsx`
- Modify: `mini-program/tests/ai-meal-flow.test.ts`

- [ ] 在 `ScannerStore` 新增只用于页面跳转的一次性字段与动作：`resultRevealPending`、`markResultRevealPending()`、`consumeResultRevealPending()`、`clearResultRevealPending()`。
- [ ] `consumeResultRevealPending()` 必须读取当前值后立即清空并返回布尔值；`reset()` 必须清空该标记，确保不跨下一次扫描或历史入口泄漏。
- [ ] 在 `analyzeCurrentPreview` 成功获得真实 `meal`、完成既有 `setCapturedMeal` 与 `analysis.setAnalysis` 后、`navigateTo('/pages/analysis-result/index')` 前标记待播放；导航抛错时清除标记，避免之后误播。
- [ ] 扩展 `ai-meal-flow.test.ts`：验证初始为 false、`mark` 后第一次 `consume` 为 true、第二次为 false、`reset` 后为 false。
- [ ] 先运行 `pnpm --dir mini-program test:unit -- ai-meal-flow.test.ts`，确认新增断言在实现前失败；实现后再次运行并通过。

## Task 2：新增集中动画时序与局部计数工具

**Files:**
- Add: `mini-program/src/features/scanner/meal-recognition-motion.ts`
- Add: `mini-program/src/hooks/useMealRecognitionMotion.ts`
- Add: `mini-program/src/hooks/useCountUp.ts`
- Add: `mini-program/tests/meal-recognition-motion.test.ts`

- [ ] 在 `meal-recognition-motion.ts` 导出不可变 `mealRecognitionMotionConfig`，包含 `photoMs: 300`、`statusAtMs: 300`、`foodAtMs: 700`、`foodStaggerMs: 90`、`foodEnterMs: 250`、`nutritionAtMs: 1600`、`nutritionEnterMs: 340`、`countAtMs: 1900`、`countDurationMs: 760`、`macroStaggerMs: 60`、`actionAtMs: 2700`、`actionEnterMs: 280`、`completeAtMs: 3200` 与统一 ease 字符串。
- [ ] 在同文件提供纯函数 `getMealRecognitionMotionSchedule(itemCount)`，返回各食材绝对延迟和各宏量计数延迟；动态支持任意真实食材数，不硬编码餐盘内容。
- [ ] `useMealRecognitionMotion(enabled)` 只维护 `idle | imageReady | status | foodReveal | nutritionReveal | nutritionCounting | actionReveal | complete`；当 `enabled=false` 时立即返回 `complete`，页面直接显示最终真实数据；清理所有 timeout，避免离页后更新状态。
- [ ] `useCountUp(target, { enabled, delayMs, durationMs })` 用 `requestAnimationFrame`（无原生能力时复用安全 setTimeout fallback）在局部组件内从 0 计算到 `target`。中途卸载要取消帧，结束帧必须精确提交 `target`；不使用 `Math.floor` 导致最终值偏小。
- [ ] 添加 `meal-recognition-motion.test.ts`，静态/纯函数验证：配置集中、最终时点 3200ms、食材 stagger 为 90ms、宏量 stagger 为 60ms、控制器含完整 phase 名称、计数器含 `requestAnimationFrame` 与取消逻辑。
- [ ] 运行 `pnpm --dir mini-program test:unit -- meal-recognition-motion.test.ts`；实现前失败，实现后通过。

## Task 3：让现有进度组件支持结果页的受控起点

**Files:**
- Modify: `mini-program/src/components/animated-progress-bar/index.tsx`
- Modify: `mini-program/src/components/macro-progress/index.tsx`
- Modify: `mini-program/src/components/circular-progress/index.tsx`
- Modify: `mini-program/src/hooks/useAnimatedProgress.ts`
- Modify: `mini-program/tests/animated-progress.test.ts`

- [ ] 为 `AnimatedProgressBar` 增加可选、默认保持现状的受控 props（例如 `deferUntil?: boolean`、`delayMs?: number`），使结果页可在计数阶段前稳定保持 `scaleX(0)`，随后仅用既有 GPU transform 过渡到真实百分比。
- [ ] 为 `MacroProgress` 与 `CircularProgress` 增加可选受控参数（例如 `reveal?: boolean`、`revealDelayMs?: number`），默认值必须维持所有其他页面当前行为。结果页传入时，环、数字和条均从 0 开始；非结果页不改变。
- [ ] 不将每帧数字状态提升到 `AnalysisResultPage`：计数状态限制在分数/宏量值的小型显示组件或现有小组件，避免整页 60fps 重渲染。
- [ ] 更新 `animated-progress.test.ts`，确认新增 props 为可选、仍使用 `scaleX` 和已有 reduced-motion 兼容规则，且不会删除现有共享动画断言。
- [ ] 运行 `pnpm --dir mini-program test:unit -- animated-progress.test.ts` 并通过。

## Task 4：在分析结果页接入 motion class 与真实数值计数

**Files:**
- Modify: `mini-program/src/pages/analysis-result/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/tests/meal-recognition-motion.test.ts`

- [ ] 在结果页挂载时以 `useState(() => scanner.consumeResultRevealPending())` 消费一次性标记，再调用 `useMealRecognitionMotion(revealOnMount)`；禁止在 render body 每次调用 store action。
- [ ] 为现有元素添加语义化类和 data phase，不重排 DOM：原图 `.analysis-result-page__summary-image`、状态 `.analysis-result-page__ai-status`、每个 `.analysis-ingredient`、评分/营养区域、三条 `MacroProgress`、底部 `.analysis-result-page__actions`。
- [ ] 为分数、热量、三个标签和进度条传入真实目标及受控 reveal 延迟；动画期间显示 0，完成后严格显示 `adjusted` 真实值。食品名称、份量、识别可信度和评分字母始终来自现有真实 `meal`/`adjusted`，不得替换。
- [ ] SCSS 只追加 `.analysis-result-page--recognition-reveal` 作用域规则：初始态用 opacity/transform，进入态加 `.is-*` class；只使用 `transition`、`will-change: transform, opacity`，并为 `[data-reduced-motion="true"]` 提供无延迟最终态。
- [ ] 任何阶段不得使用 `display: none` 或修改高度/边距；隐藏内容仍占位，保证页面不发生重排。
- [ ] 添加测试断言：结果页消费 `consumeResultRevealPending`；引用控制器与 count-up；真实数据仍从 `adjusted`/`meal` 读取；CSS 包含照片/状态/食材/营养/操作五类阶段和 `data-reduced-motion` 的最终态。
- [ ] 运行 `pnpm --dir mini-program test:unit -- meal-recognition-motion.test.ts` 并通过。

## Task 5：提供只限开发环境的重播与验收文档

**Files:**
- Modify: `mini-program/src/pages/analysis-result/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Add: `MOTION_IMPLEMENTATION_REPORT.md`
- Modify: `mini-program/tests/meal-recognition-motion.test.ts`

- [ ] 仅在开发编译环境显示一个非生产重播入口；它只能重新启动当前已经存在的动画状态，不重新请求识别接口、不生成/改写 `analysisStore`、不保存餐食。生产构建不得显示该入口。
- [ ] 重播入口不得改变主页面的视觉层级；可用现有开发语义标记/轻量文本入口，且隐藏后不留下布局空洞。
- [ ] 在 `MOTION_IMPLEMENTATION_REPORT.md` 写明：冻结 UI 承诺、触发条件、阶段配置表、非触发入口、无 API 改动说明、reduced motion 行为，以及 DevTools/真机在 0/300/700/1000/1500/2000/2500/3000ms 的逐项检查表。
- [ ] 检查报告没有把自动化静态测试表述为真机验证；真机比较必须明确标为待人工验收。
- [ ] 更新测试，验证开发入口受环境开关保护且不包含 API 调用名称。

## Task 6：完整验证与交付前检查

**Files:**
- Verify only: modified production and test files

- [ ] 运行 `pnpm --dir mini-program typecheck`。
- [ ] 运行 `pnpm --dir mini-program lint`。
- [ ] 运行 `pnpm --dir mini-program test:unit`。
- [ ] 运行 `pnpm --dir mini-program build:weapp`。
- [ ] 运行 `pnpm --dir mini-program verify:weapp`。
- [ ] 在微信开发者工具导入 `mini-program/dist/weapp/`，走一次真实拍照/相册识别，确认只在真实成功跳转播放；返回、历史餐次详情、刷新结果页均不播放；保存行为、调整份量、预览原图仍可用。
- [ ] 在真机按 0/300/700/1000/1500/2000/2500/3000ms 与 Stitch 录屏进行人工对照，确认动画在 2.8–3.5 秒内完成、无跳动或布局变化；若尚未完成，报告为待验收而非“已验证”。
- [ ] 检查 `git diff --check`，只暂存本计划授权的识别动效文件，不触碰现有未跟踪的 `docs/superpowers/plans/2026-08-09-coach-meal-context.md`。
