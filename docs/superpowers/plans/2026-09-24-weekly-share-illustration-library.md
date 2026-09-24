# Nordic Weekly Illustration Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Inline execution in the current task, as explicitly requested by the user. Work in checkpointed batches; preserve unrelated existing changes.

**Goal:** Generate and publish 30 Nordic-style weekly-share illustrations, then make the card use illustrations only with a refresh control that persists the chosen image per week.

**Architecture:** Host numbered JPGs under the user-confirmed CloudBase Hosting prefix, use the existing milestone CDN root, and select one stable image per week using local storage. Real meal photos are never loaded into the share card. A refresh action chooses a different image and updates the same week's saved selection; the existing bundled image remains the offline fallback.

**Tech Stack:** Built-in image generation, Taro/React, TypeScript/Vitest, CloudBase CLI static Hosting, macOS `sips` for image conversion, `curl` for public readback.

---

## File map

- Create `cloudbase/hosting/brand/weekly-illustrations/v1/weekly-01.jpg` … `weekly-30.jpg`: generated source files deployed to the approved static Hosting path; this directory is outside the mini-program asset tree.
- Modify `mini-program/src/pages/weekly-review/share-content.ts`: expose the 30 CDN URLs and deterministic initial index while retaining the existing copy variants.
- Create `mini-program/src/pages/weekly-review/weekly-illustration-selection.ts`: pure per-week index selection/persistence helpers, with a small injected storage interface for tests.
- Modify `mini-program/src/pages/weekly-review/weekly-share.tsx` and `index.tsx`: remove real meal-photo input, load only the selected illustration, use the existing bundled image as fallback, and persist refresh selections.
- Modify `mini-program/src/components/milestone-share-preview/index.tsx` and `mini-program/src/styles/page.scss`: optional refresh affordance positioned over the embedded hero illustration's top-right corner (not the close control); only weekly share supplies the callback.
- Modify `mini-program/tests/weekly-share.test.ts`: cover stable initial selection, independent per-week persistence, and refresh choosing a different index.

## Checkpoint 1 — Generate and inspect illustrations

- [ ] Generate 30 separate landscape images with one consistent Nordic editorial food-illustration look; use the existing bundled weekly image as a visual reference and the supplied poster as a layout reference.
- [ ] Keep all images free of text, logo, watermark, people, and nutrition/health claims. Scenes, in file order: berry oat bowl; rye toast with berries; spinach and egg toast; salmon-cucumber open sandwich; apple-cinnamon porridge; mushroom barley soup; roasted roots and grains; peach yogurt bowl; herb fish and potatoes; beet and walnut salad; pea soup with crispbread; blueberry pancakes; pear and cottage cheese; lentil-carrot stew; avocado and egg rye; roasted carrots with grains; Nordic fish stew; squash and barley bowl; berry kefir bowl; crispbread with egg and chives; baked apple oats; salmon-dill grain bowl; cabbage-apple salad; warm potato-dill salad; cranberry-almond oats; green pea grain bowl; roasted vegetable sandwich; spinach-mushroom omelet; root vegetable soup; quiet tea-and-granola breakfast.
- [ ] Generate in six batches of five; inspect each batch for consistency, distinct scenes, crop safety, and malformed artifacts before continuing.
- [ ] Save converted assets as `cloudbase/hosting/brand/weekly-illustrations/v1/weekly-NN.jpg`, preserving the current bundled fallback. Ensure each image decodes and has a landscape aspect ratio suitable for the poster's 592×294 hero crop.

Checkpoint: exactly 30 local JPGs, no changes to existing files.

## Checkpoint 2 — Selection and persistence tests first

- [ ] Extend `mini-program/tests/weekly-share.test.ts` with tests that fail until selection behavior exists:

```ts
it("keeps the saved illustration isolated by week", () => {
  const values = new Map<string, unknown>();
  const storage = {
    getStorageSync: (key: string) => values.get(key),
    setStorageSync: (key: string, value: unknown) => values.set(key, value),
  };
  saveWeeklyIllustrationIndex("2026-09-21", 7, storage);
  saveWeeklyIllustrationIndex("2026-09-28", 12, storage);
  expect(getWeeklyIllustrationIndex("2026-09-21", storage)).toBe(7);
  expect(getWeeklyIllustrationIndex("2026-09-28", storage)).toBe(12);
});

it("chooses a different illustration on refresh", () => {
  expect(chooseDifferentIllustrationIndex(4, 30, () => 0)).toBe(0);
  expect(chooseDifferentIllustrationIndex(4, 30, () => 0.2)).not.toBe(4);
});
```

- [ ] Run `pnpm --dir mini-program test:unit -- tests/weekly-share.test.ts`; confirm the new cases fail for the missing helpers.
- [ ] Implement the smallest helpers in `weekly-illustration-selection.ts`: stable date hash for the initial index, validated per-week storage reads/writes, and a random next-index function that excludes the current index.
- [ ] Re-run the focused test and confirm it passes; retain the existing copy-variant and privacy tests.

## Checkpoint 3 — Wire weekly-only illustration refresh

- [ ] Add a 30-entry URL list using `process.env.TARO_APP_MILESTONE_ASSET_CDN` and the exact `/brand/weekly-illustrations/v1/weekly-NN.jpg` paths.
- [ ] In `weekly-share.tsx`, initialize the artwork index from storage using `review.startDate`; never call `selectWeeklyHeroImage` or use `heroImage`. Load the selected CDN art and retain the bundled illustration fallback on initial load.
- [ ] Add an optional `onRefreshIllustration` prop to `MilestoneSharePreview`. Render a 44×44-or-larger hit target using the existing `NordicIcon` `refresh-cw`, aligned to the top-right of the hero crop within the poster frame; keep it absent for milestone previews.
- [ ] On refresh, choose a different index, load/check the CDN image before committing the new index, save only after it is usable, and regenerate the poster. If loading fails, keep the current poster and selection.
- [ ] Add/adjust focused tests for URL count/uniqueness and ensure the weekly card does not pass real meal-photo data.
- [ ] Run focused tests plus `pnpm --dir mini-program typecheck`.

Checkpoint: weekly share preview visibly refreshes among illustrations; same-week selection survives close/reopen; milestone preview is unchanged.

## Checkpoint 4 — Upload only to the confirmed CDN prefix

- [ ] Read-only check the exact destination first: `tcb hosting list /brand/weekly-illustrations/v1 --env-id lewis-healthy-d4glgqqzv73a5bc10 --json`. If any numbered target names already exist, stop rather than overwrite.
- [ ] Upload the new local directory only: `tcb hosting deploy cloudbase/hosting/brand/weekly-illustrations/v1 /brand/weekly-illustrations/v1 --env-id lewis-healthy-d4glgqqzv73a5bc10`.
- [ ] Verify the remote listing contains all 30 numbered JPGs, then issue HTTPS HEAD/GET checks for each CDN URL and confirm success, `image/jpeg`, and nonzero content length. Do not deploy functions, databases, Mini Program builds, or APKs.

Checkpoint: 30 public CDN assets verified under the confirmed prefix and nowhere else.

## Checkpoint 5 — Final verification

- [ ] Run `pnpm --dir mini-program test:unit -- tests/weekly-share.test.ts`.
- [ ] Run `pnpm --dir mini-program typecheck` and `pnpm --dir mini-program build:h5`.
- [ ] Inspect the final Git diff and stage only this plan, the new illustration files, and the directly related weekly-share implementation/tests. Report H5 build and CDN availability separately from Android device/ APK visual acceptance.

## Self-review

- Spec coverage: 30 distinct images, approved CDN/environment/path, no real meal photos, same-week persistence, refresh button, offline fallback, tests, and no backend/schema changes are all assigned above.
- No placeholders: commands, scenes, file paths, and test expectations are explicit.
- Type consistency: storage helper signatures used by tests will accept `getStorageSync`/`setStorageSync`; component imports the same selection helpers.
