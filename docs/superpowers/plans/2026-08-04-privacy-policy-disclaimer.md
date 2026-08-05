# 隐私政策与免责声明 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在单个个人中心入口中提供完整、可审查的隐私政策和非医疗免责声明，并在营养结果场景中保持可见提示。

**Architecture:** 新建只读 Taro 页面承载唯一的完整披露文本；个人中心卡片直接路由至该页面，现有注销页保持为删除操作的唯一入口。免责声明作为轻量复用文案，出现在首页及既有识别和教练结果页面，不引入服务端请求、权限或数据模型变化。

**Tech Stack:** Taro 4、React 18、TypeScript、SCSS、Vitest。

---

### Task 1: 添加政策页路由与个人中心单一入口

**Files:**
- Create: `mini-program/src/pages/privacy-policy/index.tsx`
- Create: `mini-program/src/pages/privacy-policy/index.config.ts`
- Modify: `mini-program/src/app.config.ts`
- Modify: `mini-program/src/pages/profile/index.tsx`
- Test: `mini-program/tests/privacy-policy.test.ts`

- [ ] **Step 1: 写入失败的入口与路由契约测试**

```ts
it("routes the only privacy card to the combined policy page", () => {
  expect(read("src/app.config.ts")).toContain('"pages/privacy-policy/index"');
  const profile = read("src/pages/profile/index.tsx");
  expect(profile).toContain('title="隐私政策与免责声明"');
  expect(profile).toContain('openPage("/pages/privacy-policy/index")');
  expect(profile).not.toContain('title="隐私与数据"');
});
```

- [ ] **Step 2: 运行测试，确认因页面和入口尚不存在而失败**

Run: `pnpm --dir mini-program exec vitest run tests/privacy-policy.test.ts`

Expected: FAIL，指出政策路由或入口标题缺失。

- [ ] **Step 3: 建立只读政策页，并将个人中心卡片改为路由入口**

```tsx
<PageLayout title="隐私政策与免责声明" showTabs={false} hideNavigation showBack>
  <View className="privacy-policy-page">
    <Text className="privacy-policy-page__title">隐私政策与免责声明</Text>
    <Text className="privacy-policy-page__lead">请在使用服务前了解我们如何处理你的信息。</Text>
  </View>
</PageLayout>
```

在 `app.config.ts` 的 `pages` 中加入 `"pages/privacy-policy/index"`；在个人中心删除旧 `privacy` BottomSheet，卡片点击改为 `openPage("/pages/privacy-policy/index")`。

- [ ] **Step 4: 重新运行入口与路由测试**

Run: `pnpm --dir mini-program exec vitest run tests/privacy-policy.test.ts`

Expected: PASS。

### Task 2: 补齐可审查披露与注销路径

**Files:**
- Modify: `mini-program/src/pages/privacy-policy/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Test: `mini-program/tests/privacy-policy.test.ts`

- [ ] **Step 1: 写入失败的披露内容测试**

```ts
it("discloses collection, purpose, retention, rights, deletion and medical boundary", () => {
  const policy = read("src/pages/privacy-policy/index.tsx");
  for (const copy of [
    "收集的信息", "使用目的", "存储与保留", "AI 处理", "你的权利",
    "注销 Nordic Nutri AI 产品账号", "不影响你的微信账号",
    "不构成医疗诊断、治疗或处方", "反馈与帮助",
  ]) expect(policy).toContain(copy);
});
```

- [ ] **Step 2: 运行测试，确认披露字段缺失**

Run: `pnpm --dir mini-program exec vitest run tests/privacy-policy.test.ts`

Expected: FAIL，指出缺少披露字段。

- [ ] **Step 3: 以分节卡片实现完整披露与跳转**

```tsx
<View className="privacy-policy-page__section">
  <Text>存储与保留</Text>
  <Text>数据通过 HTTPS 写入 CloudBase；在产品账号存续期间保留，注销成功后删除产品资料、记录和私有图片。</Text>
</View>
<View onClick={() => openPage("/pages/account-cancellation/index")}>
  <Text>注销 Nordic Nutri AI 产品账号 ›</Text>
</View>
```

使用已有的页面配色、卡片和间距 token；文案以“我的 → 反馈与帮助”为真实联系渠道，不制造邮箱或主体信息。

- [ ] **Step 4: 重新运行披露测试**

Run: `pnpm --dir mini-program exec vitest run tests/privacy-policy.test.ts`

Expected: PASS。

### Task 3: 在营养结果路径明确非医疗边界

**Files:**
- Modify: `mini-program/src/pages/home/index.tsx`
- Modify: `mini-program/src/pages/analysis-result/index.tsx`
- Modify: `mini-program/src/pages/coach/index.tsx`
- Test: `mini-program/tests/privacy-policy.test.ts`

- [ ] **Step 1: 写入失败的免责声明可见性测试**

```ts
it("keeps a visible non-medical disclaimer in home, analysis and coach", () => {
  for (const page of ["home/index.tsx", "analysis-result/index.tsx", "coach/index.tsx"]) {
    expect(read(`src/pages/${page}`)).toContain("不构成医疗诊断或治疗建议");
  }
});
```

- [ ] **Step 2: 运行测试，确认首页或识别结果当前缺少统一文案**

Run: `pnpm --dir mini-program exec vitest run tests/privacy-policy.test.ts`

Expected: FAIL，指出缺少免责声明的页面。

- [ ] **Step 3: 在现有内容区加入低干扰提示**

```tsx
<Text className="nutrition-disclaimer">
  营养识别与建议仅供日常饮食参考，不构成医疗诊断或治疗建议。
</Text>
```

教练页将既有提示统一为同一语义；首页与识别结果页面放在结果/内容区末尾，不覆盖按钮或影响操作流程。

- [ ] **Step 4: 重新运行免责声明测试**

Run: `pnpm --dir mini-program exec vitest run tests/privacy-policy.test.ts`

Expected: PASS。

### Task 4: 运行回归验证

**Files:**
- Verify only

- [ ] **Step 1: 执行目标测试、类型检查和构建**

Run:

```bash
pnpm --dir mini-program exec vitest run tests/privacy-policy.test.ts
pnpm --dir mini-program typecheck
pnpm --dir mini-program build:weapp
pnpm --dir mini-program verify:weapp
git diff --check
```

Expected: 所有命令退出码为 0。

- [ ] **Step 2: 记录真机验收边界**

在微信开发者工具中从“我的”打开政策页，核对注销跳转与三处免责声明；未完成真机检查时，不将其表述为已验收。
