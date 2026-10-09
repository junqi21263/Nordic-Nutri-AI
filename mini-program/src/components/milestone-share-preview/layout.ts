import {
  MILESTONE_POSTER_CANVAS_HEIGHT,
  MILESTONE_POSTER_CANVAS_WIDTH,
} from "../milestone-poster-canvas/layout";

/** 30% larger than the previous 286px preview while retaining the 5:8 export ratio. */
export const MILESTONE_SHARE_PREVIEW_WIDTH = 372;

export function getMilestoneSharePreviewDimensions() {
  return {
    width: MILESTONE_SHARE_PREVIEW_WIDTH,
    height: Math.round(
      MILESTONE_SHARE_PREVIEW_WIDTH * MILESTONE_POSTER_CANVAS_HEIGHT / MILESTONE_POSTER_CANVAS_WIDTH,
    ),
  };
}

export function getWeeklySharePreviewDimensions(
  windowWidth: number,
  windowHeight: number,
  topOffset = 0,
  aspectRatio = 3 / 4,
) {
  const ratio = aspectRatio > 0 ? aspectRatio : 3 / 4;
  const width = Math.max(
    0,
    Math.min(360, windowWidth - 48, (windowHeight - topOffset - 184) * ratio),
  );
  return { width, height: width / ratio };
}
