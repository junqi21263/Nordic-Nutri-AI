# “我的”模块补齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐“我的节奏”的编辑资料、调整目标、成就中心与本周回顾页面；移除无关设置，并把隐私、反馈、关于入口改为完整本地弹窗。

**Architecture:** `pages/profile/index.tsx` 继续作为“我的”模块的导航页，使用 `Taro.navigateTo` 进入四个独立路由。编辑资料和调整目标只调用现有 Zustand `profile-store` 的 `setProfile`；成就和周回顾只从现有 fixture/store 计算展示数据。三类辅助信息保留在主页的单层 `Modal` 中，不新增服务端接口、持久化协议或账号能力。

**Tech Stack:** Taro React、TypeScript、Zustand、Vitest、现有 `PageLayout` / `Modal` / `AppCard` / `NordicIcon` 组件、SCSS。

---

### Task 1: 锁定“我的”主页精简与四页路由契约

**Files:**
- Modify: `mini-program/tests/coach-profile.test.ts`
- Modify: `mini-program/src/app.config.ts`
- Modify: `mini-program/src/pages/profile/index.tsx`

- [ ] **Step 1: 写入失败的页面契约测试**

  在 `mini-program/tests/coach-profile.test.ts` 加入对四个页面路由、主页跳转入口和弹窗入口的断言；同时断言旧设置不再出现：

  ```ts
  it("routes the profile hub to complete local profile pages without legacy settings", () => {
    const appConfig = readFileSync(resolve(import.meta.dirname, "../src/app.config.ts"), "utf8");
    const source = readFileSync(resolve(import.meta.dirname, "../src/pages/profile/index.tsx"), "utf8");

    ["profile-edit", "goal-adjust", "achievements", "weekly-review"].forEach((page) => {
      expect(appConfig).toContain(`pages/${page}/index`);
      expect(source).toContain(`/pages/${page}/index`);
    });
    expect(source).toContain('title="隐私与数据"');
    expect(source).toContain('title="反馈与帮助"');
    expect(source).toContain('title="关于我们"');
    expect(source).not.toContain('title="主题"');
    expect(source).not.toContain('title="语言"');
    expect(source).not.toContain('title="提醒"');
    expect(source).not.toContain("导出本地数据");
  });
  ```

- [ ] **Step 2: 运行测试并确认失败原因是新路由和入口尚未实现**

  Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

  Expected: FAIL，且失败信息指出 `pages/profile-edit/index` 或主页对应跳转文本缺失。

- [ ] **Step 3: 注册页面路由并改造主页入口**

  在 `mini-program/src/app.config.ts` 的 `pages` 数组、`pages/profile/index.tsx` 中完成以下最小实现：

  ```ts
  "pages/profile-edit/index",
  "pages/goal-adjust/index",
  "pages/achievements/index",
  "pages/weekly-review/index",
  ```

  ```tsx
  const [activeModal, setActiveModal] = useState<"privacy" | "feedback" | "about" | null>(null);
  const openPage = (url: string) => void Taro.navigateTo({ url });

  <View onClick={() => openPage("/pages/profile-edit/index")}>...</View>
  <View onClick={() => openPage("/pages/goal-adjust/index")}>...</View>
  <Text onClick={() => openPage("/pages/achievements/index")}>...</Text>
  <View onClick={() => openPage("/pages/weekly-review/index")}>...</View>
  ```

  删除主题、语言、提醒、导出按钮及其处理函数。保留三个 `ListItem`，点击时设置 `activeModal`。

- [ ] **Step 4: 验证主页契约通过**

  Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

  Expected: PASS，所有 `local coach and profile` 测试通过。

### Task 2: 建立三个完整且可关闭的本地信息弹窗

**Files:**
- Modify: `mini-program/tests/coach-profile.test.ts`
- Modify: `mini-program/src/pages/profile/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: 写入失败的弹窗内容测试**

  在主页契约旁加入：

  ```ts
  it("keeps privacy, feedback and about as complete local modals", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/pages/profile/index.tsx"), "utf8");

    expect(source).toContain('activeModal === "privacy"');
    expect(source).toContain("数据仅保留在当前设备");
    expect(source).toContain('activeModal === "feedback"');
    expect(source).toContain("提交反馈");
    expect(source).toContain('activeModal === "about"');
    expect(source).toContain("Nordic Nutri AI 是一款本地体验中的营养记录工具");
  });
  ```

- [ ] **Step 2: 运行测试并确认它因弹窗内容缺失而失败**

  Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

  Expected: FAIL，断言 `activeModal === "privacy"` 或说明文案不存在。

- [ ] **Step 3: 实现弹窗内容和本地反馈提交**

  使用现有 `Modal`、`AppButton`、`Input` 和 `feedback.show`：

  ```tsx
  <Modal open={activeModal === "privacy"}>
    <Text className="profile-modal__title">隐私与数据</Text>
    <Text>数据仅保留在当前设备，不会在当前体验版中上传或共享。</Text>
    <Text>你可以随时通过微信小程序设置清理本地缓存。</Text>
    <AppButton onClick={() => setActiveModal(null)}>知道了</AppButton>
  </Modal>
  ```

  反馈弹窗包含一行帮助说明、受控 `Input` 和 `提交反馈`；提交空内容时提示“请先写下你的问题或建议”，有内容时只清空本地输入、关闭弹窗并显示“感谢你的反馈”。关于弹窗说明本地体验范围、当前功能与产品理念。每个弹窗仅有一个底部主操作，不添加右上角“关闭”。

- [ ] **Step 4: 添加窄范围弹窗样式**

  在 `mini-program/src/styles/page.scss` 添加 `.profile-modal` 命名空间：正文行高、信息提示块、反馈输入框和单一底部主按钮；沿用 `#153f2b`、`#f3eadc`、`#faf9f6`，不修改共享 `Modal`。

- [ ] **Step 5: 验证弹窗契约通过**

  Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

  Expected: PASS，弹窗文案和交互结构的断言通过。

### Task 3: 实现编辑资料和调整目标页面

**Files:**
- Create: `mini-program/src/pages/profile-edit/index.tsx`
- Create: `mini-program/src/pages/goal-adjust/index.tsx`
- Modify: `mini-program/tests/coach-profile.test.ts`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: 写入失败的表单页测试**

  新增测试：

  ```ts
  it("provides local profile and goal forms backed by the profile store", () => {
    const profileEdit = readFileSync(resolve(import.meta.dirname, "../src/pages/profile-edit/index.tsx"), "utf8");
    const goalAdjust = readFileSync(resolve(import.meta.dirname, "../src/pages/goal-adjust/index.tsx"), "utf8");

    expect(profileEdit).toContain("profile.setProfile");
    expect(profileEdit).toContain("保存资料");
    expect(goalAdjust).toContain("profile.setProfile");
    expect(goalAdjust).toContain("保存目标");
  });
  ```

- [ ] **Step 2: 运行测试并确认两个源文件尚不存在**

  Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

  Expected: FAIL，报出 `profile-edit/index.tsx` 与 `goal-adjust/index.tsx` 无法读取。

- [ ] **Step 3: 创建编辑资料页面**

  `profile-edit/index.tsx` 使用 `PageLayout`（`showTabs={false}`）和 `navigateBackOrHome("/pages/profile/index")`。初始化昵称、当前体重和当前目标；提供增肌、减脂、保持三个可点选的目标标签。保存时执行：

  ```ts
  profile.setProfile({
    nickname: nickname.trim() || profile.profile.nickname,
    weight: nextWeight,
    goalLabel,
  });
  ```

  体重必须是 `30`–`300` 的有效数字；无效时调用 `feedback.show({ message: "请输入 30–300 kg 的体重", tone: "error" })`，有效时显示成功提示后返回。

- [ ] **Step 4: 创建调整目标页面**

  `goal-adjust/index.tsx` 展示当前体重、目标体重、每日热量。保存前验证目标体重 `30`–`300`、热量 `1000`–`6000`；通过后执行：

  ```ts
  profile.setProfile({ targetWeight: nextTargetWeight, targetCalories: nextCalories });
  ```

  成功提示“目标已更新，继续保持节奏”后返回个人页；验证失败用已有 feedback toast 提示原因。

- [ ] **Step 5: 添加共享表单页样式**

  在 `page.scss` 增加 `.profile-flow`、`.profile-form`、`.profile-choice`、`.profile-form__summary`：保持暖白背景、深绿主按钮、胶囊选择项，不影响现有 onboarding 表单。

- [ ] **Step 6: 验证资料与目标页面契约通过**

  Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

  Expected: PASS，两个页面读取成功且包含本地保存行为。

### Task 4: 实现成就中心和本周回顾页面

**Files:**
- Create: `mini-program/src/pages/achievements/index.tsx`
- Create: `mini-program/src/pages/weekly-review/index.tsx`
- Modify: `mini-program/src/features/coach/domain.ts`
- Modify: `mini-program/tests/coach-profile.test.ts`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: 写入失败的成就和回顾页面测试**

  新增测试：

  ```ts
  it("turns local achievements and meals into complete profile review pages", () => {
    const achievements = readFileSync(resolve(import.meta.dirname, "../src/pages/achievements/index.tsx"), "utf8");
    const weeklyReview = readFileSync(resolve(import.meta.dirname, "../src/pages/weekly-review/index.tsx"), "utf8");

    expect(achievements).toContain("全部成就");
    expect(achievements).toContain("createAchievements");
    expect(weeklyReview).toContain("本周回顾");
    expect(weeklyReview).toContain("基于当前设备中的记录");
  });
  ```

- [ ] **Step 2: 运行测试并确认两页尚不存在**

  Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

  Expected: FAIL，报出 `achievements/index.tsx` 与 `weekly-review/index.tsx` 无法读取。

- [ ] **Step 3: 创建成就中心**

  从 `useAchievementStore` 或 `createAchievements(meals.meals, date)` 取完整列表，按已解锁和待解锁依次展示，顶部显示 `{unlocked}/{total}` 和“继续记录，让每一餐都成为节奏”。将现有成就标题统一为中文（例如 `Protein Master` 改为“蛋白达人”、`7 Day Streak` 改为“连续七天”），但保持 20 项成就及其解锁规则不变。

- [ ] **Step 4: 创建本周回顾**

  用 `useMealStore().meals`、当天营养总结和当前 profile 计算可解释的本地指标：已记录餐次、蛋白完成度、目标热量、营养节奏分。页面显示三条明确的本地观察和一段“本周建议”，底部标记“基于当前设备中的记录生成”。不要伪造周度服务端历史或使用 AI/云端请求。

- [ ] **Step 5: 添加成就和回顾样式**

  在 `page.scss` 增加 `.achievement-center` 和 `.weekly-review` 命名空间：小型成就格、解锁/未解锁视觉状态、深绿回顾摘要、自然米色的建议块。保持现有圆角、细描边、低饱和阴影节奏。

- [ ] **Step 6: 验证成就与回顾契约通过**

  Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

  Expected: PASS，完整成就和回顾页能从源码契约中被识别。

### Task 5: 全量验证、构建与小程序产物检查

**Files:**
- Verify: `mini-program/tests/coach-profile.test.ts`
- Verify: `mini-program/src/pages/profile/index.tsx`
- Verify: `mini-program/dist/weapp/`

- [ ] **Step 1: 运行完整单元测试**

  Run: `pnpm --dir mini-program run test:unit`

  Expected: PASS，所有 Vitest 测试文件通过。

- [ ] **Step 2: 运行静态检查**

  Run: `pnpm --dir mini-program run typecheck && pnpm --dir mini-program run lint`

  Expected: 两个命令均以 exit code 0 完成。

- [ ] **Step 3: 构建并检查微信开发者工具产物**

  Run: `pnpm --dir mini-program run build:weapp && pnpm --dir mini-program run verify:weapp`

  Expected: 构建成功，`mini-program/dist/weapp/` 包含新页面产物且验证脚本通过。

- [ ] **Step 4: 需求逐项复核**

  逐项确认：主题/语言/提醒/导出已从主页移除；三项辅助入口是有完整文案的弹窗；四个主页面均存在、可由主页进入、只操作本地数据；无后端、导出或云端改动。
