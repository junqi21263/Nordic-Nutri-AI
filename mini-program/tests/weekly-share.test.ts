import { expect, it, vi } from 'vitest';
vi.mock('@tarojs/taro', () => ({ default: { getStorageSync: () => '', getAppBaseInfo: () => ({ language: 'en-US' }) } }));
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  chooseDifferentIllustrationIndex,
  getWeeklyIllustrationIndex,
  saveWeeklyIllustrationIndex,
  selectWeeklyIllustrationIndex,
  weeklyIllustrationUrls,
  WEEKLY_ILLUSTRATION_COUNT,
  weeklyShareLines,
  weeklyShareVariant,
} from '../src/pages/weekly-review/share-content';
import type { ProductWeeklyReview } from '../src/api/insight-api';
import { wrapPosterText } from '../src/pages/weekly-review/weekly-share-poster';

const weeklyShareSource = readFileSync(resolve(process.cwd(), 'src/pages/weekly-review/weekly-share.tsx'), 'utf8');
const weeklyPosterSource = readFileSync(resolve(process.cwd(), 'src/pages/weekly-review/weekly-share-poster.ts'), 'utf8');
const weeklyPageStyles = readFileSync(resolve(process.cwd(), 'src/pages/weekly-review/index.scss'), 'utf8');
const sharePreviewSource = readFileSync(resolve(process.cwd(), 'src/components/milestone-share-preview/index.tsx'), 'utf8');

it('exports only public weekly metrics, never profile or raw meals', () => {
  const report = { startDate: '2026-07-20', endDate: '2026-07-22', rhythm: [{ date: '2026-07-26' }], recordedDays: 3, recordedMeals: 8, longestRecordedStreak: 3,
    insight: { strengths: ['本周已记录3天'], nextSteps: ['每天记录一餐'] }, name: 'private-name', weight: 68, meals: ['private-meal'] };
  const lines = weeklyShareLines(report as unknown as ProductWeeklyReview);
  expect(lines.join('\n')).toContain('8');
  expect(lines.join('\n')).toContain('2026-07-26');
  expect(lines.join('\n')).not.toMatch(/private|68/);
});

it('keeps each week stable while varying only share-safe copy', () => {
  const variants = new Set<number>();
  for (const startDate of ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']) {
    const variant = weeklyShareVariant(startDate);
    expect(weeklyShareVariant(startDate)).toBe(variant);
    variants.add(variant);
    const report = { startDate, endDate: '2026-10-18', rhythm: [], recordedDays: 0, recordedMeals: 0 } as unknown as ProductWeeklyReview;
    const lines = weeklyShareLines(report);
    expect(weeklyShareLines(report)).toEqual(lines);
    expect(lines.join('\n')).not.toMatch(/没有吃饭|未进食|private/);
    expect(lines[2]).toContain('0');
  }
  expect(variants.size).toBeGreaterThan(1);
});

it('uses the 30 numbered weekly illustrations from the configured CDN root', () => {
  const illustrations = weeklyIllustrationUrls('https://cdn.example.test/');
  expect(illustrations).toHaveLength(30);
  expect(illustrations[0]).toBe('https://cdn.example.test/brand/weekly-illustrations/v1/weekly-01.jpg');
  expect(illustrations[29]).toBe('https://cdn.example.test/brand/weekly-illustrations/v1/weekly-30.jpg');
  expect(WEEKLY_ILLUSTRATION_COUNT).toBe(30);
  expect(new Set(illustrations).size).toBe(WEEKLY_ILLUSTRATION_COUNT);
  for (const startDate of ['2026-09-07', '2026-09-14', '2026-09-21']) {
    expect(selectWeeklyIllustrationIndex(startDate, illustrations.length)).toBe(
      selectWeeklyIllustrationIndex(startDate, illustrations.length),
    );
    expect(illustrations[selectWeeklyIllustrationIndex(startDate, illustrations.length)]).toMatch(
      /brand\/weekly-illustrations\/v1\/weekly-\d{2}\.jpg$/,
    );
  }
});

it('persists the selected illustration per week and refresh changes only that week', () => {
  const storage: Record<string, unknown> = {};
  const weekA = '2026-09-21';
  const weekB = '2026-09-28';
  const initialA = selectWeeklyIllustrationIndex(weekA, WEEKLY_ILLUSTRATION_COUNT);
  saveWeeklyIllustrationIndex(weekA, initialA, storage);
  saveWeeklyIllustrationIndex(weekB, 2, storage);

  const refreshedA = chooseDifferentIllustrationIndex(initialA, WEEKLY_ILLUSTRATION_COUNT);
  saveWeeklyIllustrationIndex(weekA, refreshedA, storage);

  expect(getWeeklyIllustrationIndex(weekA, storage)).toBe(refreshedA);
  expect(getWeeklyIllustrationIndex(weekB, storage)).toBe(2);
  expect(refreshedA).not.toBe(initialA);
  expect(refreshedA).toBeGreaterThanOrEqual(0);
  expect(refreshedA).toBeLessThan(WEEKLY_ILLUSTRATION_COUNT);
});

it('randomly selects another weekly illustration without repeating the current one', () => {
  expect(chooseDifferentIllustrationIndex(12, 30, () => 0)).toBe(0);
  expect(chooseDifferentIllustrationIndex(12, 30, () => 0.999999)).toBe(29);
  expect(chooseDifferentIllustrationIndex(0, 1, () => 0.5)).toBe(0);
});

it('loads illustrations on H5 and keeps weekly preview controls compact without the long-press hint', () => {
  expect(weeklyShareSource).toContain('new Image()');
  expect(weeklyShareSource).not.toContain('if (!canvasNode.createImage) return undefined');
  expect(weeklyPageStyles).toMatch(/milestone-share-preview__close[\s\S]*?width:\s*44px/);
  expect(weeklyPageStyles).toMatch(/milestone-share-preview__refresh[\s\S]*?width:\s*32px/);
  expect(sharePreviewSource).toContain('showHint?: boolean');
  expect(weeklyShareSource).toContain('showHint={false}');
});

it('matches the approved weekly poster header, brand icon and footer', () => {
  expect(weeklyPosterSource).toContain('wrapPosterText(ctx, data.seriesLabel, 480, 1)');
  expect(weeklyPosterSource).toContain('brandLogoImage?: CanvasImageSource');
  expect(weeklyPosterSource).toContain('ctx.drawImage(brandLogoImage');
  expect(weeklyPosterSource).not.toContain('MINDFUL EATING MADE GENTLE');
  expect(weeklyPosterSource).not.toContain('qrCodeImage');
  expect(weeklyShareSource).toContain('nordic-nutri-logo.png');
  expect(weeklyShareSource).not.toContain('miniprogram-code.jpg');
  expect(weeklyPosterSource).toContain('box(ctx, 64, footerY, 592, 110, 20, "#f3f4f1")');
});

it('aligns the footer card with the content above and bounds variable copy to its card', () => {
  expect(weeklyPosterSource).toContain('box(ctx, 64, footerY, 592, 110, 20, "#f3f4f1")');
  expect(weeklyPosterSource).toContain('wrapPosterText(ctx, label, cellW - 40, 1)');
  expect(weeklyPosterSource).toContain('wrapPosterText(ctx, value, cellW - 46 - suffixWidth, 1)');
  expect(weeklyPosterSource).toContain('wrapPosterText(ctx, data.seriesLabel, 480, 1)');
  expect(weeklyPosterSource).toContain('wrapPosterText(ctx, data.highlightTitle || t("share.highlight"), 500, 1)');
  expect(weeklyPosterSource).toContain('wrapPosterText(ctx, data.highlightCopy, 520, 3)');
  expect(weeklyPosterSource).toContain('wrapPosterText(ctx, data.nextGoal, 520, 3)');
  expect(weeklyPosterSource).toContain('wrapPosterText(ctx, data.footerTagline, 548, 1)');
});

it('truncates overly long poster text with an ellipsis within the requested line limit', () => {
  const context = {
    measureText: (text: string) => ({ width: Array.from(text).length * 10 }),
  } as CanvasRenderingContext2D;

  const lines = wrapPosterText(context, '一二三四五六七八九十十一十二十三', 30, 2);

  expect(lines).toHaveLength(2);
  expect(lines[1]).toMatch(/…$/);
  expect(lines.every((line) => context.measureText(line).width <= 30)).toBe(true);
});
