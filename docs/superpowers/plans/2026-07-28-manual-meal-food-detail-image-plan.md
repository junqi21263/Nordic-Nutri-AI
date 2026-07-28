# 手动记录入口与食物详情图片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除手动记录页的重复入口，并把已有食物详情图以 C 方案放入食物详情页，同时保持营养计算、版本切换和保存流程不变。

**Architecture:** 仅修改小程序前端。手动记录页删除两个视觉入口但保留选择结果和表单；食物详情页继续复用 `FoodThumbnail`，通过 `prefer="detail"` 优先显示审核主图，图片缺失或加载失败时使用既有分类占位图。后端接口和数据库不变。

**Tech Stack:** Taro + React + TypeScript, SCSS, Vitest, Webpack WeChat build.

---

### Task 1: 为页面改动补充回归断言

**Files:**
- Create: `mini-program/tests/manual-meal-food-detail-image.test.ts`

- [ ] **Step 1: 检查现有页面测试结构和测试脚本**

Run:

```bash
rg --files mini-program/src/pages | rg 'manual-meal|food-detail'
rg -n "ManualMealPage|FoodDetailPage|FoodThumbnail|prefer=|补充这一餐|标准食物库" mini-program/src --glob '*.test.*' --glob '*.tsx'
cat mini-program/package.json
```

Expected: 确认项目使用 Vitest；本次测试采用现有测试中使用的源码断言风格，不引入新的测试框架。

- [ ] **Step 2: 写出失败的最小回归测试**

在 `mini-program/tests/manual-meal-food-detail-image.test.ts` 中使用 `readFileSync` 和 `resolve`，测试必须验证：

```ts
// manual-meal: 页面源码不再渲染两个已删除文案，且仍保留 selectedFood 结构。
// food-detail: FoodThumbnail 传入 prefer="detail"，且图片位于 identity 后、portion 前。
```

断言只针对页面结构和稳定文案，不引入 JSX renderer 或额外依赖。

- [ ] **Step 3: 单独运行新增测试确认失败**

Run:

```bash
pnpm --dir mini-program test:unit -- manual-meal food-detail
```

Expected: 新增断言在实现前失败，失败原因对应页面仍含待删除区域或详情图尚未使用 `prefer="detail"`。

### Task 2: 修改手动记录页并同步样式

**Files:**
- Modify: `mini-program/src/pages/manual-meal/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: 删除重复视觉区域**

从 `ManualMealPage` 中删除：

```tsx
<View className="manual-meal__page-title">
  <Text>补充这一餐</Text>
</View>
<Text className="manual-meal__description">不方便拍照时，也能快速把饮食节奏记下来。</Text>
<View className="manual-meal__catalog-link" ...>
  ...
</View>
```

同时删除不再使用的 `NordicIcon` import；保留 `FoodThumbnail`、选中食物卡片、表单、保存操作和返回逻辑。

- [ ] **Step 2: 清理对应样式**

删除只服务于上述标题、说明和标准食物库入口的样式规则；保留 `.manual-meal__selected-food*`、表单、底部操作和页面间距规则。不要改动通用组件样式。

- [ ] **Step 3: 运行手动记录回归测试**

Run:

```bash
pnpm --dir mini-program test:unit -- manual-meal
```

Expected: 手动记录相关测试通过，页面源码不再出现两个删除文案。

### Task 3: 将详情图片调整为 C 方案

**Files:**
- Modify: `mini-program/src/pages/food-detail/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: 调整 JSX 顺序和图片偏好**

在食物详情页将结构调整为：

```tsx
<View className="food-detail-page__identity food-detail-page__identity--split">...</View>
<View className="food-detail-page__hero food-detail-page__hero--wide">
  <FoodThumbnail
    className="food-detail-page__image"
    food={displayedFood}
    iconSize={40}
    prefer="detail"
  />
</View>
<View className="food-detail-page__portion">...</View>
```

删除原先位于 identity 之前的 hero，确保版本切换后 `displayedFood` 的图片自动更新。

- [ ] **Step 2: 调整 C 方案横向视觉**

保持 `.food-detail-page__image` 的可用性和回退类名，调整图片容器为横向辅助视觉：高度约 `150px`，宽度 `100%`，沿用当前圆角、背景和 `aspectFill`；不要改变营养卡片、按钮和占位图组件行为。

- [ ] **Step 3: 运行详情页回归测试**

Run:

```bash
pnpm --dir mini-program test:unit -- food-detail
```

Expected: 详情页图片优先使用 `detailUrl`，无图/加载失败仍回退到分类图标；份量和版本切换测试保持通过。

### Task 4: 完整验证和构建

**Files:**
- No additional source files.

- [ ] **Step 1: 运行前端完整单元测试**

Run:

```bash
pnpm --dir mini-program test:unit
```

Expected: 所有测试通过。

- [ ] **Step 2: 运行类型检查和微信构建**

Run:

```bash
pnpm --dir mini-program typecheck
pnpm --dir mini-program run build:weapp
pnpm --dir mini-program run verify:weapp
```

Expected: TypeScript、Webpack 和 WXSS 兼容性检查全部成功。

- [ ] **Step 3: 检查格式、差异和工作区范围**

Run:

```bash
git diff --check
git status --short
```

Expected: 无空白错误；只包含本次页面、样式、测试和计划/规格文件，不包含构建产物或无关改动。

### Task 5: 提交并发布主环境函数

**Files:**
- Modify: only files listed in Tasks 1–3.

- [ ] **Step 1: 提交前确认代码和构建通过**

确认 Task 4 全部通过后提交：

```bash
git add mini-program/src/pages/manual-meal/index.tsx mini-program/src/pages/food-detail/index.tsx mini-program/src/styles/page.scss mini-program/tests/manual-meal-food-detail-image.test.ts
git commit -m "fix: simplify manual meal and show food detail images"
```

- [ ] **Step 2: 只更新主环境 `get-login-ticket` 云函数代码**

使用 CloudBase MCP：

```js
manageFunctions({
  action: "updateFunctionCode",
  functionName: "get-login-ticket",
  functionRootPath: "/Users/lewis/Documents/Nordic-Nutri-AI/cloudbase/functions"
})
```

不传 `envVariables`、`func` 或配置覆盖参数，确保原有环境变量和运行时配置不变。

- [ ] **Step 3: 验证主环境函数发布状态**

使用：

```js
queryFunctions({
  action: "getFunctionDetail",
  functionName: "get-login-ticket"
})
```

Expected: Namespace 为 `lewis-healthy-d4glgqqzv73a5bc10`，`Status=Active`，`AvailableStatus=Available`，`CodeResult=success`。

- [ ] **Step 4: 交付说明**

说明页面代码已构建、函数已发布；明确本次未上传小程序，微信开发者工具仍需重新导入/编译 `mini-program/dist/weapp/` 才能看到前端页面变化。
