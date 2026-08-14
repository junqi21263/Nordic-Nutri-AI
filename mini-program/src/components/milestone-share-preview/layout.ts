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
