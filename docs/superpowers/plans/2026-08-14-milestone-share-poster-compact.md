# 紧凑型里程碑分享海报 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付唯一生成的 1080×1728（5:8）海报，让预览、保存与微信分享使用同一张图片。

**Architecture:** `MilestonePosterCanvas` 用固定 Canvas 绘制海报并暴露导出函数。页面保存导出的一个临时路径；`MilestoneSharePreview` 只以 `aspectFit` 缩放该路径，操作 UI 不进入图片。

**Tech Stack:** Taro React、微信小程序 Canvas 2D、SCSS、Vitest。

---

### Task 1: 固定导出画布比例与版式分区

**Files:**
- Modify: `mini-program/src/components/milestone-poster-canvas/layout.ts`
- Test: `mini-program/tests/milestone-poster-canvas-layout.test.ts`

- [ ] **Step 1: 写入会失败的尺寸测试**

```ts
it("uses the fixed compact 5:8 export composition", () => {
  expect(MILESTONE_POSTER_CANVAS_WIDTH).toBe(1080);
  expect(MILESTONE_POSTER_CANVAS_HEIGHT).toBe(1728);
  expect(MILESTONE_POSTER_HERO_HEIGHT / MILESTONE_POSTER_CANVAS_HEIGHT).toBeCloseTo(0.37, 2);
  expect(MILESTONE_POSTER_FOOTER_HEIGHT / MILESTONE_POSTER_CANVAS_HEIGHT).toBeCloseTo(0.16, 1);
});
```

- [ ] **Step 2: 验证 RED**

Run: `npm run test:unit -- tests/milestone-poster-canvas-layout.test.ts`

Expected: 旧 1080×1920 或非 5:8 实现因尺寸断言失败。

- [ ] **Step 3: 写入最小实现**

```ts
export const MILESTONE_POSTER_CANVAS_WIDTH = 1080;
export const MILESTONE_POSTER_CANVAS_HEIGHT = 1728;
export const MILESTONE_POSTER_HERO_HEIGHT = 640;
export const MILESTONE_POSTER_FOOTER_HEIGHT = 288;
export const MILESTONE_POSTER_FOOTER_QR_SIZE = 120;
export const MILESTONE_POSTER_FOOTER_LOGO_SIZE = 32;
export const MILESTONE_POSTER_FOOTER_COPY_TO_QR_GAP = 28;
```

- [ ] **Step 4: 验证 GREEN**

Run: `npm run test:unit -- tests/milestone-poster-canvas-layout.test.ts`

Expected: 退出码 0。

- [ ] **Step 5: 仅提交本任务文件**

```bash
git add mini-program/src/components/milestone-poster-canvas/layout.ts mini-program/tests/milestone-poster-canvas-layout.test.ts
git commit -m "feat: compact milestone poster canvas"
```

### Task 2: 绘制连续正文和右对齐 Footer

**Files:**
- Modify: `mini-program/src/components/milestone-poster-canvas/index.tsx`
- Test: `mini-program/tests/milestone-share-preview.test.ts`

- [ ] **Step 1: 写入会失败的 Footer 结构测试**

```ts
it("exports a right-aligned brand footer", () => {
  expect(canvasSource).toContain("drawBrandFooter");
  expect(canvasSource).toContain('context.textAlign = "right"');
  expect(canvasSource).toContain("每一次记录，都算数");
  expect(canvasSource).toContain("扫码开始记录");
  expect(canvasSource).toContain("miniprogram-code.jpg");
});
```

- [ ] **Step 2: 验证 RED**

Run: `npm run test:unit -- tests/milestone-share-preview.test.ts`

Expected: 旧的左侧独立 Logo/Footer 或缺少 QR 会失败。

- [ ] **Step 3: 写入最小 Canvas Footer**

```ts
const footerTop = height - MILESTONE_POSTER_FOOTER_HEIGHT;
const qrX = width - padding - MILESTONE_POSTER_FOOTER_QR_SIZE;
const copyRight = qrX - MILESTONE_POSTER_FOOTER_COPY_TO_QR_GAP;
context.textAlign = "right";
context.fillText("Nordic Nutri AI", copyRight, footerTop + 92);
context.fillText("每一次记录，都算数", copyRight, footerTop + 134);
context.fillText("扫码开始记录", copyRight, footerTop + 172);
context.drawImage(miniProgramCode, qrX, qrY, 120, 120);
```

Logo 只作为品牌名同行的 32px 标识；`journeyTop` 从 Highlights 连续计算，不能用内容空白推 Footer。

- [ ] **Step 4: 验证 GREEN**

Run: `npm run test:unit -- tests/milestone-share-preview.test.ts`

Expected: 退出码 0。

- [ ] **Step 5: 仅提交本任务文件**

```bash
git add mini-program/src/components/milestone-poster-canvas/index.tsx mini-program/tests/milestone-share-preview.test.ts
git commit -m "feat: align milestone poster footer"
```

### Task 3: Preview 仅缩放同一导出图片

**Files:**
- Modify: `mini-program/src/components/milestone-share-preview/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/src/pages/milestone-poster/index.tsx`
- Test: `mini-program/tests/milestone-poster-size.test.ts`
- Test: `mini-program/tests/milestone-poster-exporter-state.test.ts`

- [ ] **Step 1: 写入会失败的 Preview 尺寸测试**

```ts
it("keeps the share preview as a compact floating poster", () => {
  expect(pageStyles).toContain("width: 76vw;");
  expect(pageStyles).toContain("max-width: 300px;");
  expect(pageStyles).toContain("aspect-ratio: 5 / 8;");
});
```

- [ ] **Step 2: 验证 RED**

Run: `npm run test:unit -- tests/milestone-poster-size.test.ts tests/milestone-poster-exporter-state.test.ts`

Expected: 近全屏预览或不稳定 exporter 会失败。

- [ ] **Step 3: 写入最小 Preview 实现**

```tsx
<View className="milestone-share-preview__poster-frame">
  <Image className="milestone-share-preview__image" src={path} mode="aspectFit" showMenuByLongpress />
</View>
```

```scss
.milestone-share-preview__poster-frame {
  aspect-ratio: 5 / 8;
  max-height: calc(100vh - 230px);
  max-width: 300px;
  width: 76vw;
}
```

页面用同一个 `path` 传给 Preview、`showShareImageMenu({ path })` 和 `saveImageToPhotosAlbum({ filePath: path })`。

- [ ] **Step 4: 验证 GREEN**

Run: `npm run test:unit -- tests/milestone-poster-size.test.ts tests/milestone-poster-exporter-state.test.ts tests/milestone-share-preview.test.ts`

Expected: 退出码 0。

- [ ] **Step 5: 仅提交本任务文件**

```bash
git add mini-program/src/components/milestone-share-preview/index.tsx mini-program/src/styles/page.scss mini-program/src/pages/milestone-poster/index.tsx mini-program/tests/milestone-poster-size.test.ts mini-program/tests/milestone-poster-exporter-state.test.ts
git commit -m "feat: compact milestone share preview"
```

### Task 4: 构建与分级验收

**Files:**
- Verify: `mini-program/tests/milestone-*.test.ts`
- Verify: `mini-program/dist/weapp/`

- [ ] **Step 1: 执行全部里程碑测试**

Run: `npm run test:unit -- tests/milestone-*.test.ts`

Expected: 退出码 0。

- [ ] **Step 2: 构建微信小程序**

Run: `npm run build:weapp:dev && npm run verify:weapp`

Expected: 两个命令均以退出码 0 完成。

- [ ] **Step 3: 在 DevTools 检查 390、393、430px**

打开 `mini-program/dist/weapp/`，每个视口都确认：完整 5:8 海报、最大 300px、明显遮罩边距、Progress 紧接 Footer、右对齐 Copy、QR 最右，以及操作 UI 不在导出图片内。

- [ ] **Step 4: 记录验收等级**

自动化与构建通过仅表示代码与产物通过；三种视口均已实际检查才可标为 DevTools 视觉验收通过；未连接设备不得宣称真机验收。

- [ ] **Step 5: 最终范围检查与提交**

```bash
git diff --check
git status --short
git add mini-program/src/components/milestone-poster-canvas mini-program/src/components/milestone-share-preview mini-program/src/pages/milestone-poster mini-program/src/styles/page.scss mini-program/tests/milestone-poster-canvas-layout.test.ts mini-program/tests/milestone-share-preview.test.ts mini-program/tests/milestone-poster-size.test.ts mini-program/tests/milestone-poster-exporter-state.test.ts
git commit -m "feat: refine milestone share poster"
```
