export const MILESTONE_POSTER_CANVAS_WIDTH = 1080;
/**
 * The share file is intentionally more compact than the in-app poster.  All
 * preview, save, and share paths use this exact 5:8 bitmap without reflowing
 * its content.
 */
export const MILESTONE_POSTER_CANVAS_HEIGHT = 1728;
/** 37% illustration area, reserved before the remote image is decoded. */
export const MILESTONE_POSTER_HERO_HEIGHT = 640;
/** Keep the paper footer compact; scale its brand group rather than this area. */
export const MILESTONE_POSTER_FOOTER_HEIGHT = 288;
export const MILESTONE_POSTER_FOOTER_QR_SIZE = 180;
export const MILESTONE_POSTER_FOOTER_LOGO_SIZE = 48;
export const MILESTONE_POSTER_FOOTER_COPY_TO_QR_GAP = 32;

export type MilestonePosterImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getMilestonePosterImageRect(imageWidth: number, imageHeight: number): MilestonePosterImageRect {
  const scale = Math.max(
    MILESTONE_POSTER_CANVAS_WIDTH / imageWidth,
    MILESTONE_POSTER_HERO_HEIGHT / imageHeight,
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (MILESTONE_POSTER_CANVAS_WIDTH - width) / 2,
    y: (MILESTONE_POSTER_HERO_HEIGHT - height) / 2,
    width,
    height,
  };
}
