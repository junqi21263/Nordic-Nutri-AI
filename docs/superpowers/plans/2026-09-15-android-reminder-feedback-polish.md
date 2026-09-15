# Android Reminder Feedback Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正记录提醒页面四处视觉问题，并为关闭提醒提供与开启动画完全独立的反馈弹窗。

**Architecture:** 保留 `ReminderAlarmModal` 只处理开启/调时反馈；新增 `ReminderPausedModal` 只处理关闭反馈。页面根据 `alarmFeedback.enabled` 分流两个组件，提醒保存、权限、Push 和同步逻辑保持不变。

**Tech Stack:** Taro 4、React、TypeScript、SCSS、Vitest、Capacitor Android。

---

### Task 1: 固化反馈行为契约

**Files:**
- Modify: `mini-program/tests/smart-reminder-settings.test.ts`

- [ ] 增加失败断言：页面不含 `smart-reminder-settings__capsule`，说明图标有专用容器，关闭反馈使用 `ReminderPausedModal`。
- [ ] 增加失败断言：关闭弹窗不含 `animate-alarm-wobble` 或 `animate-ripple`，并包含单行文案类和独立收拢动画类。
- [ ] 运行 `pnpm --dir mini-program exec vitest run tests/smart-reminder-settings.test.ts --reporter=dot`，确认因功能尚未实现而失败。

### Task 2: 修正页面结构和反馈分流

**Files:**
- Modify: `mini-program/src/pages/smart-reminder-settings/index.tsx`
- Modify: `mini-program/src/pages/smart-reminder-settings/index.scss`

- [ ] 删除头部右侧胶囊 JSX 与全部胶囊样式，使用等宽右侧占位保持标题居中。
- [ ] 将说明图标包在 `smart-reminder-settings__hint-icon` 中，以固定 16px 盒模型与正文视觉中线对齐。
- [ ] 保留 `alarmFeedback` 数据结构；`enabled=true` 渲染 `ReminderAlarmModal`，`enabled=false` 渲染 `ReminderPausedModal`。

### Task 3: 新增独立关闭反馈弹窗

**Files:**
- Create: `mini-program/src/components/reminder-paused-modal/index.tsx`
- Create: `mini-program/src/components/reminder-paused-modal/index.scss`
- Create: `mini-program/src/assets/icons/bell-off.svg`
- Modify: `mini-program/src/components/nordic-icon/index.tsx`

- [ ] 新增本地 `bell-off` SVG 并注册到 `NordicIconName`。
- [ ] 新增关闭弹窗，保留遮罩、点击关闭、4.5 秒自动关闭和 reduced-motion 支持。
- [ ] 视觉使用雾绿静音铃铛、向内收拢双环和斜杠绘制；不得引用开启动画类。
- [ ] 主说明 `之后可以随时重新开启` 设置 `white-space: nowrap`。

### Task 4: 验证并构建 DEV APK

**Files:**
- Verify all scoped files above.

- [ ] 重新运行目标测试，预期 6 个测试全部通过。
- [ ] 运行 `pnpm --dir mini-program typecheck`，预期退出码 0。
- [ ] 运行 `pnpm --dir mini-program build:android`、`pnpm exec cap copy android` 和 `android/gradlew assembleDebug`。
- [ ] 安装 `android/app/build/outputs/apk/debug/app-debug.apk` 到 `com.lewislee.nordicnutri.dev`，将真机视觉验收与构建成功分别报告。
