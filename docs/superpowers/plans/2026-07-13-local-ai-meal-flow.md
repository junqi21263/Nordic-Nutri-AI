# Nordic Nutri AI Local AI Meal Flow Implementation Plan

> **For agentic workers:** Execute inline with test-first steps. Do not add AI, networking, Supabase, Storage, login, Edge Functions, or database behavior.

**Goal:** 以 local fixture 和 Zustand 模拟从餐盘扫描、分析、份量调整到保存餐次的核心体验。

**Architecture:** Scanner、Analysis 与 Portion Draft 各自持有短生命周期的本地 UI state；餐次保存时把比例调整后的 ingredient items 写入既有 mealStore，所有营养值由 items 派生。

**Tech Stack:** Taro React、TypeScript、Zustand、Vitest、Sass。

---

### Task 1: Test-first fixture and calculation contract

- [x] 写入失败测试：随机候选数量、至少 20 种餐品、份量比例、评分、保存到 mealStore、reset 与无网络调用。
- [x] 建立 scanner domain fixtures、营养比例与 score 函数。

### Task 2: Local flow stores

- [x] 增加 scannerStore、analysisStore、portionDraftStore，均只保存本地非敏感 UI state。
- [x] 保存转换为标准 Meal 与 items，并调用 mealStore.addMeal。

### Task 3: Three flow pages

- [x] Food Scanner：相机视觉预览、取景框、闪光/相册/关闭控制与随机本地 capture。
- [x] Analysis Result：置信度、食材、评分、规则洞察、重拍、调整和保存。
- [x] Portion Adjustment：Slider、±25/50/100% 和实时宏量/评分预览。

### Task 4: Verification

- [x] 执行 TypeScript、ESLint、Prettier、Vitest、静态无网络检查与 WeApp 构建。
