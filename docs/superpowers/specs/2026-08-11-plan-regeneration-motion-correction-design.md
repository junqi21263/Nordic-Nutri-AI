# 计划重新生成动效修正设计

## 目标

将「饮食偏好」中的计划重生成流程改为 Stitch 参考录屏中的连续视图过渡。消除当前微信路由切换造成的可见白屏，并让固定 CTA 在 Plan Ready 首帧存在。

## 不在范围内

不改 API、营养计算、保存调用、偏好表单字段、现有文案或其他页面。

## 根因与边界

当前实现先在 `diet-preferences` 完成 processing，等待旧页退出后调用 `Taro.navigateTo`。新路由挂载前，旧页已经消失，因此产生约 1--1.5 秒白屏；Nutrition Plan 虽可读取 carried preview，但仍是第二个页面生命周期。

修正后不使用该路由作为视觉过渡：一个工作流页同时拥有 Preferences View 与 Plan Ready View。实际结果沿用本次 preview 响应，禁止对结果再发 preview 请求。

## 状态机

```text
idle -> processing -> transitioning -> ready
processing -> error -> idle
```

点击后立刻进入 `processing`，CTA 始终 disabled。真实 preview 请求与 2 秒最短 processing 周期并行；二者都成功后才进入 `transitioning`。新结果视图开始可见后，才进入 `ready`。失败不进入结果视图，并恢复既有错误提示。

## 视图与时间

- Preferences 在 processing 期间保持可辨识，最多轻微降低 opacity；三柱与 `OPTIMIZING MACROS` 是紧凑的独立整体。
- `transitioning` 中旧视图 240ms、轻微上移淡出；新视图在其开始后立即交叉淡入，整体 entrance 不超过 320ms。
- 不允许白屏；若有暖白背景过渡帧，只能来自交叉淡入且少于 300ms。
- Plan Ready 依次轻量显示 success、insight、daily target；总时长不超过 600ms。
- 三个宏量环从 0 arc 依序 draw（约 50--70ms stagger），不旋转整环或夸张计数。

## 固定操作区

Plan Ready 由独立滚动正文与同级 `FixedActionBar` 组成。操作区不属于 ScrollView，进入结果首帧即显示，纵向保留「保存并更新目标」「调整计划参数」，用 `env(safe-area-inset-bottom)` 处理安全区。正文底部 padding 覆盖固定栏实高与安全区，最后里程碑可完整滚至按钮上方。

## 验证

- 先用测试锁定：无导航过渡、状态时序、重复触发、失败、携带结果不二次请求、固定栏与正文避让、arc stagger。
- `lint`、`typecheck`、WeApp build。
- 真机录屏核验：processing 不提前结束、无肉眼可感知白屏、固定 CTA 首帧及滚动不动、底部内容不被遮挡。
