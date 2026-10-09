# Android Smart Meal Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-controlled Android APK meal-reminder feature with a master notification switch, independent breakfast/lunch/dinner switches, constrained times, local notification scheduling, meal-record synchronization, and login/logout isolation.

**Architecture:** Keep reminder rules and copy selection in a pure feature module. Persist settings locally by authenticated account ID, use Capacitor Local Notifications only on Android, and expose one coordinator that rebuilds today’s schedule from current settings and meals. The WeChat Mini Program continues to render its existing pages and does not receive reminder behavior.

**Tech Stack:** Taro React/TypeScript, Zustand, Capacitor 8 Local Notifications, Android Gradle, Vitest.

---

### Task 1: Add the pure reminder domain and tests

**Files:**
- Create: `mini-program/src/features/smart-reminders/domain.ts`
- Test: `mini-program/src/features/smart-reminders/domain.test.ts`

- [ ] **Step 1: Write failing tests** for default settings, inclusive time windows, invalid times, stable IDs, recorded-meal skipping, no same-day catch-up, and ordinary/missed/consistent copy priority.

- [ ] **Step 2: Run the focused test**

Run: `pnpm --dir mini-program test:unit -- smart-reminders/domain.test.ts`
Expected: FAIL because the reminder domain does not exist yet.

- [ ] **Step 3: Implement the smallest pure API**

Implement `MealReminderType`, `SmartReminderSettings`, `REMINDER_WINDOWS`, `DEFAULT_SMART_REMINDER_SETTINGS`, `isReminderTimeInWindow`, `getReminderNotificationId`, `getReminderCopy`, and `buildTodayReminderCandidates`. The builder must return only enabled, unrecorded meal types whose selected time is still in the future, and must not include snack.

- [ ] **Step 4: Run the focused test**

Run: `pnpm --dir mini-program test:unit -- smart-reminders/domain.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the domain slice**

Run: `git add -- mini-program/src/features/smart-reminders/domain.ts mini-program/src/features/smart-reminders/domain.test.ts && git commit --only mini-program/src/features/smart-reminders/domain.ts mini-program/src/features/smart-reminders/domain.test.ts -m "feat: add smart reminder rules"`

### Task 2: Add account-isolated local settings and Android notification adapter

**Files:**
- Create: `mini-program/src/features/smart-reminders/storage.ts`
- Create: `mini-program/src/platform/android-smart-reminders.ts`
- Test: `mini-program/src/features/smart-reminders/storage.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `android/app/src/main/AndroidManifest.xml` only if the synced plugin does not provide notification permission

- [ ] **Step 1: Write failing storage tests** for default settings, account isolation, round-trip persistence, and reset behavior using an injected storage double.

- [ ] **Step 2: Run the focused test**

Run: `pnpm --dir mini-program test:unit -- smart-reminders/storage.test.ts`
Expected: FAIL because storage does not exist yet.

- [ ] **Step 3: Install the Capacitor dependency**

Run: `pnpm add @capacitor/local-notifications@^8.0.0`
Expected: root `package.json` and `pnpm-lock.yaml` contain the plugin; existing dependency versions remain unchanged.

- [ ] **Step 4: Implement storage and adapter**

Persist `{ [userId]: SmartReminderSettings }` under one namespaced Taro storage key. The adapter must dynamically use Capacitor only when `Capacitor.isNativePlatform()` is true, request/check notification permission, create one Android channel, schedule candidates, cancel stable IDs, cancel all reminder IDs, and register notification-action callbacks. Web/Mini Program calls must resolve as no-ops.

- [ ] **Step 5: Run storage and type checks**

Run: `pnpm --dir mini-program test:unit -- smart-reminders/storage.test.ts` and `pnpm typecheck:mini-program`
Expected: PASS with no new TypeScript errors.

- [ ] **Step 6: Commit the adapter slice**

Run: `git add -- package.json pnpm-lock.yaml mini-program/src/features/smart-reminders/storage.ts mini-program/src/features/smart-reminders/storage.test.ts mini-program/src/platform/android-smart-reminders.ts android/app/src/main/AndroidManifest.xml && git commit --only package.json pnpm-lock.yaml mini-program/src/features/smart-reminders/storage.ts mini-program/src/features/smart-reminders/storage.test.ts mini-program/src/platform/android-smart-reminders.ts android/app/src/main/AndroidManifest.xml -m "feat: add Android local reminder adapter"`

### Task 3: Add the reminder coordinator and lifecycle hooks

**Files:**
- Create: `mini-program/src/features/smart-reminders/coordinator.ts`
- Test: `mini-program/src/features/smart-reminders/coordinator.test.ts`
- Modify: `mini-program/src/app.tsx`
- Modify: `mini-program/src/auth/session-manager.ts`
- Modify: `mini-program/src/pages/android-auth/index.tsx`
- Modify: `mini-program/src/pages/home/index.tsx`
- Modify: `mini-program/src/pages/meal-records/index.tsx`
- Modify: `mini-program/src/pages/manual-meal/index.tsx`
- Modify: `mini-program/src/pages/analysis-result/index.tsx`
- Modify: `mini-program/src/pages/portion-adjustment/index.tsx`

- [ ] **Step 1: Write failing coordinator tests** for rebuilding only the current account’s schedule, cancelling the meal reminder after a successful save, clearing on logout, and routing a lunch notification click to `/pages/manual-meal/index?mealType=lunch&reminder=1`.

- [ ] **Step 2: Run the focused test**

Run: `pnpm --dir mini-program test:unit -- smart-reminders/coordinator.test.ts`
Expected: FAIL because the coordinator does not exist yet.

- [ ] **Step 3: Implement the coordinator**

Expose `initializeAndroidSmartReminders`, `refreshAndroidSmartReminders`, `cancelAndroidSmartReminders`, and `refreshAndroidSmartRemindersForCurrentUser`. Each refresh reads the authenticated user, account settings, and `useMealStore.getState().meals`, cancels the three stable IDs, then schedules only future candidates. Login and app resume rebuild; successful meal sync rebuilds; sign-out cancels before clearing auth; notification action routes to the manual record page with the meal type preselected.

- [ ] **Step 4: Wire lifecycle and record events**

Initialize the listener from Android app launch, rebuild after native login and after Home/Records data sync, and call refresh only after successful manual, vision, repeat, or edited meal saves. Do not call the coordinator from failed API requests.

- [ ] **Step 5: Run focused tests and type check**

Run: `pnpm --dir mini-program test:unit -- smart-reminders/coordinator.test.ts` and `pnpm typecheck:mini-program`
Expected: PASS.

- [ ] **Step 6: Commit the coordinator slice**

Run: `git add -- mini-program/src/features/smart-reminders/coordinator.ts mini-program/src/features/smart-reminders/coordinator.test.ts mini-program/src/app.tsx mini-program/src/auth/session-manager.ts mini-program/src/pages/android-auth/index.tsx mini-program/src/pages/home/index.tsx mini-program/src/pages/meal-records/index.tsx mini-program/src/pages/manual-meal/index.tsx mini-program/src/pages/analysis-result/index.tsx mini-program/src/pages/portion-adjustment/index.tsx && git commit --only mini-program/src/features/smart-reminders/coordinator.ts mini-program/src/features/smart-reminders/coordinator.test.ts mini-program/src/app.tsx mini-program/src/auth/session-manager.ts mini-program/src/pages/android-auth/index.tsx mini-program/src/pages/home/index.tsx mini-program/src/pages/meal-records/index.tsx mini-program/src/pages/manual-meal/index.tsx mini-program/src/pages/analysis-result/index.tsx mini-program/src/pages/portion-adjustment/index.tsx -m "feat: sync Android meal reminders with account state"`

### Task 4: Add the Android reminder settings page and APK entry

**Files:**
- Create: `mini-program/src/pages/smart-reminder-settings/index.tsx`
- Create: `mini-program/src/pages/smart-reminder-settings/index.scss`
- Modify: `mini-program/src/app.config.ts`
- Modify: `mini-program/src/pages/profile/index.tsx`
- Test: `mini-program/tests/smart-reminder-settings.test.ts`

- [ ] **Step 1: Write failing page contract tests** for the Android-only profile entry, master “记录提醒” switch, breakfast/lunch/dinner rows, allowed time ranges, independent switches, and permission-failure feedback copy.

- [ ] **Step 2: Run the focused test**

Run: `pnpm --dir mini-program test:unit -- smart-reminder-settings.test.ts`
Expected: FAIL because the page and entry do not exist yet.

- [ ] **Step 3: Implement the page**

Use the existing `PageLayout`, `AppCard`, `Switch`, and `Picker mode="time"` styles. Show a master “记录提醒” switch with helper text “仅在未记录对应餐次时提醒”，three meal rows with independent switches and time pickers, window labels, and immediate persistence. Keep the master off by default. When enabling the master or a meal row, request notification permission first; on denial leave the effective switch off and show the shared feedback modal with a system-settings hint. Reject times outside the meal window and keep the previous valid time.

- [ ] **Step 4: Register and expose only on Android**

Register the route in `app.config.ts`, but render the profile entry only when `TARO_APP_PLATFORM === "android"`. The Mini Program keeps its existing profile layout and reminder behavior.

- [ ] **Step 5: Run focused page tests and type check**

Run: `pnpm --dir mini-program test:unit -- smart-reminder-settings.test.ts` and `pnpm typecheck:mini-program`
Expected: PASS.

- [ ] **Step 6: Commit the settings UI slice**

Run: `git add -- mini-program/src/pages/smart-reminder-settings mini-program/src/app.config.ts mini-program/src/pages/profile/index.tsx mini-program/tests/smart-reminder-settings.test.ts && git commit --only mini-program/src/pages/smart-reminder-settings mini-program/src/app.config.ts mini-program/src/pages/profile/index.tsx mini-program/tests/smart-reminder-settings.test.ts -m "feat: add Android reminder settings"`

### Task 5: Build, sync, install, and verify the APK

**Files:**
- Build output: `mini-program/dist/h5`, `android/app/build/outputs/apk/debug/app-debug.apk`
- Optional artifact: `artifacts/nordic-nutri-dev-<timestamp>-smart-reminders.apk`

- [ ] **Step 1: Run the full focused regression set**

Run: `pnpm --dir mini-program test:unit -- smart-reminders` and `pnpm typecheck:mini-program`
Expected: all reminder tests pass and TypeScript exits 0.

- [ ] **Step 2: Build the Android H5 package against DEV**

Run: `TARO_APP_API_BASE_URL=https://test-dev-d4gyxnn0b5dfa2c8a.service.tcloudbase.com pnpm --dir mini-program build:android`
Expected: H5 build completes and includes the settings route.

- [ ] **Step 3: Sync Capacitor and build Debug APK**

Run: `pnpm exec cap sync android` then `./android/gradlew -p android assembleDebug`
Expected: plugin sync succeeds and `android/app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 4: Install to the confirmed wireless-debug device**

Run: `/opt/local/bin/adb -s 192.168.1.25:37613 install -r android/app/build/outputs/apk/debug/app-debug.apk`
Expected: `Success`.

- [ ] **Step 5: Report verification gates separately**

Report source branch, build result, install result, and whether actual device interactions were clicked. Do not claim notification permission, scheduled delivery, notification tap routing, or account-isolation behavior as verified unless captured from the device.
