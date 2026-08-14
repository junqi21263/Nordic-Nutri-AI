import { describe, expect, it } from "vitest";
import {
  getMilestonePosterImageRect,
  MILESTONE_POSTER_CANVAS_HEIGHT,
  MILESTONE_POSTER_CANVAS_WIDTH,
  MILESTONE_POSTER_FOOTER_HEIGHT,
  MILESTONE_POSTER_FOOTER_LOGO_SIZE,
  MILESTONE_POSTER_FOOTER_QR_SIZE,
  MILESTONE_POSTER_HERO_HEIGHT,
} from "../src/components/milestone-poster-canvas/layout";

describe("milestone poster share canvas layout", () => {
  it("uses the fixed compact 5:8 export composition", () => {
    expect(MILESTONE_POSTER_CANVAS_WIDTH).toBe(1080);
    expect(MILESTONE_POSTER_CANVAS_HEIGHT).toBe(1728);
    expect(MILESTONE_POSTER_HERO_HEIGHT).toBe(640);
    expect(MILESTONE_POSTER_HERO_HEIGHT / MILESTONE_POSTER_CANVAS_HEIGHT).toBeCloseTo(0.37, 2);
    expect(MILESTONE_POSTER_FOOTER_HEIGHT / MILESTONE_POSTER_CANVAS_HEIGHT).toBeCloseTo(0.17, 1);
  });

  it("keeps the footer compact while enlarging its right-aligned brand group", () => {
    expect(MILESTONE_POSTER_FOOTER_QR_SIZE).toBeGreaterThanOrEqual(176);
    expect(MILESTONE_POSTER_FOOTER_QR_SIZE).toBeLessThanOrEqual(184);
    expect(MILESTONE_POSTER_FOOTER_LOGO_SIZE).toBeGreaterThanOrEqual(46);
    expect(MILESTONE_POSTER_FOOTER_LOGO_SIZE).toBeLessThanOrEqual(50);
  });

  it("cover-fits the illustration across the complete hero box without white side gutters", () => {
    const rect = getMilestonePosterImageRect(600, 448);
    expect(rect.width).toBe(MILESTONE_POSTER_CANVAS_WIDTH);
    expect(rect.height).toBeGreaterThan(MILESTONE_POSTER_HERO_HEIGHT);
    expect(rect.y).toBeLessThan(0);
  });
});
