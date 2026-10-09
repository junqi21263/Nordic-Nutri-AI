# Android DEV 记录提醒页面 Stitch 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Android DEV APK 的记录提醒页面重构为用户提供的 Stitch Nordic Nutri Journal 视觉和交互，同时保持现有提醒业务、权限、本地存储和云端同步不变。

**Architecture:** 继续使用 Taro React 页面和现有 `PageLayout`、`AppCard`、`NordicIcon`、`BottomSheet`、`FeedbackHost`。页面只改变信息结构和样式；时间选择器保留现有滚轮数据与范围校验，改为 Stitch 的浅色底部面板；开关反馈直接复用全局 `FeedbackModal`，避免新增一套生命周期和遮罩系统。

**Tech Stack:** Taro 4、React、TypeScript、SCSS、Vitest、Capacitor Android、Gradle。

---

## 文件地图

- Modify: `mini-program/src/pages/smart-reminder-settings/index.tsx` — 将三张餐次卡片改为统一排程面板，接入中心反馈弹窗。
- Modify: `mini-program/src/pages/smart-reminder-settings/index.scss` — 实现 Stitch 的页面层级、统一面板、独立餐次行、小开关和进入动效。
- Modify: `mini-program/src/components/reminder-time-sheet/index.tsx` — 保留业务滚轮数据，调整标题、确认/取消语义和可访问标签以匹配新面板。
- Modify: `mini-program/src/components/reminder-time-sheet/index.scss` — 将现有深色全屏滚轮改为 Stitch 浅色底部时间面板，支持遮罩和上下拨动视觉。
- Modify: `mini-program/tests/smart-reminder-settings.test.ts` — 更新结构和交互断言，覆盖统一排程面板、反馈弹窗和三餐独立图标。

## Task 1: 先补页面结构契约测试

**Files:**
- Modify: `mini-program/tests/smart-reminder-settings.test.ts`

- [ ] **Step 1: 将旧的深色时间选择器断言改为 Stitch 时间面板断言**

保留 `ReminderTimeSheet`、`x-inverse`、`check-inverse` 和 `reminder-time-sheet__selection` 的功能断言，删除对 `background: #1d1d1f` 与 `#ff9f2d` 的旧风格要求，改为：

```ts
expect(styles).toContain("background: #f9faf7");
expect(styles).toContain("border-radius: 28px 28px 0 0");
expect(styles).toContain("reminder-time-sheet__selection");
expect(styles).toContain("#1c3f32");
```

- [ ] **Step 2: 为统一排程面板和反馈弹窗增加失败前断言**

在页面读取断言中加入：

```ts
expect(page).toContain("smart-reminder-settings__schedule-card");
expect(page).toContain("smart-reminder-settings__meal-row");
expect(page).toContain('variant: "success"');
expect(page).toContain('icon: "reminder-sunrise"');
expect(page).toContain('icon: "reminder-bowl"');
expect(page).toContain('icon: "reminder-tray"');
```

- [ ] **Step 3: 运行目标测试并确认新断言失败**

Run: `pnpm --dir mini-program test:unit -- smart-reminder-settings.test.ts`

Expected: FAIL because the current page still renders `smart-reminder-settings__row`, uses status feedback instead of a success modal, and the time sheet still has the old dark background.

## Task 2: 重构页面 JSX 和开关反馈

**Files:**
- Modify: `mini-program/src/pages/smart-reminder-settings/index.tsx`

- [ ] **Step 1: 把成功反馈改为全局中心弹窗配置**

在 `commit` 中保留本地保存、`saveProductSettings` 和 `refreshAndroidSmartReminders`，将最后的状态提示替换为：

```ts
showModal({
  variant: "success",
  title: `${label}${scopeValue(next, scope) ? "已开启" : "已关闭"}`,
  description: scope === "master"
    ? (next.enabled ? "会在对应餐次还没记录时轻轻提醒" : "之后不会再发送记录提醒")
    : (scopeValue(next, scope) ? `每天 ${next.meals[scope].time} 轻轻提醒记录` : "该餐次提醒已关闭"),
  primaryText: "好的",
  dismissible: true,
});
```

异步刷新失败仍调用 `showFeedback`，但使用 `presentation: "status"`，确保失败信息不覆盖成功弹窗的生命周期。

- [ ] **Step 2: 将每个餐次改为统一面板中的一行**

使用一个 `AppCard` 作为 `smart-reminder-settings__schedule-card`，并在 `mealRows.map` 中渲染如下结构：

```tsx
<View className="smart-reminder-settings__meal-row" key={type}>
  <View className="smart-reminder-settings__meal-main">
    <View className={`smart-reminder-settings__meal-icon smart-reminder-settings__meal-icon--${type}`}>
      <NordicIcon name={icon} size={20} ariaLabel={window.label} />
    </View>
    <View className="smart-reminder-settings__meal-copy">
      <View className="smart-reminder-settings__meal-title-row">
        <Text className="smart-reminder-settings__meal-name">{window.label}</Text>
        <Text className="smart-reminder-settings__window-chip">{window.start}–{window.end}</Text>
      </View>
      <View
        className={`smart-reminder-settings__time ${row?.enabled && settings?.enabled ? "smart-reminder-settings__time--active" : ""}`}
        onClick={() => setEditingMealType(type)}
        ariaLabel={`修改${window.label}提醒时间`}
      >
        <Text>提醒于 {row?.time ?? "--:--"}</Text>
        <Text className="smart-reminder-settings__time-action">修改 ›</Text>
      </View>
    </View>
  </View>
  {row ? <ReminderToggle checked={row.enabled} label={window.label} onChange={(checked) => { void toggle(type, checked); }} /> : null}
</View>
```

每行之间由 SCSS 的 hairline 分隔；不再为每个餐次创建单独 `AppCard`。

- [ ] **Step 3: 保留总开关和错误权限逻辑，替换页面结构类名**

总开关继续放在 `smart-reminder-settings__master-card` 中；说明文字改为 Stitch 源文件的短句：“在需要的时候，轻轻提醒你。”和“记录完成后，当天对应提醒会自动跳过。”。将餐次列表容器改为 `smart-reminder-settings__schedule-section`，并显示“餐次提醒”和已启用数量。

- [ ] **Step 4: 运行 TypeScript 和目标测试**

Run: `pnpm --dir mini-program typecheck && pnpm --dir mini-program test:unit -- smart-reminder-settings.test.ts`

Expected: typecheck passes and the target test still fails only on the not-yet-updated SCSS/time-sheet assertions.

## Task 3: 实现 Stitch 页面视觉层和进入/开关动效

**Files:**
- Modify: `mini-program/src/pages/smart-reminder-settings/index.scss`

- [ ] **Step 1: 用项目变量覆盖页面层级**

页面使用 `#f9faf7` 背景、16px 页面间距和 24px 区块节奏；说明卡使用 `#e8f0e8`，排程面板使用白色、22px 圆角和极轻森林色阴影。保留项目 token，不引入远程字体或新的依赖。

- [ ] **Step 2: 将开关改为 44x24 并做弹性滑动**

```scss
.reminder-toggle {
  flex: 0 0 44px;
  height: 24px;
  padding: 2px;
  background: rgba($color-text-primary, 0.16);
  transition: background-color 220ms $ease-standard;
}
.reminder-toggle__thumb {
  height: 20px;
  width: 20px;
  transition: transform 240ms cubic-bezier(0.34, 1.3, 0.64, 1);
}
.reminder-toggle--checked .reminder-toggle__thumb { transform: translateX(20px); }
```

为开关添加 `aria` 状态和按压反馈，但不改变触摸目标外层尺寸。

- [ ] **Step 3: 添加页面 staggered reveal 和 reduced-motion 分支**

为说明卡、排程面板和底部说明设置 `animation: smart-reminder-reveal 360ms $ease-progress both`，分别使用 0ms、70ms、140ms 延迟；`@media (prefers-reduced-motion: reduce)` 下将动画时长降为 0，并保留最终可见状态。

- [ ] **Step 4: 添加统一排程行、chip 和底部说明样式**

餐次图标为 40x40，三种图标使用独立色调；餐次标题与允许时间 chip 同一行；时间入口使用 `#f2ebe1` 背景、12px 圆角、48px 最小触摸高度。排程面板内部行高、左右边距和分隔线完全对齐，关闭总开关时只降低内容对比度，不隐藏时间入口。

- [ ] **Step 5: 运行颜色、字体和图标审计**

Run: `rg -n -i 'violet|purple|indigo|fuchsia|Inter|Roboto|system-ui|Arial|🚀|⭐|❤️|👍|🔥|💡|🎉|✨' mini-program/src/pages/smart-reminder-settings/index.scss mini-program/src/pages/smart-reminder-settings/index.tsx`

Expected: no matches. Existing project font fallback tokens are allowed because they are the established Android/Chinese brand stack; this page must not add a new forbidden font declaration or emoji icon.

## Task 4: 将时间弹窗改为 Stitch 自定义底部拨轮

**Files:**
- Modify: `mini-program/src/components/reminder-time-sheet/index.tsx`
- Modify: `mini-program/src/components/reminder-time-sheet/index.scss`

- [ ] **Step 1: 保持时间范围和滚轮计算逻辑不变**

继续使用 `clampReminderTime`、`getReminderTimeOptions`、`reminderWheelIndexFromScrollTop` 和 `reminderWheelScrollTop`。小时仍按餐次窗口生成，分钟仍按 5 分钟生成；不要引入系统时间选择器。

- [ ] **Step 2: 调整弹窗结构文案和操作语义**

底部面板保留拖拽条、关闭按钮、确认按钮和两个上下滚轮；标题使用“调整{餐次}提醒”，副标题使用“可选 HH:mm–HH:mm”，确认按钮可访问标签使用“保存提醒时间”，关闭按钮使用“取消调整时间”。确认继续调用 `onConfirm(clampReminderTime(mealType, draft))`。

- [ ] **Step 3: 应用 Stitch 浅色底部面板样式**

面板使用 `background: #f9faf7`、`border-radius: 28px 28px 0 0`、顶部拖拽条和 `#1c3f32` 主操作色。滚轮使用白色内层、中心选中胶囊、上下渐隐遮罩；选中值使用森林绿，未选中值使用辅助灰。面板高度根据屏幕可用空间限制在 520px 左右，不覆盖系统安全区。

- [ ] **Step 4: 添加弹窗进出和 reduced-motion 动画**

保留 `BottomSheet` 的挂载/卸载生命周期，在组件样式中实现 `translateY` 上滑进入和关闭；`prefers-reduced-motion: reduce` 下禁用 transform 动画。背景遮罩只阻止底层滚动，不阻止滚轮自己的滚动。

- [ ] **Step 5: 运行时间选择器与页面测试**

Run: `pnpm --dir mini-program test:unit -- smart-reminder-settings.test.ts`

Expected: PASS，且断言证明使用自定义滚轮、Stitch 浅色面板、三餐独立 SVG 图标和中心成功弹窗。

## Task 5: 补充行为测试并完成 Android DEV 验收

**Files:**
- Modify: `mini-program/tests/smart-reminder-settings.test.ts`
- Modify: `mini-program/src/pages/smart-reminder-settings/index.tsx` only if a test exposes a real contract mismatch.

- [ ] **Step 1: 增加设置状态持久化契约断言**

确认页面仍包含：

```ts
expect(page).toContain("smartReminderStorage.load(userId)");
expect(page).toContain("smartReminderStorage.save(userId, next)");
expect(page).toContain("refreshAndroidSmartReminders");
expect(page).toContain("requestAndroidReminderPermission");
```

- [ ] **Step 2: 运行完整前端检查**

Run: `pnpm --dir mini-program typecheck`

Expected: PASS。

Run: `pnpm --dir mini-program test:unit`

Expected: PASS，既有页面、反馈弹窗和提醒领域测试全部通过。

- [ ] **Step 3: 构建 Android DEV H5 资源**

Run: `pnpm --dir mini-program build:android`

Expected: H5 bundle builds successfully without adding remote asset requests.

- [ ] **Step 4: 构建并安装 DEV APK**

Run from `android/`: `./gradlew assembleDebug`

Expected: `android/app/build/outputs/apk/debug/app-debug.apk` exists and Gradle exits 0.

Install with the connected device using the approved ADB target, then verify the package is `com.lewislee.nordicnutri.dev` and the APK launches to the existing authenticated session.

- [ ] **Step 5: Perform focused real-device acceptance**

On the Android DEV APK:

1. Open “我的” → “记录提醒”.
2. Verify the Stitch-inspired header, explanation card, single aligned schedule panel, three independent icons, and 44x24 switches.
3. Toggle total reminders on and off; verify the center animated success modal says the correct state.
4. Toggle breakfast, lunch, and dinner independently; verify each modal names the correct meal.
5. Open each “修改” action; swipe hour and minute wheels vertically, cancel once, then confirm a valid time.
6. Leave and reopen the page; verify each switch and time remains unchanged.
7. Deny notification permission in a controlled test; verify the error modal remains readable and the page does not silently change state.

Record build/install evidence separately from visual and behavioral acceptance; a successful build alone is not acceptance of the UI.

## Task 6: Review the diff and commit only the scoped implementation

- [ ] **Step 1: Inspect changed files and protect unrelated work**

Run: `git status --short; git diff --check -- mini-program/src/pages/smart-reminder-settings/index.tsx mini-program/src/pages/smart-reminder-settings/index.scss mini-program/src/components/reminder-time-sheet/index.tsx mini-program/src/components/reminder-time-sheet/index.scss mini-program/tests/smart-reminder-settings.test.ts`

Expected: only the listed implementation/test files are staged for this feature; existing unrelated dirty files remain unstaged.

- [ ] **Step 2: Commit the implementation**

```bash
git add mini-program/src/pages/smart-reminder-settings/index.tsx \
  mini-program/src/pages/smart-reminder-settings/index.scss \
  mini-program/src/components/reminder-time-sheet/index.tsx \
  mini-program/src/components/reminder-time-sheet/index.scss \
  mini-program/tests/smart-reminder-settings.test.ts
git commit -m "feat: redesign Android smart reminder settings"
```

If the existing worktree Git lock permission error recurs, leave the files and report the exact blocked path; do not stage or commit unrelated changes.
