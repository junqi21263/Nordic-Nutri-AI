# Meal Saved Celebration 设计规格

## 范围

先实现一个独立的 Taro / 微信小程序兼容预览组件，不改变任何 `createProductMeal`、保存回调或路由。视觉确认后才单独接入 AI 分析结果页的「保存本餐」。

## 锁定的视觉合同

- Stitch 卡片：`#fbf9f4`，`24px` 圆角，`24px` 内边距，`1px #e4e2dd` 边框，`0 8px 32px rgba(23,49,36,.08)` 阴影。
- overlay：`rgba(27,28,25,.4)`，`blur(8px)`，全屏 fixed，层级高于本页固定元素。
- 100px 成功图标：40px 半径、4px `#2d4739` 环；先描环 600ms，再于 500ms 后描 400ms checkmark。
- 文案保留 Stitch 原文：`Meal saved!` / `Another meal added to today’s progress.` / `Today's Progress` / `View Meal` / `Continue`。
- 数字不写死，通过 props 注入；采用 `requestAnimationFrame` 以缓动连续增长。进度条用 `scaleX` 从保存前比例到保存后比例。

## 预览阶段交互

`visible` 从 `false` 变为 `true` 时重置并播放完整约 2.2 秒序列；变回 `false` 与卸载时取消 RAF 和 timeout。预览页只在非 production 环境出现在 pages 列表中，并提供 Replay Animation 按钮。两个 CTA 在预览阶段只关闭组件，不跳转或写数据。

## 校验标准

单测锁定：独立 API、计时表、动画重播/清理、Stitch 尺寸/颜色/层级和开发态入口；构建产物需通过 typecheck、unit、lint、weapp build 和 WXSS 校验。浏览器/H5 仅用于看节奏；微信开发者工具/真机仍是后续接入的视觉验收门槛。
