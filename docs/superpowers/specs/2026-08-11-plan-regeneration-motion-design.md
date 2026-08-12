# 计划重新生成动效复刻设计

## 目标

在「饮食偏好」更新流程中，以当前页面上的轻量 processing 状态替代硬切换，完成后平滑展示现有「新的计划已准备好」页面。视觉和时间基准以 Stitch `code.html`、`screen.png` 和参考录屏为准。

## 范围

- 仅改饮食偏好到营养计划的前端视图状态、动效、结果页入场和固定操作区。
- 保留已有预览、保存计划、更新目标和调整参数业务调用。
- 不改后端接口、数据库、目标计算、营养计算、全局 Header 或其他页面。

## 状态机

```text
idle
  -> processing       点击“重新生成计划”；开始真实 preview 请求
  -> transitioning    请求成功且 processing 已播放最短完整周期
  -> ready            旧视图淡出完成、结果视图可交互

processing -> error -> idle
  请求失败；停止动效，恢复原按钮，沿用现有错误反馈
```

处理期间拒绝重复点击。请求即使很快成功，也至少展示完整的 Stitch processing 周期；请求较慢则继续循环直至成功。

## 视图与动效

### Preferences processing

- 保持原偏好页可辨识，仅降低正文视觉存在感；不新增 route、全屏 loading、系统 spinner 或普通 modal。
- CTA 按下：`scale(1) -> scale(.975) -> scale(1)`，约 120–160ms。
- Processing 位于页面正文中部，由三条小型竖向柱组成，搭配 `OPTIMIZING MACROS`。柱形高度每 600ms 轻微变化；文字做 1.5s opacity pulse。
- Processing 最短周期 2s；请求在 processing 开始时启动。

### Preferences 到 Plan Ready

- 旧视图：600ms，`opacity 1 -> 0`，`translateY(0 -> -20px)`。
- 新视图：600ms，`opacity 0 -> 1`，`translateY(40px -> 0)`、`scale(.985 -> 1)`。
- easing：`cubic-bezier(.4, 0, .2, 1)`；不使用左右滑动、硬切或大幅缩放。

### Plan Ready reveal

- 顶部 header 先可见。
- Success Card、AI Insight、每日目标依次以 100ms、200ms、300ms 延迟，500ms fade-up（10px）进入。
- 里程碑随每日目标区以同一组轻量 reveal 出现。
- Calories 不做夸张零到目标数值计数。
- 宏量环初始为 0 arc，使用 stroke/dash 或小程序可兼容环形进度实现增长至目标；Protein、Carbs、Fat 分别延迟 100ms、160ms、220ms，单次 1000ms，`cubic-bezier(.4,0,.2,1)`。不旋转整个环。

## 固定操作区

- Plan Ready 使用独立正文滚动区与 fixed action bar。
- 操作区自上而下为「保存并更新目标」与「调整计划参数」。
- 操作区背景为 warm off-white，必要时只采用极浅顶部渐隐；不使用重阴影或毛玻璃。
- 使用现有安全区 token / `env(safe-area-inset-bottom)`，不写死设备高度。
- 正文底部 padding 至少覆盖操作区实高和安全区，保证最后的里程碑可以完整滚动到按钮上方。
- 页面内部限定 z-index：正文 < processing < fixed action；Header 保持既有层级。

## 微信兼容替代

- Stitch 的浏览器绝对屏幕和 DOM `setInterval` 改为 Taro `View`、React 状态和 SCSS keyframes / 定时器清理。
- 不使用 browser-only `backdrop-filter`、DOM 查询、SVG DOM 直接写入或系统 loading。
- 宏量环沿用或扩展现有 Taro-compatible `CircularProgress`，以可控的 arc 进度实现 draw。

## 验证

- 单元测试：状态迁移、最短 processing 周期、失败不进入 ready、重复触发被忽略、环的 stagger 和 fixed action contract。
- `lint`、`typecheck`、`weapp build`。
- 开发环境提供非生产可见的 replay 调用能力，重复执行 `ready -> processing -> transitioning -> ready`。
- 真机人工验收：iPhone 和 Android 的顶部安全区、固定 footer、正文滚动、无白屏、无布局跳动和 macro ring 绘制。
