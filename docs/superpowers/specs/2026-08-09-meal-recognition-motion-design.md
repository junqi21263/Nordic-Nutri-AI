# AI 餐食识别结果渐进呈现动画设计

## 目标与边界

为现有 Taro 微信小程序的 `analysis-result` 页面增加结果渐进呈现动画。当前页面的布局、结构、文案、数据、API、路由、颜色、间距、字号、圆角、按钮和图标均为冻结 UI；Stitch 仅作为 Motion Golden Reference。

本设计不新增结果页，不替换现有页面视觉，不修改识别请求与保存餐次逻辑，不增加动画框架，不接入后端或数据库改动。

## 触发与数据流

1. 用户完成既有扫描与识别流程。
2. 真实 API 结果写入 `analysisStore.analysis` 后，扫描入口写入一次性 `fromRecognition` transient 标记。
3. `analysis-result` 仅在该标记存在且真实数据可用时启动动画；从记录、历史链接或正常重新进入页面时直接展示完成态。
4. 控制器以完成态真实数据为唯一来源，不在请求未完成时预填任何名称、热量或宏量数值。
5. 控制器完成或被跳过后保留最终静态 UI。

## 组件与职责

### `useMealRecognitionMotion`

独立 Hook，维护以下有限 phase：

`idle → imageReady → status → foodReveal → nutritionReveal → nutritionCounting → actionReveal → complete`

Hook 负责启动、重放、取消定时器、在组件卸载时停止帧循环，并输出 phase、count-up 数值和每个元素的显隐 class。

### `meal-recognition-motion-config`

所有时间参数集中定义，初始值以 Stitch 源码为基准：

| 参数 | 初始值 |
| --- | ---: |
| photo enter | 300ms |
| status start | 300ms |
| food start | 700ms |
| food stagger | 90ms |
| food enter | 250ms |
| nutrition start | 1600ms |
| nutrition enter | 340ms |
| count start | 1900ms |
| count duration | 760ms |
| macro stagger | 60ms |
| action start | 2700ms |
| action enter | 280ms |
| complete | 3200ms |

基础 easing 为 `cubic-bezier(0.22, 1, 0.36, 1)`；不会引入 bounce、粒子或新视觉效果。

### `useCountUp`

使用 `requestAnimationFrame` 插值真实目标值。支持整数、小数、0、空值和取消；每轮结束时无条件写入精确 API 最终值。热量先开始，蛋白/碳水/脂肪按 60ms 依次启动。

## 当前 DOM 映射

不重排页面，仅给已有节点添加 class 或必要的轻量 wrapper：

| 当前元素 | Reveal 行为 |
| --- | --- |
| `analysis-result-page__summary-image` | opacity 0→1，scale .985→1，translateY 6px→0 |
| `analysis-result-page__ai-status` | opacity 0→1，translateY 5px→0 |
| `adjusted.items` 对应 `.analysis-ingredient` | 动态按 index × 90ms stagger，opacity、translateY、scale |
| 当前评分/营养区域 | opacity 0→1，translateY 10px→0；数值初始为 0 |
| 现有 `MacroProgress` | 保留原高度、颜色和圆角，只让百分比从 0 到真实值 |
| `analysis-result-page__actions` | opacity 0→1，translateY 8px→0 |

不使用 `display: none` 或动态插入导致的高度变化；所有区域始终保留最终空间。用户交互不因动画被禁用。

## 开发回放

仅在开发环境提供 replay 入口。它调用控制器的 replay 方法，读取页面已经拥有的真实分析数据，不再触发识别 API。生产构建不渲染该入口。

## 验收与测试

自动化覆盖：

- 只有一次性 AI 识别结果入口启动动画；历史入口不启动。
- 食材数量为 2、5、7 时均按动态 stagger 计算。
- Count-up 和进度最终精确等于真实数据。
- replay 不触发 API。
- complete 状态与关闭动画时的静态 UI 相同。

人工验证使用微信开发者工具/真机，按 0、300、700、1000、1500、2000、2500、3000ms 对照 Stitch 录屏检查渐进节奏，并确认结束后的静态截图没有布局漂移。

## 已知差异

Stitch 代码包含 Web DOM 创建与 Tailwind class；本实现将保留其可验证的时间顺序、渐入方式、`0.7s ease-out` 进度生长与 `requestAnimationFrame` 数字更新，但改用 Taro/微信小程序兼容的状态、SCSS 和轻量 Hook。
